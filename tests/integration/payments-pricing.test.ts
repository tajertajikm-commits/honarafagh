import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { customers, orderItems, orders, payments, users } from "@/server/db/schema";
import { createCtx, type Ctx } from "@/server/core/context";
import { approvePayment, handlePaymentCallback, recordManualPayment, refundPayment, rejectPayment, startOnlinePayment } from "@/server/modules/finance/service";
import { addCartItem, cartView, getOrCreateCart } from "@/server/modules/orders/cart";
import { checkout, createManualOrder, overrideItemPrice } from "@/server/modules/orders/service";
import { createDraft, priceProduct, publishDraft, publishedVersion, updateDraft } from "@/server/modules/pricing/service";
import { acceptQuote, createQuote, sendQuote } from "@/server/modules/quotes/service";
import type { PricingRules } from "@/server/modules/pricing/types";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { ACCOUNTANT, MANAGER, resetTestDb, SALES, staffCtx } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();

async function newCustomer(phone: string): Promise<{ id: string; ctx: Ctx }> {
  const [u] = await db().insert(users).values({ phone, fullName: "مشتری آزمون", kind: "CUSTOMER" }).returning();
  const [c] = await db().insert(customers).values({ phone, fullName: "مشتری آزمون", userId: u!.id }).returning();
  return { id: c!.id, ctx: createCtx({ kind: "customer", userId: u!.id, customerId: c!.id, name: "مشتری" }) };
}
const orderRow = async (id: string) => (await db().select().from(orders).where(eq(orders.id, id)))[0]!;

beforeAll(async () => {
  ref = await resetTestDb();
});
afterAll(async () => {
  await closeDb();
});

describe("website checkout", () => {
  it("re-prices server-side, rejects stale totals, and is idempotent", async () => {
    const c = await newCustomer("09360000001");
    const cart = await getOrCreateCart(c.ctx);
    await addCartItem(c.ctx, cart, { productId: ref.products.get("business-card")!, quantity: 1000, selections: { lamination: "matte" }, urgency: "STANDARD" });
    const view = await cartView(c.ctx, cart);
    expect(view.lines).toHaveLength(1);
    const methodId = ref.deliveryMethods.get("PICKUP")!;
    const expected = view.subtotal + Math.round(view.subtotal * 0.1);

    await expect(checkout(c.ctx, { deliveryMethodId: methodId, expectedTotal: expected - 10_000, idempotencyKey: "k1" })).rejects.toThrow(/به‌روزرسانی/);
    const order = await checkout(c.ctx, { deliveryMethodId: methodId, expectedTotal: expected, idempotencyKey: "k1" });
    expect(order.total).toBe(expected);
    expect(order.source).toBe("WEBSITE");
    // Cart emptied; a replay with the same key cannot create a second order
    expect((await cartView(c.ctx, cart)).lines).toHaveLength(0);
    await addCartItem(c.ctx, cart, { productId: ref.products.get("business-card")!, quantity: 1000, selections: { lamination: "matte" }, urgency: "STANDARD" });
    await expect(checkout(c.ctx, { deliveryMethodId: methodId, expectedTotal: expected, idempotencyKey: "k1" })).rejects.toThrow(/قبلاً/);
  });
});

