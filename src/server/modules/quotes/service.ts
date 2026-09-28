import { and, eq, inArray, lt } from "drizzle-orm";
import { customers, entityFiles, inquiries, products, quoteItems, quotes } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, can, inTx } from "@/server/core/context";
import { forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { priceProduct } from "@/server/modules/pricing/service";
import type { PriceBreakdown, Selections, UrgencyLevel } from "@/server/modules/pricing/types";
import { computeTotals, createOrderFromQuoteItems, resolveWorkflowCode } from "@/server/modules/orders/service";
import { getSetting } from "@/server/modules/settings/service";

export async function createInquiry(
  ctx: Ctx,
  input: { customerId?: string; productId?: string | null; title: string; description: string; quantity?: number | null; selections?: Selections | null; deadline?: Date | null; attachmentFileIds?: string[] },
) {
  let customerId: string;
  if (ctx.actor.kind === "customer") customerId = ctx.actor.customerId;
  else {
    assertCan(ctx, "quote.manage");
    if (!input.customerId) throw validation("مشتری را انتخاب کنید.");
    customerId = input.customerId;
  }
  if (!input.title.trim() || !input.description.trim()) throw validation("عنوان و توضیحات استعلام الزامی است.");
  return inTx(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(inquiries)
      .values({ customerId, productId: input.productId ?? null, title: input.title, description: input.description, quantity: input.quantity ?? null, selections: input.selections ?? null, deadline: input.deadline ?? null })
      .returning();
    for (const fileId of input.attachmentFileIds ?? []) {
      await tx.db.insert(entityFiles).values({ entityType: "inquiry", entityId: row!.id, fileId, createdBy: actorUserId(tx) });
    }
    await emit(tx, "InquiryReceived", { type: "inquiry", id: row!.id }, { inquiryId: row!.id });
    return row!;
  });
}

export interface QuoteItemInput {
  productId?: string | null;
  quantity: number;
  selections?: Selections;
  title?: string;
  description?: string;
  /** Required for custom lines; overrides the engine price for catalog lines (needs order.price.override). */
  lineSubtotal?: number;
  costTotal?: number;
}

async function buildQuoteItems(ctx: Ctx, customerId: string, urgency: UrgencyLevel, items: QuoteItemInput[]) {
  const out: (typeof quoteItems.$inferInsert)[] = [];
  for (const [i, it] of items.entries()) {
    if (it.quantity <= 0) throw validation("تعداد نامعتبر است.");
    if (it.productId) {
      const [p] = await ctx.db.select().from(products).where(eq(products.id, it.productId));
      if (!p) throw notFound("محصول");
      const price = await priceProduct(ctx.db, { productId: it.productId, quantity: it.quantity, selections: it.selections ?? {}, urgency, customerId });
      const overridden = it.lineSubtotal != null && it.lineSubtotal !== price.subtotal;
      if (overridden && !can(ctx, "order.price.override")) throw forbidden("تغییر قیمت محاسبه‌شده نیازمند مجوز است.");
      out.push({ quoteId: "", productId: p.id, title: it.title ?? p.name, description: it.description ?? price.spec.summary.map((s) => `${s.group}: ${s.value}`).join(" · "), quantity: it.quantity, selections: it.selections ?? {}, priceSnapshot: price, pricingVersionId: price.ruleVersionId, lineSubtotal: it.lineSubtotal ?? price.subtotal, costTotal: price.costTotal, isPriceOverridden: overridden, sortOrder: i });
    } else {
      if (!it.title || it.lineSubtotal == null) throw validation("برای ردیف سفارشی عنوان و مبلغ لازم است.");
      out.push({ quoteId: "", productId: null, title: it.title, description: it.description ?? null, quantity: it.quantity, selections: {}, priceSnapshot: null, lineSubtotal: it.lineSubtotal, costTotal: it.costTotal ?? 0, isPriceOverridden: true, sortOrder: i });
    }
  }
  return out;
}

