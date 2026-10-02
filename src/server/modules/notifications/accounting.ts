import { eq } from "drizzle-orm";
import { integrationLinks, invoices, orders, payments } from "@/server/db/schema";
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

/** Outbox handler: mirrors issued invoices and payments to the configured accounting system (Holoo when connected). */
export async function dispatchAccounting(ctx: Ctx, e: { type: string; payload: Record<string, unknown> }) {
  const adapter = accountingAdapter();
  if (e.type === "InvoiceIssued") {
    const invoiceId = String(e.payload.invoiceId);
    const [inv] = await ctx.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) return;
    const s = inv.snapshot;
    const result = await adapter.syncInvoice({
      invoiceId,
      invoiceNumber: inv.number,
      type: inv.type,
      orderId: inv.orderId,
      orderCode: s.orderCode,
      customer: { id: inv.customerId, code: s.customerCode, name: s.buyer.companyName || s.buyer.name, phone: s.buyer.phone ?? null, nationalId: s.buyer.nationalId, economicCode: s.buyer.economicCode },
      issuedAt: inv.issuedAt.toISOString(),
      lines: s.lines.map((l) => ({ title: l.title, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.total })),
      subtotal: s.subtotal,
      discount: s.discount,
      vat: s.vat,
      shipping: s.shipping,
      total: s.total,
    });
    await record(ctx, "invoice", invoiceId, result, adapter.name);
  }
  if (e.type === "PaymentReceived" || e.type === "PaymentRefunded") {
    const paymentId = String(e.payload.paymentId);
    const [p] = await ctx.db.select({ payment: payments, code: orders.code }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.id, paymentId));
    if (!p) return;
    const result = await adapter.syncPayment({
      paymentId,
      orderCode: p.code,
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
