import { and, asc, eq } from "drizzle-orm";
import { lithographyJobs, procurementDecisions, productionSteps, supplierQuotes, suppliers, users } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { loadOrder, orderEvent, type Order } from "@/server/modules/orders/state";
import { ACTIVE_STATUSES, artworkReady, finishStep, markStarted, refreshOrder, type Step } from "@/server/modules/workflow/engine";
import { formatToman } from "@/lib/persian";

async function stepFor(ctx: Ctx, o: Order, key: "O_PAPER" | "O_LITHO"): Promise<Step> {
  if (o.productionType !== "OFFSET") throw invalidState("این بخش فقط برای سفارش‌های افست است.");
  if (!(ACTIVE_STATUSES as readonly string[]).includes(o.status)) throw invalidState("این سفارش در جریان تولید نیست.");
  const [s] = await ctx.db.select().from(productionSteps).where(and(eq(productionSteps.orderId, o.id), eq(productionSteps.key, key))).for("update");
  if (!s) throw invalidState(key === "O_PAPER" ? "تأمین کاغذ در مسیر این سفارش انتخاب نشده است." : "لیتوگرافی در مسیر این سفارش انتخاب نشده است.");
  return s;
}

async function supplierOf(ctx: Ctx, id: string, kind: "PAPER" | "LITHO") {
  const [s] = await ctx.db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.isActive, true)));
  if (!s || s.kind !== kind) throw validation(kind === "PAPER" ? "تأمین‌کننده کاغذ معتبر نیست." : "لیتوگرافی معتبر نیست.");
  return s;
}

// ── Paper: quotes → manager's choice → received ─────────────────────────────

/** Records a price obtained by phone. Procurement starts with the first quote. */
export async function addSupplierQuote(ctx: Ctx, orderId: string, input: { supplierId: string; price: number; notes?: string | null; quotedAt?: Date | null }) {
  assertCan(ctx, "offset.paper");
  if (!Number.isInteger(input.price) || input.price <= 0) throw validation("قیمت نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const step = await stepFor(tx, o, "O_PAPER");
    if (step.status === "DONE") throw invalidState("کاغذ این سفارش تأمین شده است.");
    const [decision] = await tx.db.select().from(procurementDecisions).where(eq(procurementDecisions.orderId, orderId));
    if (decision) throw invalidState("تأمین‌کننده انتخاب شده است؛ قیمت جدید ثبت نمی‌شود.");
    const s = await supplierOf(tx, input.supplierId, "PAPER");
    const existing = await tx.db.select({ id: supplierQuotes.id }).from(supplierQuotes).where(eq(supplierQuotes.orderId, orderId));
    const [q] = await tx.db.insert(supplierQuotes).values({ orderId, supplierId: s.id, price: input.price, notes: input.notes?.trim() || null, quotedAt: input.quotedAt ?? new Date(), createdBy: actorUserId(tx) }).returning();
    await orderEvent(tx, { orderId, domain: "PROCUREMENT", type: "QUOTE_ADDED", message: `قیمت کاغذ — ${s.name}: ${formatToman(input.price)}` });
    if (step.status === "READY") await markStarted(tx, step);
    if (existing.length === 0) await emit(tx, "PaperDecisionNeeded", { type: "order", id: orderId }, { orderId });
    return q!;
  });
}

export async function removeSupplierQuote(ctx: Ctx, quoteId: string) {
  assertCan(ctx, "offset.paper");
  return inTx(ctx, async (tx) => {
    const [q] = await tx.db.select().from(supplierQuotes).where(eq(supplierQuotes.id, quoteId)).for("update");
    if (!q) throw notFound("قیمت");
    await loadOrder(tx, q.orderId, { lock: true });
    const [decision] = await tx.db.select().from(procurementDecisions).where(eq(procurementDecisions.orderId, q.orderId));
    if (decision) throw invalidState("پس از انتخاب تأمین‌کننده، قیمت‌ها حذف نمی‌شوند.");
    await tx.db.delete(supplierQuotes).where(eq(supplierQuotes.id, quoteId));
  });
}

