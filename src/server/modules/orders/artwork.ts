import { and, asc, desc, eq, sql } from "drizzle-orm";
import { artworkFiles, fileObjects, orders, users } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, can, inTx } from "@/server/core/context";
import { forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { emit } from "@/server/events/outbox";
import { refreshOrder } from "@/server/modules/workflow/engine";
import { assertOwnFiles } from "./create";
import { loadOrder, orderEvent, type Order } from "./state";

const CLOSED = ["REJECTED", "CANCELLED", "DELIVERED"];
const DESIGN_STATUSES = ["DESIGN_REQUESTED", "DESIGN_IN_PROGRESS"];

async function nextVersionNo(ctx: Ctx, orderId: string) {
  const [{ max }] = (await ctx.db.select({ max: sql<number>`coalesce(max(${artworkFiles.versionNo}), 0)::int` }).from(artworkFiles).where(eq(artworkFiles.orderId, orderId))) as [{ max: number }];
  return max + 1;
}

/**
 * Adds files as new versions. Customer files go to review (unless the order
 * is waiting for the printing house's design); designer files are drafts
 * until the designer marks the design complete.
 */
export async function addArtworkVersions(ctx: Ctx, o: Order, fileIds: readonly string[], note: string | null) {
  const source = ctx.actor.kind === "customer" ? "CUSTOMER" : "DESIGNER";
  let no = await nextVersionNo(ctx, o.id);
  for (const fileId of fileIds) await ctx.db.insert(artworkFiles).values({ orderId: o.id, versionNo: no++, source, fileId, note, uploadedBy: actorUserId(ctx) });
  if (source === "CUSTOMER") {
    // Earlier unreviewed customer files are replaced by the new upload.
    await ctx.db.update(artworkFiles).set({ status: "SUPERSEDED" }).where(and(eq(artworkFiles.orderId, o.id), eq(artworkFiles.source, "CUSTOMER"), eq(artworkFiles.status, "UPLOADED"), sql`${artworkFiles.versionNo} < ${no - fileIds.length}`));
    if (!DESIGN_STATUSES.includes(o.artworkStatus)) await ctx.db.update(orders).set({ artworkStatus: "AWAITING_REVIEW" }).where(eq(orders.id, o.id));
    await orderEvent(ctx, { orderId: o.id, domain: "ARTWORK", type: "CUSTOMER_FILE", message: "فایل جدید بارگذاری شد", visibleToCustomer: true });
    await emit(ctx, "ArtworkUploaded", { type: "order", id: o.id }, { orderId: o.id });
  } else {
    await orderEvent(ctx, { orderId: o.id, domain: "ARTWORK", type: "DESIGN_FILE", message: "فایل طراحی بارگذاری شد" });
  }
}

export async function uploadArtwork(ctx: Ctx, orderId: string, input: { fileIds: string[]; note?: string | null }) {
  if (input.fileIds.length === 0) throw validation("فایلی انتخاب نشده است.");
  if (ctx.actor.kind === "staff" && !can(ctx, "design.work") && !can(ctx, "artwork.review")) throw forbidden();
  await assertOwnFiles(ctx, input.fileIds, ["ARTWORK", "DESIGN"]);
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (CLOSED.includes(o.status)) throw invalidState("این سفارش بسته شده است.");
    await addArtworkVersions(tx, o, input.fileIds, input.note?.trim() || null);
  });
}