describe("online payment (fake gateway)", () => {
  let orderId = "";
  let customer: { id: string; ctx: Ctx };

  it("pays the deposit online, auto-confirms the web order, and ignores callback replays", async () => {
    customer = await newCustomer("09360000002");
    const cart = await getOrCreateCart(customer.ctx);
    await addCartItem(customer.ctx, cart, { productId: ref.products.get("sticker")!, quantity: 500, selections: {}, urgency: "STANDARD" });
    const view = await cartView(customer.ctx, cart);
    const order = await checkout(customer.ctx, { deliveryMethodId: ref.deliveryMethods.get("PICKUP")!, expectedTotal: view.subtotal + Math.round(view.subtotal * 0.1), idempotencyKey: "a" });
    orderId = order.id;

    await expect(startOnlinePayment(customer.ctx, orderId, { amount: 1000, idempotencyKey: "p0" })).rejects.toThrow(/پیش‌پرداخت/);
    const deposit = Math.ceil(order.total / 2);
    const start = await startOnlinePayment(customer.ctx, orderId, { amount: deposit, idempotencyKey: "p1" });
    expect(start.sandbox).toBe(true);
    const authority = new URL(start.redirectUrl).searchParams.get("authority")!;
    const q = new URLSearchParams({ pid: start.paymentId, Authority: authority, Status: "OK" });

    const p1 = await handlePaymentCallback("fake", q);
    expect(p1.status).toBe("CONFIRMED");
    const replay = await handlePaymentCallback("fake", q);
    expect(replay.status).toBe("CONFIRMED");
    const o = await orderRow(orderId);
    expect(o.paidAmount).toBe(deposit); // credited once
    expect(o.paymentStatus).toBe("PARTIALLY_PAID");
    expect(o.status).toBe("CONFIRMED"); // auto-confirmed after deposit
  });

  it("rejects tampered callbacks and records cancellations", async () => {
    const start = await startOnlinePayment(customer.ctx, orderId, { idempotencyKey: "p2" });
    await expect(handlePaymentCallback("fake", new URLSearchParams({ pid: start.paymentId, Authority: "FAKE-forged", Status: "OK" }))).rejects.toThrow();
    const authority = new URL(start.redirectUrl).searchParams.get("authority")!;
    const cancelled = await handlePaymentCallback("fake", new URLSearchParams({ pid: start.paymentId, Authority: authority, Status: "NOK" }));
    expect(cancelled.status).toBe("CANCELLED");
    expect((await orderRow(orderId)).paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("records a payment the bank declines at verification as failed, without crediting", async () => {
    const before = await orderRow(orderId);
    const start = await startOnlinePayment(customer.ctx, orderId, { idempotencyKey: "p3" });
    const authority = new URL(start.redirectUrl).searchParams.get("authority")!;
    const failed = await handlePaymentCallback("fake", new URLSearchParams({ pid: start.paymentId, Authority: authority, Status: "FAIL" }));
    expect(failed.status).toBe("FAILED");
    const after = await orderRow(orderId);
    expect(after.paidAmount).toBe(before.paidAmount);
    expect(after.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("another customer cannot pay into (or read) someone else's order", async () => {
    const other = await newCustomer("09360000003");
    await expect(startOnlinePayment(other.ctx, orderId, { idempotencyKey: "x" })).rejects.toThrow(/پیدا نشد/);
  });

  it("customer bank-transfer receipts wait for accountant approval", async () => {
    const o = await orderRow(orderId);
    await expect(recordManualPayment(customer.ctx, orderId, { method: "BANK_TRANSFER", amount: 1000, idempotencyKey: "r0" })).rejects.toThrow(/رسید/);
    const { storeUpload } = await import("@/server/modules/files/service");
    const img = await storeUpload(customer.ctx, { data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), filename: "r.jpg", purpose: "PAYMENT_RECEIPT" });
    const p = await recordManualPayment(customer.ctx, orderId, { method: "BANK_TRANSFER", amount: o.total - o.paidAmount, receiptFileId: img.id, idempotencyKey: "r1" });
    expect(p.status).toBe("AWAITING_APPROVAL");
    expect((await orderRow(orderId)).paidAmount).toBe(o.paidAmount);
    const acc = await staffCtx(ref, ACCOUNTANT);
    await approvePayment(acc, p.id);
    const after = await orderRow(orderId);
    expect(after.paymentStatus).toBe("PAID");
    await expect(approvePayment(acc, p.id)).rejects.toThrow(); // cannot approve twice
  });

  it("refunds cannot exceed what was paid", async () => {
    const acc = await staffCtx(ref, ACCOUNTANT);
    const o = await orderRow(orderId);
    await expect(refundPayment(acc, orderId, { amount: o.paidAmount + 1, method: "BANK_TRANSFER", reason: "x", idempotencyKey: "rf0" })).rejects.toThrow(/حداکثر/);
    await refundPayment(acc, orderId, { amount: 100_000, method: "BANK_TRANSFER", reason: "تخفیف پس از تحویل", idempotencyKey: "rf1" });
    const after = await orderRow(orderId);
    expect(after.refundedAmount).toBe(100_000);
    expect(after.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("sales cannot approve payments; rejected payments never touch the balance", async () => {
    const sales = await staffCtx(ref, SALES);
    const o = await orderRow(orderId);
    const p = await recordManualPayment(sales, orderId, { method: "CASH", amount: 50_000, idempotencyKey: "s1" });
    expect(p.status).toBe("AWAITING_APPROVAL");
    await expect(approvePayment(sales, p.id)).rejects.toThrow(/مجوز/);
    await rejectPayment(await staffCtx(ref, ACCOUNTANT), p.id, "وجهی دریافت نشد");
    expect((await orderRow(orderId)).paidAmount).toBe(o.paidAmount);
    const [row] = await db().select().from(payments).where(eq(payments.id, p.id));
    expect(row!.status).toBe("REJECTED");
  });
});

describe("pricing versions and snapshots", () => {
  it("publishing new rules never changes existing orders", async () => {
    const c = await newCustomer("09360000010");
    const sales = await staffCtx(ref, SALES);
    const mgr = await staffCtx(ref, MANAGER);
    const order = await createManualOrder(sales, { customerId: c.id, items: [{ productId: ref.products.get("flyer")!, quantity: 1000 }] });
    const before = await orderRow(order.id);
    const [itemBefore] = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const live = await publishedVersion(db(), ref.ruleSetId);
    await expect(updateDraft(mgr, live.id, live.data)).rejects.toThrow(/پیش‌نویس/); // published versions are immutable
    const draft = await createDraft(mgr, live.id, "افزایش نرخ");
    const data = structuredClone(draft.data) as PricingRules;
    if (data.methods.OFFSET!.kind === "OFFSET") data.methods.OFFSET!.runCostPer1000PerColor *= 2;
    if (data.methods.DIGITAL!.kind === "DIGITAL") data.methods.DIGITAL!.clickCostColor *= 2;
    await updateDraft(mgr, draft.id, data);
    await expect(publishDraft(sales, draft.id)).rejects.toThrow(/مجوز/);
    await publishDraft(mgr, draft.id);

    const newPrice = await priceProduct(db(), { productId: ref.products.get("flyer")!, quantity: 1000, selections: {}, urgency: "STANDARD" });
    expect(newPrice.subtotal).toBeGreaterThan(itemBefore!.lineSubtotal);
    expect(newPrice.ruleVersionId).toBe(draft.id);

    const after = await orderRow(order.id);
    const [itemAfter] = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(after.total).toBe(before.total);
    expect(itemAfter!.priceSnapshot).toEqual(itemBefore!.priceSnapshot);
    expect(itemAfter!.pricingVersionId).toBe(live.id);
  });

  it("price overrides require permission and are audited", async () => {
    const c = await newCustomer("09360000011");
    const sales = await staffCtx(ref, SALES);
    const order = await createManualOrder(sales, { customerId: c.id, items: [{ productId: ref.products.get("letterhead")!, quantity: 500 }] });
    const [item] = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await expect(overrideItemPrice(sales, item!.id, 1_000_000, "x")).rejects.toThrow(/مجوز/);
    const totals = await overrideItemPrice(await staffCtx(ref, MANAGER), item!.id, 10_000_000, "مشتری عمده");
    expect(totals.subtotal).toBe(10_000_000);
    expect(totals.total).toBe(10_000_000 + Math.round(10_000_000 * 0.1));
  });
});

describe("quotation", () => {
  it("honours the quoted price after rules change, and converts to an order once", async () => {
    const c = await newCustomer("09360000020");
    const sales = await staffCtx(ref, SALES);
    const q = await createQuote(sales, { customerId: c.id, items: [{ productId: ref.products.get("catalog")!, quantity: 250, selections: { pages: 24 } }, { title: "طراحی لوگو", quantity: 1, lineSubtotal: 20_000_000 }] });
    await expect(acceptQuote(c.ctx, q.id)).rejects.toThrow(); // not sent yet
    await sendQuote(sales, q.id);
    const order = await acceptQuote(c.ctx, q.id);
    expect(order.subtotal).toBe(q.subtotal);
    expect(order.total).toBe(q.total);
    expect(order.source).toBe("QUOTE");
    await expect(acceptQuote(c.ctx, q.id)).rejects.toThrow();
  });
});
