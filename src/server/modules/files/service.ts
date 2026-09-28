import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  artworkVersions,
  entityFiles,
  fileObjects,
  orderItems,
  orders,
  payments,
  productionJobs,
  productionTasks,
} from "@/server/db/schema";
import { env } from "@/server/config/env";
import { type Ctx, actorUserId, assertCan, can, inTx } from "@/server/core/context";
import { AppError, forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { storage } from "@/server/integrations/storage";
import { orderEvent } from "@/server/modules/orders/state";
import { syncItems, taskEvent } from "@/server/modules/production/engine";
import { createAttempts } from "@/server/modules/production/tasks";
import { toFaDigits } from "@/lib/persian";

type Purpose = (typeof fileObjects.$inferInsert)["purpose"];
type Item = typeof orderItems.$inferSelect;

// ── Upload validation ───────────────────────────────────────────────────────

interface Sniffed {
  mime: string;
  ext: string;
}

/** Detects the real type from magic bytes — the client-supplied type is ignored. */
export function sniff(buf: Buffer): Sniffed | null {
  const s = (o: number, sig: number[]) => sig.every((b, i) => buf[o + i] === b);
  if (s(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf" }; // %PDF- (also AI files)
  if (s(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (s(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (s(0, [0x49, 0x49, 0x2a, 0x00]) || s(0, [0x4d, 0x4d, 0x00, 0x2a])) return { mime: "image/tiff", ext: "tif" };
  if (s(0, [0x38, 0x42, 0x50, 0x53])) return { mime: "image/vnd.adobe.photoshop", ext: "psd" };
  if (s(0, [0x52, 0x49, 0x46, 0x46]) && s(8, [0x57, 0x45, 0x42, 0x50])) return { mime: "image/webp", ext: "webp" };
  if (s(0, [0x25, 0x21, 0x50, 0x53]) || s(0, [0xc5, 0xd0, 0xd3, 0xc6])) return { mime: "application/postscript", ext: "eps" };
  if (s(0, [0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip" };
  return null;
}

const ALLOWED: Record<Purpose, string[]> = {
  ARTWORK: ["application/pdf", "image/png", "image/jpeg", "image/tiff", "image/vnd.adobe.photoshop", "application/postscript", "application/zip"],
  PROOF: ["application/pdf", "image/png", "image/jpeg"],
  QC_IMAGE: ["image/png", "image/jpeg", "image/webp"],
  DELIVERY_PROOF: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
  ATTACHMENT: ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip"],
  PRODUCT_IMAGE: ["image/png", "image/jpeg", "image/webp"],
  PAYMENT_RECEIPT: ["image/png", "image/jpeg", "application/pdf"],
};

const IMAGE_LIMIT = 15 * 1024 * 1024;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 180) || "file";
}

export async function storeUpload(ctx: Ctx, input: { data: Buffer; filename: string; purpose: Purpose }) {
  const max = input.purpose === "ARTWORK" || input.purpose === "ATTACHMENT" ? env().UPLOAD_MAX_BYTES : Math.min(env().UPLOAD_MAX_BYTES, IMAGE_LIMIT);
  if (input.data.length === 0) throw validation("فایل خالی است.");
  if (input.data.length > max) throw new AppError("PAYLOAD_TOO_LARGE", `حداکثر حجم مجاز ${Math.round(max / 1024 / 1024)} مگابایت است.`);
  const type = sniff(input.data);
  if (!type || !ALLOWED[input.purpose].includes(type.mime)) {
    throw new AppError("UNSUPPORTED_MEDIA", "نوع فایل مجاز نیست. فرمت‌های مجاز: PDF، TIFF، JPG، PNG، PSD، EPS.");
  }
  const now = new Date();
  const key = `${input.purpose.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  await storage().put(key, input.data, type.mime);
  const [row] = await ctx.db
    .insert(fileObjects)
    .values({
      storageDriver: storage().name,
      storageKey: key,
      originalName: sanitizeFilename(input.filename),
      mimeType: type.mime,
      sizeBytes: input.data.length,
      sha256,
      purpose: input.purpose,
      uploadedBy: actorUserId(ctx),
    })
    .returning();
  return row!;
}

// ── Download authorisation (IDOR protection) ────────────────────────────────

export async function authorizeFileAccess(ctx: Ctx, fileId: string) {
  const [file] = await ctx.db.select().from(fileObjects).where(eq(fileObjects.id, fileId));
  if (!file) throw notFound("فایل");
  if (ctx.actor.kind === "staff") {
    if (can(ctx, "file.view") || can(ctx, "production.view") || can(ctx, "payment.view") || can(ctx, "delivery.view") || file.uploadedBy === ctx.actor.userId) return file;
    throw forbidden();
  }
  if (ctx.actor.kind === "customer") {
    const customerId = ctx.actor.customerId;
    if (file.uploadedBy === ctx.actor.userId) return file;
    // Artwork/proofs of the customer's own orders
    const [art] = await ctx.db
      .select({ id: artworkVersions.id })
      .from(artworkVersions)
      .innerJoin(orderItems, eq(orderItems.id, artworkVersions.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(artworkVersions.fileId, fileId), eq(orders.customerId, customerId), sql`${artworkVersions.stage} IN ('CUSTOMER_ORIGINAL','PROOF','DESIGNER')`))
      .limit(1);
    if (art) return file;
    const [rcpt] = await ctx.db.select({ id: payments.id }).from(payments).where(and(eq(payments.receiptFileId, fileId), eq(payments.customerId, customerId))).limit(1);
    if (rcpt) return file;
  }
  throw forbidden("دسترسی به این فایل مجاز نیست.");
}

// ── Artwork versions ────────────────────────────────────────────────────────

async function lockItemForCaller(ctx: Ctx, itemId: string) {
  const [row] = await ctx.db
    .select({ item: orderItems, customerId: orders.customerId, orderStatus: orders.status })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.id, itemId))
    .for("update", { of: orderItems });
  if (!row) throw notFound("ردیف سفارش");
  if (ctx.actor.kind === "customer" && row.customerId !== ctx.actor.customerId) throw notFound("ردیف سفارش");
  if (row.orderStatus === "CANCELLED") throw invalidState("سفارش لغو شده است.");
  return row;
}

async function nextVersionNo(ctx: Ctx, itemId: string) {
  const [{ max }] = (await ctx.db
    .select({ max: sql<number>`coalesce(max(${artworkVersions.versionNo}), 0)::int` })
    .from(artworkVersions)
    .where(eq(artworkVersions.orderItemId, itemId))) as [{ max: number }];
  return max + 1;
}

export async function recomputeItemFileStatus(ctx: Ctx, itemId: string) {
  const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.id, itemId));
  if (!item) return;
  const versions = await ctx.db.select().from(artworkVersions).where(eq(artworkVersions.orderItemId, itemId)).orderBy(desc(artworkVersions.versionNo));
  let status: Item["fileStatus"];
  const latestVersion = versions[0];
  if (versions.some((v) => v.status === "APPROVED_FOR_PRINT")) status = "APPROVED";
  else if (!latestVersion) status = item.needsDesign ? "IN_DESIGN" : item.fileStatus === "NOT_REQUIRED" ? "NOT_REQUIRED" : "AWAITING_FILE";
  else if (latestVersion.status === "SENT_FOR_APPROVAL") status = "AWAITING_CUSTOMER_APPROVAL";
  else if (latestVersion.status === "REJECTED" || latestVersion.status === "CUSTOMER_REJECTED") status = item.needsDesign ? "IN_DESIGN" : "NEEDS_REVISION";
  else status = item.needsDesign && latestVersion.stage === "CUSTOMER_ORIGINAL" ? "IN_DESIGN" : "UNDER_REVIEW";
  if (status !== item.fileStatus) {
    await ctx.db.update(orderItems).set({ fileStatus: status }).where(eq(orderItems.id, itemId));
    await orderEvent(ctx, { orderId: item.orderId, orderItemId: itemId, domain: "FILE", type: "ITEM_FILE_STATUS", from: item.fileStatus, to: status });
  }
}

export async function addArtworkVersion(
  ctx: Ctx,
  itemId: string,
  input: { fileId: string; stage: (typeof artworkVersions.$inferInsert)["stage"]; note?: string; parentVersionId?: string | null },
) {
  if (ctx.actor.kind === "customer") {
    if (input.stage !== "CUSTOMER_ORIGINAL") throw forbidden();
  } else assertCan(ctx, "file.upload");
  return inTx(ctx, async (tx) => {
    const { item } = await lockItemForCaller(tx, itemId);
    const [file] = await tx.db.select().from(fileObjects).where(eq(fileObjects.id, input.fileId));
    if (!file || !["ARTWORK", "PROOF"].includes(file.purpose)) throw validation("فایل نامعتبر است.");
    if (tx.actor.kind === "customer" && file.uploadedBy !== tx.actor.userId) throw forbidden();
    const versionNo = await nextVersionNo(tx, itemId);
    const [v] = await tx.db
      .insert(artworkVersions)
      .values({ orderItemId: itemId, versionNo, stage: input.stage, status: "UPLOADED", fileId: input.fileId, parentVersionId: input.parentVersionId ?? null, note: input.note ?? null, uploadedBy: actorUserId(tx) })
      .returning();
    await orderEvent(tx, {
      orderId: item.orderId,
      orderItemId: itemId,
      domain: "FILE",
      type: "ARTWORK_UPLOADED",
      message: `نسخه ${toFaDigits(versionNo)} (${STAGE_LABEL[input.stage]}) بارگذاری شد`,
      visibleToCustomer: input.stage === "CUSTOMER_ORIGINAL",
    });
    await recomputeItemFileStatus(tx, itemId);
    await syncItems(tx, [itemId]);
    return v!;
  });
}

const STAGE_LABEL: Record<string, string> = {
  CUSTOMER_ORIGINAL: "فایل مشتری",
  DESIGNER: "طرح طراح",
  PREPRESS: "فایل پیش از چاپ",
  PROOF: "نمونه برای تأیید",
  PRINT_READY: "آماده چاپ",
};

async function lockVersion(ctx: Ctx, versionId: string) {
  const [v] = await ctx.db.select().from(artworkVersions).where(eq(artworkVersions.id, versionId)).for("update");
  if (!v) throw notFound("نسخه فایل");
  return v;
}

/** True once plates or printing have started — file changes then need an override. */
async function printingStarted(ctx: Ctx, itemId: string) {
  const [row] = await ctx.db
    .select({ id: productionTasks.id })
    .from(productionTasks)
    .innerJoin(productionJobs, eq(productionJobs.id, productionTasks.jobId))
    .where(
      and(
        eq(productionJobs.orderItemId, itemId),
        inArray(productionTasks.stepTypeCode, ["PLATE_MAKING", "OFFSET_PRINTING", "DIGITAL_PRINTING"]),
        inArray(productionTasks.status, ["IN_PROGRESS", "PAUSED", "COMPLETED"]),
      ),
    )
    .limit(1);
  return !!row;
}

async function markApprovedForPrint(ctx: Ctx, v: typeof artworkVersions.$inferSelect, note?: string) {
  if (await printingStarted(ctx, v.orderItemId)) {
    if (!can(ctx, "production.override")) throw invalidState("زینک یا چاپ این سفارش شروع شده است؛ تغییر فایل فقط با مجوز مدیر ممکن است.");
    await orderEvent(ctx, { orderId: (await itemOrderId(ctx, v.orderItemId))!, orderItemId: v.orderItemId, domain: "FILE", type: "FILE_CHANGED_AFTER_PRINT", message: "فایل پس از شروع چاپ تغییر کرد" });
  }
  await ctx.db
    .update(artworkVersions)
    .set({ status: "SUPERSEDED" })
    .where(and(eq(artworkVersions.orderItemId, v.orderItemId), eq(artworkVersions.status, "APPROVED_FOR_PRINT")));
  await ctx.db
    .update(artworkVersions)
    .set({ status: "APPROVED_FOR_PRINT", reviewedBy: actorUserId(ctx), reviewedAt: new Date(), reviewNote: note ?? v.reviewNote })
    .where(eq(artworkVersions.id, v.id));
  const orderId = await itemOrderId(ctx, v.orderItemId);
  await orderEvent(ctx, { orderId: orderId!, orderItemId: v.orderItemId, domain: "FILE", type: "ARTWORK_APPROVED", message: `نسخه ${toFaDigits(v.versionNo)} برای چاپ تأیید شد`, visibleToCustomer: true });
  await emit(ctx, "ArtworkApproved", { type: "order", id: orderId! }, { orderId: orderId!, orderItemId: v.orderItemId, versionId: v.id });
}

const itemOrderId = async (ctx: Ctx, itemId: string) =>
  (await ctx.db.select({ orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, itemId)))[0]?.orderId;

/** Prepress decision on a version: approve it for print, or reject with a reason. */
export async function reviewArtwork(ctx: Ctx, versionId: string, input: { decision: "APPROVE" | "REJECT"; note?: string }) {
  assertCan(ctx, "file.review");
  return inTx(ctx, async (tx) => {
    const v = await lockVersion(tx, versionId);
    if (!["UPLOADED", "CUSTOMER_APPROVED"].includes(v.status)) throw invalidState("این نسخه در وضعیت بررسی نیست.");
    if (input.decision === "APPROVE") await markApprovedForPrint(tx, v, input.note);
    else {
      if (!input.note?.trim()) throw validation("دلیل رد فایل را بنویسید.");
      await tx.db.update(artworkVersions).set({ status: "REJECTED", reviewedBy: actorUserId(tx), reviewedAt: new Date(), reviewNote: input.note }).where(eq(artworkVersions.id, v.id));
      await orderEvent(tx, { orderId: (await itemOrderId(tx, v.orderItemId))!, orderItemId: v.orderItemId, domain: "FILE", type: "ARTWORK_REJECTED", message: `فایل نیاز به اصلاح دارد: ${input.note}`, visibleToCustomer: true });
    }
    await audit(tx, { action: `file.review.${input.decision.toLowerCase()}`, entityType: "artwork_version", entityId: v.id, before: { status: v.status }, after: { decision: input.decision }, reason: input.note });
    await recomputeItemFileStatus(tx, v.orderItemId);
    await syncItems(tx, [v.orderItemId]);
  });
}

/**
 * Sends a designer/prepress version to the customer as a proof. The DESIGN
 * task (if any) is completed — the designer's part is done until feedback.
 */
export async function sendProof(ctx: Ctx, versionId: string, note?: string) {
  assertCan(ctx, "file.upload");
  return inTx(ctx, async (tx) => {
    const v = await lockVersion(tx, versionId);
    if (v.status !== "UPLOADED" || v.stage === "CUSTOMER_ORIGINAL") throw invalidState("فقط نسخه طراحی‌شده قابل ارسال برای مشتری است.");
    await tx.db.update(artworkVersions).set({ status: "SENT_FOR_APPROVAL", stage: "PROOF", note: note ?? v.note }).where(eq(artworkVersions.id, v.id));
    const orderId = (await itemOrderId(tx, v.orderItemId))!;
    // Close an open DESIGN task: waiting on the customer is not design work.
    const [job] = await tx.db.select({ id: productionJobs.id }).from(productionJobs).where(eq(productionJobs.orderItemId, v.orderItemId));
    if (job) {
      const open = await tx.db
        .select()
        .from(productionTasks)
        .where(and(eq(productionTasks.jobId, job.id), eq(productionTasks.stepTypeCode, "DESIGN"), inArray(productionTasks.status, ["READY", "IN_PROGRESS", "PAUSED"])));
      for (const t of open) {
        const now = new Date();
        await tx.db.update(productionTasks).set({ status: "COMPLETED", startedAt: t.startedAt ?? now, completedAt: now, quantityCompleted: t.quantityPlanned }).where(eq(productionTasks.id, t.id));
        await taskEvent(tx, t.id, "COMPLETED", "نمونه برای مشتری ارسال شد");
      }
    }
    await orderEvent(tx, { orderId, orderItemId: v.orderItemId, domain: "FILE", type: "PROOF_SENT", message: "نمونه طرح برای تأیید شما ارسال شد", visibleToCustomer: true });
    await emit(tx, "ProofSent", { type: "order", id: orderId }, { orderId, orderItemId: v.orderItemId, versionId: v.id });
    await recomputeItemFileStatus(tx, v.orderItemId);
    await syncItems(tx, [v.orderItemId]);
  });
}

/** Customer approves or requests changes on a proof. Approval makes it the print file. */
export async function customerDecision(ctx: Ctx, versionId: string, input: { approve: boolean; comment?: string }) {
  if (ctx.actor.kind !== "customer") throw forbidden();
  return inTx(ctx, async (tx) => {
    const v = await lockVersion(tx, versionId);
    await lockItemForCaller(tx, v.orderItemId); // ownership check
    if (v.status !== "SENT_FOR_APPROVAL") throw invalidState("این نمونه در انتظار تأیید نیست.");
    await tx.db
      .update(artworkVersions)
      .set({ status: input.approve ? "CUSTOMER_APPROVED" : "CUSTOMER_REJECTED", customerDecisionAt: new Date(), customerComment: input.comment ?? null })
      .where(eq(artworkVersions.id, v.id));
    const orderId = (await itemOrderId(tx, v.orderItemId))!;
    if (input.approve) {
      await markApprovedForPrint(tx, { ...v, status: "CUSTOMER_APPROVED" });
    } else {
      if (!input.comment?.trim()) throw validation("لطفاً تغییرات موردنظر را بنویسید.");
      await orderEvent(tx, { orderId, orderItemId: v.orderItemId, domain: "FILE", type: "PROOF_REJECTED", message: `درخواست اصلاح: ${input.comment}`, visibleToCustomer: true });
      // Send the design step back to the designer.
      const [job] = await tx.db.select({ id: productionJobs.id }).from(productionJobs).where(eq(productionJobs.orderItemId, v.orderItemId));
      if (job) {
        const [design] = await tx.db.select({ id: productionTasks.id }).from(productionTasks).where(and(eq(productionTasks.jobId, job.id), eq(productionTasks.stepKey, "DESIGN"))).limit(1);
        if (design) await createAttempts(tx, job.id, ["DESIGN"], { reason: `درخواست اصلاح مشتری: ${input.comment}` });
      }
    }
    await recomputeItemFileStatus(tx, v.orderItemId);
    await syncItems(tx, [v.orderItemId]);
  });
}

export async function attachFile(ctx: Ctx, input: { entityType: string; entityId: string; fileId: string; label?: string }) {
  await ctx.db.insert(entityFiles).values({ ...input, label: input.label ?? null, createdBy: actorUserId(ctx) });
}

export async function artworkForItem(ctx: Ctx, itemId: string) {
  return ctx.db
    .select({ version: artworkVersions, file: fileObjects })
    .from(artworkVersions)
    .innerJoin(fileObjects, eq(fileObjects.id, artworkVersions.fileId))
    .where(eq(artworkVersions.orderItemId, itemId))
    .orderBy(desc(artworkVersions.versionNo));
}