export async function createQuote(
  ctx: Ctx,
  input: { customerId: string; inquiryId?: string | null; urgency?: UrgencyLevel; validDays?: number; items: QuoteItemInput[]; discountAmount?: number; customerNote?: string | null; internalNote?: string | null },
) {
  assertCan(ctx, "quote.manage");
  if (input.items.length === 0) throw validation("پیش‌فاکتور باید حداقل یک ردیف داشته باشد.");
  if ((input.discountAmount ?? 0) > 0) assertCan(ctx, "order.price.override");
  return inTx(ctx, async (tx) => {
    const [c] = await tx.db.select().from(customers).where(eq(customers.id, input.customerId));
    if (!c) throw notFound("مشتری");
    const urgency = input.urgency ?? "STANDARD";
    const items = await buildQuoteItems(tx, c.id, urgency, input.items);
    const vatPct = (items.find((i) => i.priceSnapshot)?.priceSnapshot as PriceBreakdown | undefined)?.vatPct ?? 10;
    const discount = input.discountAmount ?? 0;
    const totals = computeTotals({ itemSubtotals: items.map((i) => i.lineSubtotal), discount, shipping: 0, vatPct });
    const validDays = input.validDays ?? (await getSetting(tx.db, "orders")).quoteValidityDays;
    const [q] = await tx.db
      .insert(quotes)
      .values({
        inquiryId: input.inquiryId ?? null,
        customerId: c.id,
        urgency,
        validUntil: new Date(Date.now() + validDays * 86_400_000),
        subtotal: totals.subtotal,
        discountAmount: discount,
        vatPct,
        vatAmount: totals.vatAmount,
        total: totals.total,
        costTotal: items.reduce((s, i) => s + (i.costTotal ?? 0), 0),
        customerNote: input.customerNote ?? null,
        internalNote: input.internalNote ?? null,
        createdBy: actorUserId(tx),
      })
      .returning();
    await tx.db.insert(quoteItems).values(items.map((i) => ({ ...i, quoteId: q!.id })));
    if (input.inquiryId) await tx.db.update(inquiries).set({ status: "QUOTED" }).where(eq(inquiries.id, input.inquiryId));
    await audit(tx, { action: "quote.create", entityType: "quote", entityId: q!.id, after: { number: q!.number, total: q!.total } });
    return q!;
  });
}