/** Approves a file for print, or asks the customer for a corrected file. */
export async function reviewArtwork(ctx: Ctx, artworkId: string, input: { approve: boolean; note?: string | null }) {
  assertCan(ctx, "artwork.review");
  return inTx(ctx, async (tx) => {
    const [a] = await tx.db.select().from(artworkFiles).where(eq(artworkFiles.id, artworkId)).for("update");
    if (!a) throw notFound("فایل");
    const o = await loadOrder(tx, a.orderId, { lock: true });
    if (CLOSED.includes(o.status)) throw invalidState("این سفارش بسته شده است.");
    if (a.status !== "UPLOADED") throw invalidState("این نسخه قبلاً بررسی شده است.");
    const note = input.note?.trim() || null;
    if (input.approve) {
      await tx.db.update(artworkFiles).set({ status: "SUPERSEDED" }).where(and(eq(artworkFiles.orderId, o.id), eq(artworkFiles.status, "APPROVED")));
      await tx.db.update(artworkFiles).set({ status: "APPROVED", reviewedBy: actorUserId(tx), reviewedAt: new Date(), reviewNote: note }).where(eq(artworkFiles.id, a.id));
      await tx.db.update(orders).set({ artworkStatus: "APPROVED" }).where(eq(orders.id, o.id));
      await orderEvent(tx, { orderId: o.id, domain: "ARTWORK", type: "APPROVED", message: "فایل برای چاپ تأیید شد", visibleToCustomer: true });
    } else {
      if (!note) throw validation("ایراد فایل را برای مشتری بنویسید.");
      await tx.db.update(artworkFiles).set({ status: "REJECTED", reviewedBy: actorUserId(tx), reviewedAt: new Date(), reviewNote: note }).where(eq(artworkFiles.id, a.id));
      await tx.db.update(orders).set({ artworkStatus: "NEEDS_CORRECTION" }).where(eq(orders.id, o.id));
      await orderEvent(tx, { orderId: o.id, domain: "ARTWORK", type: "NEEDS_CORRECTION", message: `فایل نیاز به اصلاح دارد: ${note}`, visibleToCustomer: true });
      await emit(tx, "ArtworkNeedsCorrection", { type: "order", id: o.id }, { orderId: o.id, note });
    }
    await refreshOrder(tx, o.id);
  });
}

function assertDesignable(o: Order) {
  if (!o.needsDesign) throw invalidState("این سفارش طراحی ندارد.");
  if (!["APPROVED", "IN_PRODUCTION"].includes(o.status)) throw invalidState("طراحی پس از تأیید سفارش انجام می‌شود.");
}

export async function startDesign(ctx: Ctx, orderId: string) {
  assertCan(ctx, "design.work");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    assertDesignable(o);
    if (o.artworkStatus !== "DESIGN_REQUESTED") throw invalidState("طراحی این سفارش شروع شده یا انجام شده است.");
    const me = ctx.actor.kind === "staff" ? ctx.actor.employeeId : null;
    await tx.db.update(orders).set({ artworkStatus: "DESIGN_IN_PROGRESS", designerId: o.designerId ?? me }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ARTWORK", type: "DESIGN_STARTED", message: "طراحی شروع شد", visibleToCustomer: true });
  });
}

/** The designer's latest file becomes the approved artwork; production can use it. */
export async function completeDesign(ctx: Ctx, orderId: string, input: { note?: string | null } = {}) {
  assertCan(ctx, "design.work");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    assertDesignable(o);
    if (!DESIGN_STATUSES.includes(o.artworkStatus)) throw invalidState("این سفارش در مرحله طراحی نیست.");
    const [latest] = await tx.db.select().from(artworkFiles).where(and(eq(artworkFiles.orderId, orderId), eq(artworkFiles.source, "DESIGNER"))).orderBy(desc(artworkFiles.versionNo)).limit(1);
    if (!latest) throw validation("ابتدا فایل نهایی طراحی را بارگذاری کنید.");
    await tx.db.update(artworkFiles).set({ status: "SUPERSEDED" }).where(and(eq(artworkFiles.orderId, orderId), eq(artworkFiles.status, "APPROVED")));
    await tx.db.update(artworkFiles).set({ status: "APPROVED", reviewedBy: actorUserId(tx), reviewedAt: new Date(), reviewNote: input.note?.trim() || null }).where(eq(artworkFiles.id, latest.id));
    await tx.db.update(orders).set({ artworkStatus: "DESIGN_COMPLETED" }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ARTWORK", type: "DESIGN_COMPLETED", message: "طراحی انجام شد", visibleToCustomer: true });
    await refreshOrder(tx, orderId);
  });
}

export async function artworkOf(ctx: Ctx, orderId: string) {
  const rows = await ctx.db
    .select({ artwork: artworkFiles, file: { id: fileObjects.id, name: fileObjects.originalName, mime: fileObjects.mimeType, size: fileObjects.sizeBytes }, uploaderName: users.fullName })
    .from(artworkFiles)
    .innerJoin(fileObjects, eq(fileObjects.id, artworkFiles.fileId))
    .leftJoin(users, eq(users.id, artworkFiles.uploadedBy))
    .where(eq(artworkFiles.orderId, orderId))
    .orderBy(asc(artworkFiles.versionNo));
  // Customers do not see the designer's work-in-progress drafts.
  return ctx.actor.kind === "customer" ? rows.filter((r) => r.artwork.source === "CUSTOMER" || r.artwork.status === "APPROVED") : rows;
}
