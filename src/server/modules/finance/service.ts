import { and, eq, sql } from "drizzle-orm";
import { customers, orders, payments } from "@/server/db/schema";
import { appUrl } from "@/server/config/env";
import { type Ctx, actorUserId, assertCan, can, inTx, systemCtx } from "@/server/core/context";
import { AppError, conflict, invalidState, isUniqueViolation, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { paymentProvider } from "@/server/integrations/payment";
import { recomputeOrder, orderEvent } from "@/server/modules/orders/state";
import { depositSatisfied, syncOrder } from "@/server/modules/production/engine";
import { getSetting } from "@/server/modules/settings/service";
import { formatToman } from "@/lib/persian";

type Payment = typeof payments.$inferSelect;
type Method = Payment["method"];

export const balanceOf = (o: Pick<typeof orders.$inferSelect, "total" | "paidAmount" | "refundedAmount">) => o.total - (o.paidAmount - o.refundedAmount);

async function lockOrderFor(ctx: Ctx, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) throw notFound("سفارش");
  if (ctx.actor.kind === "customer" && o.customerId !== ctx.actor.customerId) throw notFound("سفارش");
  return o;
}

/** Applies a confirmed payment/refund to the order and fans out the consequences. */
async function applyConfirmed(ctx: Ctx, p: Payment) {
  if (p.kind === "PAYMENT") {
    await ctx.db.update(orders).set({ paidAmount: sql`${orders.paidAmount} + ${p.amount}` }).where(eq(orders.id, p.orderId));
    await orderEvent(ctx, { orderId: p.orderId, domain: "PAYMENT", type: "PAYMENT_RECEIVED", message: `پرداخت ${formatToman(p.amount)} (${METHOD_LABEL[p.method]}) ثبت شد`, visibleToCustomer: true });
    await emit(ctx, "PaymentReceived", { type: "order", id: p.orderId }, { orderId: p.orderId, paymentId: p.id, amount: p.amount });
  } else {
    await ctx.db.update(orders).set({ refundedAmount: sql`${orders.refundedAmount} + ${p.amount}` }).where(eq(orders.id, p.orderId));
    await orderEvent(ctx, { orderId: p.orderId, domain: "PAYMENT", type: "REFUND", message: `بازپرداخت ${formatToman(p.amount)}`, visibleToCustomer: true });
    await emit(ctx, "PaymentRefunded", { type: "order", id: p.orderId }, { orderId: p.orderId, paymentId: p.id, amount: p.amount });
  }
  const order = await recomputeOrder(ctx, p.orderId);
  // Web orders are confirmed automatically once the deposit is in.
  const settings = await getSetting(ctx.db, "orders");
  if (p.kind === "PAYMENT" && order.status === "PENDING_REVIEW" && order.source === "WEBSITE" && settings.autoConfirmPaidWebOrders && depositSatisfied(order)) {
    const { confirmOrder } = await import("@/server/modules/orders/service");
    await confirmOrder({ ...ctx, actor: { kind: "system", name: "auto-confirm" } }, p.orderId);
  } else {
    await syncOrder(ctx, p.orderId);
  }
}

export const METHOD_LABEL: Record<Method, string> = {
  ONLINE: "پرداخت اینترنتی",
  CASH: "نقدی",
  POS: "کارتخوان",
  BANK_TRANSFER: "کارت به کارت / حواله",
  CHEQUE: "چک",
  CREDIT: "اعتبار مشتری",
};

// ── Online payments ─────────────────────────────────────────────────────────

export async function startOnlinePayment(ctx: Ctx, orderId: string, input: { amount?: number; idempotencyKey: string }) {
  if (ctx.actor.kind !== "customer") assertCan(ctx, "payment.create");
  const provider = paymentProvider();
  const created = await inTx(ctx, async (tx) => {
    const o = await lockOrderFor(tx, orderId);
    if (o.status === "CANCELLED") throw invalidState("سفارش لغو شده است.");
    const balance = balanceOf(o);
    if (balance <= 0) throw invalidState("این سفارش بدهی ندارد.");
    const minDeposit = Math.max(0, Math.ceil((o.total * o.depositPct) / 100) - (o.paidAmount - o.refundedAmount));
    const amount = input.amount ?? balance;
    if (!Number.isInteger(amount) || amount <= 0 || amount > balance) throw validation("مبلغ پرداخت نامعتبر است.");
    if (amount < Math.min(minDeposit, balance)) throw validation("مبلغ پرداخت کمتر از پیش‌پرداخت لازم است.");
    const [customer] = await tx.db.select({ phone: customers.phone }).from(customers).where(eq(customers.id, o.customerId));
    try {
      const [p] = await tx.db
        .insert(payments)
        .values({ orderId, customerId: o.customerId, kind: "PAYMENT", method: "ONLINE", status: "PENDING", amount, provider: provider.name, idempotencyKey: `online:${orderId}:${input.idempotencyKey}`, createdBy: actorUserId(tx) })
        .returning();
      return { payment: p!, order: o, phone: customer?.phone };
    } catch (err) {
      if (isUniqueViolation(err, "payments_idempotency_uq")) throw conflict("این پرداخت قبلاً ایجاد شده است.");
      throw err;
    }
  });
  const callbackUrl = appUrl(`/api/v1/payments/callback/${provider.name}`);
  callbackUrl.searchParams.set("pid", created.payment.id);
  // Gateway call happens outside the DB transaction.
  const req = await provider.request({
    paymentId: created.payment.id,
    amountRial: created.payment.amount,
    description: `سفارش ${created.order.number} — هنر آفاق`,
    callbackUrl: callbackUrl.toString(),
    mobile: created.phone,
  });
  await ctx.db.update(payments).set({ providerAuthority: req.authority }).where(eq(payments.id, created.payment.id));
  return { paymentId: created.payment.id, redirectUrl: req.redirectUrl, sandbox: !provider.isLive };
}