/** The manager chooses the supplier; re-deciding (before the paper arrives) is audited. */
export async function decidePaperSupplier(ctx: Ctx, orderId: string, input: { quoteId: string; notes?: string | null }) {
  assertCan(ctx, "offset.paper.approve");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const step = await stepFor(tx, o, "O_PAPER");
    if (step.status === "DONE") throw invalidState("کاغذ این سفارش دریافت شده است.");
    const [q] = await tx.db.select({ quote: supplierQuotes, supplierName: suppliers.name }).from(supplierQuotes).innerJoin(suppliers, eq(suppliers.id, supplierQuotes.supplierId)).where(and(eq(supplierQuotes.id, input.quoteId), eq(supplierQuotes.orderId, orderId)));
    if (!q) throw validation("قیمت انتخاب‌شده متعلق به این سفارش نیست.");
    const [before] = await tx.db.select().from(procurementDecisions).where(eq(procurementDecisions.orderId, orderId));
    const values = { orderId, quoteId: q.quote.id, approvedBy: actorUserId(tx)!, notes: input.notes?.trim() || null, approvedAt: new Date() };
    await tx.db.insert(procurementDecisions).values(values).onConflictDoUpdate({ target: procurementDecisions.orderId, set: values });
    await orderEvent(tx, { orderId, domain: "PROCUREMENT", type: "SUPPLIER_CHOSEN", message: `تأمین‌کننده کاغذ: ${q.supplierName} (${formatToman(q.quote.price)})` });
    await audit(tx, { action: "procurement.decide", entityType: "order", entityId: orderId, before: before ? { quoteId: before.quoteId } : null, after: { quoteId: q.quote.id, price: q.quote.price } });
    if (step.status === "READY") await markStarted(tx, step);
  });
}

export async function markPaperReceived(ctx: Ctx, orderId: string, input: { note?: string | null } = {}) {
  assertCan(ctx, "offset.paper");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const step = await stepFor(tx, o, "O_PAPER");
    if (step.status === "DONE") throw invalidState("دریافت کاغذ قبلاً ثبت شده است.");
    const [decision] = await tx.db.select().from(procurementDecisions).where(eq(procurementDecisions.orderId, orderId));
    if (!decision) throw invalidState("ابتدا مدیر باید تأمین‌کننده کاغذ را انتخاب کند.");
    await finishStep(tx, step, input.note?.trim() || "کاغذ دریافت شد", { quoteId: decision.quoteId });
  });
}

export async function procurementOf(ctx: Ctx, orderId: string) {
  const quotes = await ctx.db
    .select({ quote: supplierQuotes, supplierName: suppliers.name, supplierPhone: suppliers.phone, createdByName: users.fullName })
    .from(supplierQuotes)
    .innerJoin(suppliers, eq(suppliers.id, supplierQuotes.supplierId))
    .leftJoin(users, eq(users.id, supplierQuotes.createdBy))
    .where(eq(supplierQuotes.orderId, orderId))
    .orderBy(asc(supplierQuotes.price));
  const [decision] = await ctx.db
    .select({ decision: procurementDecisions, approverName: users.fullName })
    .from(procurementDecisions)
    .innerJoin(users, eq(users.id, procurementDecisions.approvedBy))
    .where(eq(procurementDecisions.orderId, orderId));
  return { quotes, decision: decision ?? null };
}

// ── Lithography (outsourced; recorded, not controlled) ─────────────────────

export const LITHO_ORDER = ["NOT_ORDERED", "ORDERED", "IN_PROGRESS", "READY", "RECEIVED"] as const;
export type LithoStatus = (typeof LITHO_ORDER)[number] | "CANCELLED";

export interface LithoInput {
  supplierId?: string | null;
  status: LithoStatus;
  sentAt?: Date | null;
  expectedAt?: Date | null;
  price?: number | null;
  notes?: string | null;
}

/**
 * Creates or updates the order's lithography record. Ordering requires the
 * final artwork; RECEIVED completes the lithography step, CANCELLED puts it
 * back in the queue.
 */
