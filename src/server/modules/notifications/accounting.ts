import { and, eq } from "drizzle-orm";
import { customers, integrationLinks, orderItems, orders, payments } from "@/server/db/schema";
import type { Ctx } from "@/server/core/context";
import { accountingAdapter, type SyncResult } from "@/server/integrations/accounting";

async function record(ctx: Ctx, entityType: string, entityId: string, result: SyncResult, provider: string) {
  const values = {
    provider,
    entityType,
    entityId,
    externalId: result.status === "SYNCED" ? result.externalId : null,
    status: result.status,
    lastError: result.status === "SYNCED" ? null : result.reason,
    lastSyncedAt: new Date(),
  };
  await ctx.db
    .insert(integrationLinks)
    .values(values)
    .onConflictDoUpdate({ target: [integrationLinks.provider, integrationLinks.entityType, integrationLinks.entityId], set: values });
}

/** Outbox handler: mirrors invoices and payments to the configured accounting system. */
export async function dispatchAccounting(ctx: Ctx, e: { type: string; payload: Record<string, unknown> }) {
  const adapter = accountingAdapter();
  if (e.type === "OrderConfirmed") {
    const orderId = String(e.payload.orderId);
    const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
    if (!o) return;
    const [c] = await ctx.db.select().from(customers).where(eq(customers.id, o.customerId));
    const items = await ctx.db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "ACTIVE")));
    const result = await adapter.syncInvoice({
      orderId,
      orderNumber: o.number,
      customer: { id: c!.id, name: c!.fullName, phone: c!.phone, nationalId: c!.nationalId, economicCode: c!.economicCode },
      issuedAt: (o.confirmedAt ?? new Date()).toISOString(),
      lines: items.map((i) => ({ title: i.title, quantity: i.quantity, unitPrice: Math.round(i.lineSubtotal / i.quantity), amount: i.lineSubtotal })),
      subtotal: o.subtotal,
      discount: o.discountAmount,
      vat: o.vatAmount,
      shipping: o.shippingAmount,
      total: o.total,
    });
    await record(ctx, "order", orderId, result, adapter.name);
  }
  if (e.type === "PaymentReceived" || e.type === "PaymentRefunded") {
    const paymentId = String(e.payload.paymentId);
    const [p] = await ctx.db.select({ payment: payments, number: orders.number }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.id, paymentId));
    if (!p) return;
    const result = await adapter.syncPayment({
      paymentId,
      orderNumber: p.number,
      customerId: p.payment.customerId,
      kind: p.payment.kind,
      method: p.payment.method,
      amount: p.payment.amount,
      reference: p.payment.reference,
      at: (p.payment.confirmedAt ?? new Date()).toISOString(),
    });
    await record(ctx, "payment", paymentId, result, adapter.name);
  }
}