/**
 * Handles the gateway callback. Idempotent: the payment row is locked, a
 * payment that is already final is returned as-is, and the provider's
 * reference id is unique — a replayed callback can never double-credit.
 */
export async function handlePaymentCallback(providerName: string, query: URLSearchParams) {
  const provider = paymentProvider(providerName);
  const paymentId = query.get("pid");
  const { authority, success } = provider.parseCallback(query);
  if (!paymentId || !authority) throw validation("پاسخ درگاه نامعتبر است.");
  const ctx = systemCtx(`payment:${providerName}`);
  return inTx(ctx, async (tx) => {
    const [p] = await tx.db.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p || p.provider !== providerName || p.providerAuthority !== authority) throw notFound("پرداخت");
    if (p.status === "CONFIRMED" || p.status === "FAILED" || p.status === "CANCELLED") return p;
    if (!success) {
      const [row] = await tx.db.update(payments).set({ status: "CANCELLED", gatewayPayload: Object.fromEntries(query) }).where(eq(payments.id, p.id)).returning();
      return row!;
    }
    const result = await provider.verify({ authority, amountRial: p.amount });
    if (!result.ok) {
      const [row] = await tx.db.update(payments).set({ status: "FAILED", gatewayPayload: result.raw }).where(eq(payments.id, p.id)).returning();
      return row!;
    }
    const [row] = await tx.db
      .update(payments)
      .set({ status: "CONFIRMED", providerRefId: result.refId, cardPanMasked: result.cardPanMasked ?? null, gatewayPayload: result.raw, confirmedAt: new Date(), reference: result.refId })
      .where(eq(payments.id, p.id))
      .returning();
    await applyConfirmed(tx, row!);
    return row!;
  });
}

// ── Manual payments (accounting) ────────────────────────────────────────────

export async function recordManualPayment(
  ctx: Ctx,
  orderId: string,
  input: { method: Exclude<Method, "ONLINE">; amount: number; reference?: string | null; chequeDueDate?: Date | null; note?: string | null; receiptFileId?: string | null; idempotencyKey: string },
) {
  const isCustomer = ctx.actor.kind === "customer";
  if (isCustomer) {
    if (input.method !== "BANK_TRANSFER") throw validation("فقط ثبت رسید واریز برای مشتری مجاز است.");
    if (!input.receiptFileId) throw validation("تصویر رسید واریز را بارگذاری کنید.");
  } else assertCan(ctx, "payment.create");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw validation("مبلغ نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const o = await lockOrderFor(tx, orderId);
    if (o.status === "CANCELLED") throw invalidState("سفارش لغو شده است.");
    if (input.amount > balanceOf(o)) throw validation("مبلغ بیشتر از مانده حساب سفارش است.");
    // Cheques stay pending until cleared; everything else is confirmed directly by an approver.
    const autoConfirm = !isCustomer && can(tx, "payment.approve") && input.method !== "CHEQUE";
    let p: Payment;
    try {
      [p] = (await tx.db
        .insert(payments)
        .values({
          orderId,
          customerId: o.customerId,
          kind: "PAYMENT",
          method: input.method,
          status: autoConfirm ? "CONFIRMED" : "AWAITING_APPROVAL",
          amount: input.amount,
          reference: input.reference ?? null,
          chequeDueDate: input.chequeDueDate ?? null,
          note: input.note ?? null,
          receiptFileId: input.receiptFileId ?? null,
          idempotencyKey: `manual:${orderId}:${input.idempotencyKey}`,
          createdBy: actorUserId(tx),
          approvedBy: autoConfirm ? actorUserId(tx) : null,
          approvedAt: autoConfirm ? new Date() : null,
          confirmedAt: autoConfirm ? new Date() : null,
        })
        .returning()) as [Payment];
    } catch (err) {
      if (isUniqueViolation(err, "payments_idempotency_uq")) throw conflict("این پرداخت قبلاً ثبت شده است.", { duplicate: true });
      throw err;
    }
    await audit(tx, { action: "payment.create", entityType: "payment", entityId: p.id, after: { orderId, amount: p.amount, method: p.method, status: p.status } });
    if (autoConfirm) await applyConfirmed(tx, p);
    else await emit(tx, "PaymentAwaitingApproval", { type: "order", id: orderId }, { orderId, paymentId: p.id });
    return p;
  });
}