export async function saveLithoJob(ctx: Ctx, orderId: string, input: LithoInput) {
  assertCan(ctx, "offset.litho");
  if (input.price != null && (!Number.isInteger(input.price) || input.price < 0)) throw validation("مبلغ نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const step = await stepFor(tx, o, "O_LITHO");
    if (step.status === "DONE") throw invalidState("زینک این سفارش دریافت شده است.");
    const ordering = input.status !== "NOT_ORDERED" && input.status !== "CANCELLED";
    if (ordering && !artworkReady(o)) throw invalidState("پیش از سفارش لیتوگرافی، فایل نهایی باید تأیید شده باشد.");
    let supplierName: string | null = null;
    if (input.supplierId) supplierName = (await supplierOf(tx, input.supplierId, "LITHO")).name;
    else if (ordering) throw validation("لیتوگرافی را انتخاب کنید.");
    const [before] = await tx.db.select().from(lithographyJobs).where(eq(lithographyJobs.orderId, orderId));
    const now = new Date();
    const values = {
      orderId,
      supplierId: input.supplierId ?? before?.supplierId ?? null,
      status: input.status,
      sentAt: input.sentAt ?? before?.sentAt ?? (ordering ? now : null),
      expectedAt: input.expectedAt ?? before?.expectedAt ?? null,
      receivedAt: input.status === "RECEIVED" ? now : null,
      price: input.price ?? before?.price ?? null,
      notes: input.notes?.trim() || before?.notes || null,
      createdBy: before?.createdBy ?? actorUserId(tx),
    };
    const [job] = await tx.db.insert(lithographyJobs).values(values).onConflictDoUpdate({ target: lithographyJobs.orderId, set: values }).returning();
    if (before?.status !== input.status) {
      await orderEvent(tx, { orderId, domain: "PROCUREMENT", type: `LITHO_${input.status}`, message: `لیتوگرافی${supplierName ? ` (${supplierName})` : ""}: ${LITHO_LABEL[input.status]}` });
    }
    if (input.status === "RECEIVED") await finishStep(tx, step, "زینک از لیتوگرافی دریافت شد", { lithoJobId: job!.id });
    else if (ordering && step.status === "READY") await markStarted(tx, step);
    else if (input.status === "CANCELLED" && step.status === "IN_PROGRESS") {
      await tx.db.update(productionSteps).set({ status: "READY", startedAt: null, startedBy: null }).where(eq(productionSteps.id, step.id));
      await refreshOrder(tx, orderId);
    }
    return job!;
  });
}

export const LITHO_LABEL: Record<LithoStatus, string> = {
  NOT_ORDERED: "سفارش داده نشده",
  ORDERED: "سفارش داده شد",
  IN_PROGRESS: "در حال انجام در لیتوگرافی",
  READY: "آماده تحویل",
  RECEIVED: "دریافت شد",
  CANCELLED: "لغو شد",
};

export async function lithoOf(ctx: Ctx, orderId: string) {
  const [job] = await ctx.db.select({ job: lithographyJobs, supplierName: suppliers.name }).from(lithographyJobs).leftJoin(suppliers, eq(suppliers.id, lithographyJobs.supplierId)).where(eq(lithographyJobs.orderId, orderId));
  return job ?? null;
}

export async function listSuppliers(ctx: Ctx, kind?: "PAPER" | "LITHO" | "OTHER") {
  const rows = await ctx.db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name));
  return kind ? rows.filter((s) => s.kind === kind) : rows;
}

export async function saveSupplier(ctx: Ctx, input: { id?: string; name: string; kind: "PAPER" | "LITHO" | "OTHER"; contactName?: string | null; phone?: string | null; notes?: string | null; isActive?: boolean }) {
  if (input.kind === "PAPER") assertCan(ctx, "offset.paper");
  else if (input.kind === "LITHO") assertCan(ctx, "offset.litho");
  else assertCan(ctx, "inventory.manage");
  const name = input.name.trim();
  if (name.length < 2) throw validation("نام تأمین‌کننده را بنویسید.");
  const values = { name, kind: input.kind, contactName: input.contactName?.trim() || null, phone: input.phone?.trim() || null, notes: input.notes?.trim() || null, isActive: input.isActive ?? true };
  if (input.id) {
    const [row] = await ctx.db.update(suppliers).set(values).where(eq(suppliers.id, input.id)).returning();
    if (!row) throw notFound("تأمین‌کننده");
    return row;
  }
  const [row] = await ctx.db.insert(suppliers).values(values).returning();
  return row!;
}