export async function sendQuote(ctx: Ctx, quoteId: string) {
  assertCan(ctx, "quote.manage");
  return inTx(ctx, async (tx) => {
    const [q] = await tx.db.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    if (!q) throw notFound("پیش‌فاکتور");
    if (q.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل ارسال است.");
    await tx.db.update(quotes).set({ status: "SENT", sentAt: new Date() }).where(eq(quotes.id, quoteId));
    await emit(tx, "QuoteSent", { type: "quote", id: quoteId }, { quoteId });
  });
}

async function lockOwnQuote(ctx: Ctx, quoteId: string) {
  const [q] = await ctx.db.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
  if (!q) throw notFound("پیش‌فاکتور");
  if (ctx.actor.kind === "customer" && q.customerId !== ctx.actor.customerId) throw notFound("پیش‌فاکتور");
  if (ctx.actor.kind !== "customer") assertCan(ctx, "quote.manage");
  return q;
}

/**
 * Acceptance converts the quote into an order at the quoted (snapshot) prices.
 * Rule changes after the quote was issued do not affect it while it is valid.
 */
export async function acceptQuote(ctx: Ctx, quoteId: string) {
  return inTx(ctx, async (tx) => {
    const q = await lockOwnQuote(tx, quoteId);
    if (q.status !== "SENT") throw invalidState("این پیش‌فاکتور قابل پذیرش نیست.");
    if (q.validUntil < new Date()) {
      await tx.db.update(quotes).set({ status: "EXPIRED" }).where(eq(quotes.id, quoteId));
      throw invalidState("اعتبار این پیش‌فاکتور به پایان رسیده است.");
    }
    const items = await tx.db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    const orderItemsInput = [];
    for (const it of items) {
      const snap = it.priceSnapshot as PriceBreakdown | null;
      const [product] = it.productId ? await tx.db.select().from(products).where(eq(products.id, it.productId)) : [];
      orderItemsInput.push({
        productId: it.productId,
        title: it.title,
        quantity: it.quantity,
        unitLabel: product?.unitLabel ?? "عدد",
        selections: it.selections,
        price: snap,
        lineSubtotal: it.lineSubtotal,
        costTotal: it.costTotal,
        isPriceOverridden: it.isPriceOverridden,
        workflowTemplateCode: snap && it.productId ? await resolveWorkflowCode(tx, it.productId, snap.method) : "OFFSET_STANDARD",
        needsDesign: snap?.flags.includes("NEEDS_DESIGN") ?? false,
        artworkFileIds: [],
        note: it.description,
      });
    }
    const order = await createOrderFromQuoteItems(tx, {
      customerId: q.customerId,
      source: "QUOTE",
      quoteId: q.id,
      items: orderItemsInput,
      urgency: q.urgency,
      priority: q.urgency === "RUSH" ? "URGENT" : q.urgency === "EXPRESS" ? "HIGH" : "NORMAL",
      discount: q.discountAmount,
      deliveryMethodId: null,
      shipping: 0,
      address: null,
      customerNote: q.customerNote,
      idempotencyKey: `quote:${q.id}`,
    });
    await tx.db.update(quotes).set({ status: "CONVERTED", respondedAt: new Date(), convertedOrderId: order.id }).where(eq(quotes.id, quoteId));
    await audit(tx, { action: "quote.accept", entityType: "quote", entityId: quoteId, after: { orderId: order.id, orderNumber: order.number } });
    return order;
  });
}

export async function rejectQuote(ctx: Ctx, quoteId: string, reason?: string) {
  return inTx(ctx, async (tx) => {
    const q = await lockOwnQuote(tx, quoteId);
    if (!["SENT", "DRAFT"].includes(q.status)) throw invalidState("این پیش‌فاکتور قابل رد نیست.");
    await tx.db.update(quotes).set({ status: tx.actor.kind === "customer" ? "REJECTED" : "CANCELLED", respondedAt: new Date(), internalNote: [q.internalNote, reason].filter(Boolean).join("\n") || null }).where(eq(quotes.id, quoteId));
  });
}

/** Worker job: mark sent quotes past their validity as expired. */
export async function expireQuotes(ctx: Ctx) {
  const rows = await ctx.db.update(quotes).set({ status: "EXPIRED" }).where(and(inArray(quotes.status, ["SENT"]), lt(quotes.validUntil, new Date()))).returning({ id: quotes.id });
  return rows.length;
}

/** Sales triage of an inquiry. QUOTED is set automatically when a quote is created from it. */
export async function setInquiryStatus(ctx: Ctx, id: string, status: "IN_REVIEW" | "CLOSED" | "REJECTED", note?: string) {
  assertCan(ctx, "quote.manage");
  return inTx(ctx, async (tx) => {
    const [row] = await tx.db.select().from(inquiries).where(eq(inquiries.id, id)).for("update");
    if (!row) throw notFound("استعلام");
    if (["CLOSED", "REJECTED"].includes(row.status) && status !== "IN_REVIEW") throw invalidState("این استعلام بسته شده است.");
    await tx.db.update(inquiries).set({ status, assignedTo: row.assignedTo ?? actorUserId(tx) }).where(eq(inquiries.id, id));
    await audit(tx, { action: "inquiry.status", entityType: "inquiry", entityId: id, before: { status: row.status }, after: { status }, reason: note });
    return { ...row, status };
  });
}