export async function approvePayment(ctx: Ctx, paymentId: string) {
  assertCan(ctx, "payment.approve");
  return inTx(ctx, async (tx) => {
    const [p] = await tx.db.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) throw notFound("پرداخت");
    if (p.status !== "AWAITING_APPROVAL") throw invalidState("این پرداخت در انتظار تأیید نیست.");
    await lockOrderFor(tx, p.orderId);
    const [row] = await tx.db
      .update(payments)
      .set({ status: "CONFIRMED", approvedBy: actorUserId(tx), approvedAt: new Date(), confirmedAt: new Date() })
      .where(eq(payments.id, paymentId))
      .returning();
    await audit(tx, { action: "payment.approve", entityType: "payment", entityId: paymentId, before: { status: p.status }, after: { status: "CONFIRMED" } });
    await applyConfirmed(tx, row!);
    return row!;
  });
}

export async function rejectPayment(ctx: Ctx, paymentId: string, reason: string) {
  assertCan(ctx, "payment.approve");
  if (!reason.trim()) throw validation("دلیل رد الزامی است.");
  return inTx(ctx, async (tx) => {
    const [p] = await tx.db.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) throw notFound("پرداخت");
    if (p.status !== "AWAITING_APPROVAL") throw invalidState("این پرداخت در انتظار تأیید نیست.");
    await tx.db.update(payments).set({ status: "REJECTED", rejectionReason: reason, approvedBy: actorUserId(tx), approvedAt: new Date() }).where(eq(payments.id, paymentId));
    await audit(tx, { action: "payment.reject", entityType: "payment", entityId: paymentId, reason });
    await orderEvent(tx, { orderId: p.orderId, domain: "PAYMENT", type: "PAYMENT_REJECTED", message: `پرداخت تأیید نشد: ${reason}`, visibleToCustomer: true });
  });
}

/** Records a refund (money is returned by bank transfer; gateway refunds are not automated). */
export async function refundPayment(ctx: Ctx, orderId: string, input: { amount: number; method: Exclude<Method, "ONLINE" | "CREDIT">; reference?: string | null; reason: string; idempotencyKey: string }) {
  assertCan(ctx, "payment.refund");
  if (!input.reason.trim()) throw validation("دلیل بازپرداخت الزامی است.");
  return inTx(ctx, async (tx) => {
    const o = await lockOrderFor(tx, orderId);
    const net = o.paidAmount - o.refundedAmount;
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > net) throw validation(`حداکثر مبلغ قابل بازپرداخت ${formatToman(net)} است.`);
    let p: Payment;
    try {
      [p] = (await tx.db
        .insert(payments)
        .values({
          orderId,
          customerId: o.customerId,
          kind: "REFUND",
          method: input.method,
          status: "CONFIRMED",
          amount: input.amount,
          reference: input.reference ?? null,
          note: input.reason,
          idempotencyKey: `refund:${orderId}:${input.idempotencyKey}`,
          createdBy: actorUserId(tx),
          approvedBy: actorUserId(tx),
          approvedAt: new Date(),
          confirmedAt: new Date(),
        })
        .returning()) as [Payment];
    } catch (err) {
      if (isUniqueViolation(err, "payments_idempotency_uq")) throw conflict("این بازپرداخت قبلاً ثبت شده است.", { duplicate: true });
      throw err;
    }
    await audit(tx, { action: "payment.refund", entityType: "payment", entityId: p.id, after: { orderId, amount: input.amount }, reason: input.reason });
    await applyConfirmed(tx, p);
    return p;
  });
}

export async function paymentsForOrder(ctx: Ctx, orderId: string) {
  return ctx.db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(payments.createdAt);
}

export async function assertPaymentOwner(ctx: Ctx, paymentId: string) {
  const [p] = await ctx.db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) throw notFound("پرداخت");
  if (ctx.actor.kind === "customer" && p.customerId !== ctx.actor.customerId) throw notFound("پرداخت");
  if (ctx.actor.kind === "anonymous") throw new AppError("UNAUTHENTICATED", "ابتدا وارد شوید.");
  return p;
}

export async function pendingApprovals(ctx: Ctx) {
  assertCan(ctx, "payment.view");
  return ctx.db
    .select({ payment: payments, orderNumber: orders.number, customerName: customers.fullName })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .where(and(eq(payments.status, "AWAITING_APPROVAL")))
    .orderBy(payments.createdAt);
}
