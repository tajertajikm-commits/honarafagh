import { eq, sql } from "drizzle-orm";
import { customers, orderEvents, orderItems, orders } from "@/server/db/schema";
import { type Ctx, actorLabel, actorUserId, can } from "@/server/core/context";
import { forbidden, notFound, validation } from "@/server/core/errors";
import { APPROVE_PERMISSION, QUEUE_PERMISSION, type ProductionType } from "@/server/modules/workflow/stations";

export type Order = typeof orders.$inferSelect;

export async function orderEvent(ctx: Ctx, e: { orderId: string; domain: string; type: string; message?: string | null; visibleToCustomer?: boolean }) {
  await ctx.db.insert(orderEvents).values({
    orderId: e.orderId,
    domain: e.domain,
    type: e.type,
    message: e.message ?? null,
    visibleToCustomer: e.visibleToCustomer ?? false,
    actorId: actorUserId(ctx),
    actorLabel: ctx.actor.kind === "anonymous" ? null : actorLabel(ctx.actor),
  });
}

// ── Access ──────────────────────────────────────────────────────────────────

/** Staff who work on orders of this production type (approvers and queue users). */
export function worksOnType(ctx: Ctx, type: ProductionType): boolean {
  return can(ctx, "order.view") || can(ctx, APPROVE_PERMISSION[type]) || can(ctx, QUEUE_PERMISSION[type]);
}

/**
 * Who may open an order: the owning customer; staff who see all orders,
 * work on its production type, design it, or handle money.
 */
export function canAccessOrder(ctx: Ctx, o: Pick<Order, "customerId" | "productionType" | "needsDesign">): boolean {
  switch (ctx.actor.kind) {
    case "system":
      return true;
    case "customer":
      return o.customerId === ctx.actor.customerId;
    case "staff":
      return worksOnType(ctx, o.productionType) || (o.needsDesign && can(ctx, "design.work")) || can(ctx, "payment.view") || can(ctx, "invoice.manage");
    default:
      return false;
  }
}

export function assertOrderAccess(ctx: Ctx, o: Pick<Order, "customerId" | "productionType" | "needsDesign">) {
  if (canAccessOrder(ctx, o)) return;
  // Customers must not learn that someone else's order exists.
  throw ctx.actor.kind === "staff" ? forbidden() : notFound("سفارش");
}

export async function loadOrder(ctx: Ctx, orderId: string, opts: { lock?: boolean } = {}): Promise<Order> {
  const q = ctx.db.select().from(orders).where(eq(orders.id, orderId));
  const [o] = opts.lock ? await q.for("update") : await q;
  if (!o) throw notFound("سفارش");
  assertOrderAccess(ctx, o);
  return o;
}

export async function loadOrderByCode(ctx: Ctx, code: string): Promise<Order> {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.code, code.toUpperCase()));
  if (!o) throw notFound("سفارش");
  assertOrderAccess(ctx, o);
  return o;
}

// ── Codes ───────────────────────────────────────────────────────────────────

/**
 * Next order code for a customer: D-1042-0037 / O-1042-0019. The per-customer
 * counter is bumped atomically, so codes are unique and never reused.
 */
export async function nextOrderCode(ctx: Ctx, customerId: string, type: ProductionType): Promise<string> {
  const [c] = await ctx.db
    .update(customers)
    .set({ orderSeq: sql`${customers.orderSeq} + 1` })
    .where(eq(customers.id, customerId))
    .returning({ code: customers.code, seq: customers.orderSeq });
  if (!c) throw notFound("مشتری");
  return `${type === "DIGITAL" ? "D" : "O"}-${c.code}-${String(c.seq).padStart(4, "0")}`;
}

// ── Money ───────────────────────────────────────────────────────────────────

export const vatOf = (base: number, pct: number) => Math.round((Math.max(0, base) * pct) / 100);

export function computeTotals(input: { itemSubtotals: number[]; discount: number; shipping: number; vatPct: number }) {
  const subtotal = input.itemSubtotals.reduce((s, x) => s + x, 0);
  if (input.discount < 0 || input.discount > subtotal) throw validation("تخفیف نمی‌تواند بیشتر از مبلغ سفارش باشد.");
  const vatAmount = vatOf(subtotal - input.discount + input.shipping, input.vatPct);
  return { subtotal, vatAmount, total: subtotal - input.discount + input.shipping + vatAmount };
}

export function derivePaymentStatus(total: number, paid: number, refunded: number): Order["paymentStatus"] {
  const net = paid - refunded;
  if (refunded > 0 && net <= 0) return "REFUNDED";
  if (net <= 0) return "UNPAID";
  if (net < total) return "PARTIALLY_PAID";
  if (net === total) return "PAID";
  return "OVERPAID";
}

export const balanceOf = (o: Pick<Order, "total" | "paidAmount" | "refundedAmount">) => o.total - (o.paidAmount - o.refundedAmount);

/** Re-derives totals from the lines and the payment status from the money received. */
export async function recalcOrder(ctx: Ctx, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) throw notFound("سفارش");
  const items = await ctx.db.select({ s: orderItems.lineSubtotal }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const sum = items.reduce((s, i) => s + i.s, 0);
  const t = computeTotals({ itemSubtotals: items.map((i) => i.s), discount: Math.min(o.discountAmount, sum), shipping: o.shippingAmount, vatPct: o.vatPct });
  const paymentStatus = derivePaymentStatus(t.total, o.paidAmount, o.refundedAmount);
  const [row] = await ctx.db.update(orders).set({ subtotal: t.subtotal, vatAmount: t.vatAmount, total: t.total, paymentStatus }).where(eq(orders.id, orderId)).returning();
  return row!;
}
