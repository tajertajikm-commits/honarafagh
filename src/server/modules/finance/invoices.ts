import { asc, desc, eq } from "drizzle-orm";
import { customers, invoices, orderItems, type InvoiceLine, type InvoiceSnapshot } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, can, inTx } from "@/server/core/context";
import { forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { balanceOf, loadOrder, orderEvent } from "@/server/modules/orders/state";
import { getSetting } from "@/server/modules/settings/service";
import { customerCodeLabel } from "@/lib/order-status";

export type InvoiceType = "OFFICIAL" | "UNOFFICIAL";

const PAYMENT_LABEL: Record<string, string> = { UNPAID: "پرداخت نشده", PARTIALLY_PAID: "پرداخت بخشی", PAID: "تسویه شده", OVERPAID: "بیش از مبلغ", REFUNDED: "بازپرداخت شده" };

/** Splits the order discount across lines in proportion to their amounts (last line takes the rounding). */
export function allocateDiscount(subtotals: number[], discount: number): number[] {
  const sum = subtotals.reduce((s, x) => s + x, 0);
  if (sum <= 0 || discount <= 0) return subtotals.map(() => 0);
  let left = discount;
  return subtotals.map((x, i) => {
    if (i === subtotals.length - 1) return left;
    const d = Math.floor((discount * x) / sum);
    left -= d;
    return d;
  });
}

/**
 * Issues an invoice for an order. Official (legal entity) invoices require
 * the company's identifiers; everything printed is frozen into a snapshot, so
 * later edits to the customer or the order never change an issued invoice.
 */
export async function issueInvoice(ctx: Ctx, orderId: string, input: { type?: InvoiceType; notes?: string | null } = {}) {
  assertCan(ctx, "invoice.manage");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (o.status === "REJECTED" || o.status === "CANCELLED") throw invalidState("برای سفارش بسته‌شده فاکتور صادر نمی‌شود.");
    if (!o.pricedAt || o.total <= 0) throw invalidState("مبلغ سفارش هنوز تعیین نشده است.");
    const [c] = await tx.db.select().from(customers).where(eq(customers.id, o.customerId));
    if (!c) throw notFound("مشتری");
    const type: InvoiceType = input.type ?? (c.type === "COMPANY" ? "OFFICIAL" : "UNOFFICIAL");
    if (type === "OFFICIAL") {
      if (!c.companyName?.trim()) throw validation("برای فاکتور رسمی، نام شرکت مشتری را در پرونده مشتری ثبت کنید.");
      if (!c.nationalId?.trim() && !c.economicCode?.trim()) throw validation("برای فاکتور رسمی، شناسه ملی یا کد اقتصادی شرکت را ثبت کنید.");
    }
    const items = await tx.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.lineNo));
    if (items.length === 0) throw invalidState("سفارش ردیف قابل فاکتور ندارد.");
    const discounts = allocateDiscount(items.map((i) => i.lineSubtotal), o.discountAmount);
    const lines: InvoiceLine[] = items.map((i, idx) => ({
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unit: i.unitLabel,
      unitPrice: Math.round(i.lineSubtotal / i.quantity),
      discount: discounts[idx]!,
      total: i.lineSubtotal - discounts[idx]!,
    }));
    const business = await getSetting(tx.db, "business");
    const terms = await getSetting(tx.db, "invoice");
    const paid = o.paidAmount - o.refundedAmount;
    const snapshot: InvoiceSnapshot = {
      customerCode: customerCodeLabel(c.code),
      orderCode: o.code,
      seller: { name: business.legalName || business.name, companyName: business.name, nationalId: business.nationalId || null, economicCode: business.economicCode || null, registrationNo: business.registrationNo || null, phone: business.phone || null, address: business.address || null, postalCode: business.postalCode || null },
      buyer:
        type === "OFFICIAL"
          ? { name: c.fullName, companyName: c.companyName, nationalId: c.nationalId, economicCode: c.economicCode, registrationNo: c.registrationNo, phone: c.phone, address: c.billingAddress ?? o.shippingAddress?.line ?? null, postalCode: c.postalCode ?? o.shippingAddress?.postalCode ?? null }
          : { name: c.fullName, nationalId: c.nationalId, phone: c.phone, address: c.billingAddress ?? o.shippingAddress?.line ?? null, postalCode: c.postalCode ?? null },
      lines,
      subtotal: o.subtotal,
      discount: o.discountAmount,
      shipping: o.shippingAmount,
      vatPct: o.vatPct,
      vat: o.vatAmount,
      total: o.total,
      paid,
      remaining: balanceOf(o),
      paymentStatus: PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus,
      paymentTerms: terms.paymentTerms || null,
    };
    const [inv] = await tx.db.insert(invoices).values({ orderId, customerId: c.id, type, snapshot, total: o.total, notes: input.notes?.trim() || (type === "OFFICIAL" ? terms.officialNote || null : null), issuedBy: actorUserId(tx) }).returning();
    await orderEvent(tx, { orderId, domain: "PAYMENT", type: "INVOICE_ISSUED", message: `فاکتور ${type === "OFFICIAL" ? "رسمی" : "غیررسمی"} شماره ${inv!.number} صادر شد`, visibleToCustomer: true });
    await audit(tx, { action: "invoice.issue", entityType: "invoice", entityId: inv!.id, after: { number: inv!.number, type, total: o.total } });
    await emit(tx, "InvoiceIssued", { type: "order", id: orderId }, { orderId, invoiceId: inv!.id });
    return inv!;
  });
}

export async function voidInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  assertCan(ctx, "invoice.manage");
  if (reason.trim().length < 3) throw validation("دلیل ابطال را بنویسید.");
  return inTx(ctx, async (tx) => {
    const [inv] = await tx.db.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv) throw notFound("فاکتور");
    if (inv.status === "VOID") throw invalidState("این فاکتور قبلاً باطل شده است.");
    await tx.db.update(invoices).set({ status: "VOID", voidedAt: new Date(), voidReason: reason.trim() }).where(eq(invoices.id, invoiceId));
    await orderEvent(tx, { orderId: inv.orderId, domain: "PAYMENT", type: "INVOICE_VOID", message: `فاکتور ${inv.number} باطل شد: ${reason.trim()}` });
    await audit(tx, { action: "invoice.void", entityType: "invoice", entityId: invoiceId, reason });
  });
}

/** Accounting staff, or the customer the invoice was issued to. */
export async function getInvoice(ctx: Ctx, invoiceId: string) {
  const [inv] = await ctx.db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw notFound("فاکتور");
  if (ctx.actor.kind === "customer") {
    if (inv.customerId !== ctx.actor.customerId) throw notFound("فاکتور");
  } else if (!can(ctx, "invoice.manage") && !can(ctx, "payment.view")) throw forbidden();
  return inv;
}

export async function invoicesForOrder(ctx: Ctx, orderId: string) {
  return ctx.db.select().from(invoices).where(eq(invoices.orderId, orderId)).orderBy(desc(invoices.issuedAt));
}

