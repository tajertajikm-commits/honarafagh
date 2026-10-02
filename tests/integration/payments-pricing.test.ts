import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { customers, invoices, orderItems, orders, payments, users } from "@/server/db/schema";
import { createCtx, type Ctx } from "@/server/core/context";
import { approvePayment, handlePaymentCallback, recordManualPayment, refundPayment, rejectPayment, startOnlinePayment } from "@/server/modules/finance/service";
import { allocateDiscount, getInvoice, issueInvoice, voidInvoice } from "@/server/modules/finance/invoices";
import { addCartItem, cartView, getOrCreateCart } from "@/server/modules/orders/cart";
import { approveOrder, suggestedStations } from "@/server/modules/orders/approval";
import { checkout, createCustomOrder } from "@/server/modules/orders/create";
import { updateCustomer } from "@/server/modules/people/service";
import { createDraft, priceProduct, publishDraft, publishedVersion, updateDraft } from "@/server/modules/pricing/service";
import type { PricingRules } from "@/server/modules/pricing/types";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { ABDALI, GHOLIPOUR, LABAFI, MANAGER, resetTestDb, staffCtx } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();

async function newCustomer(phone: string, extra: Partial<typeof customers.$inferInsert> = {}): Promise<{ id: string; ctx: Ctx }> {
  const [u] = await db().insert(users).values({ phone, fullName: "مشتری آزمون", kind: "CUSTOMER" }).returning();
  const [c] = await db().insert(customers).values({ phone, fullName: "مشتری آزمون", userId: u!.id, ...extra }).returning();
  return { id: c!.id, ctx: createCtx({ kind: "customer", userId: u!.id, customerId: c!.id, name: "مشتری" }) };
}
const orderRow = async (id: string) => (await db().select().from(orders).where(eq(orders.id, id)))[0]!;

beforeAll(async () => {
  ref = await resetTestDb();
});
afterAll(async () => {
  await closeDb();
});

describe("store checkout", () => {
  it("re-prices server-side, rejects stale totals, is idempotent, and waits for approval", async () => {
    const c = await newCustomer("09360000001");
    const cart = await getOrCreateCart(c.ctx);
    await addCartItem(c.ctx, cart, { productId: ref.products.get("business-card")!, quantity: 1000, selections: { lamination: "matte" }, urgency: "STANDARD" });
    const view = await cartView(c.ctx, cart);
    const methodId = ref.deliveryMethods.get("PICKUP")!;
    const expected = view.subtotal + Math.round(view.subtotal * 0.1);
    await expect(checkout(c.ctx, { deliveryMethodId: methodId, expectedTotal: expected - 10_000, idempotencyKey: "k1" })).rejects.toThrow(/به‌روزرسانی/);
    const r = await checkout(c.ctx, { deliveryMethodId: methodId, expectedTotal: expected, idempotencyKey: "k1" });
    expect(r.orders).toHaveLength(1);
    const o = await orderRow(r.orders[0]!.id);
    expect(o.total).toBe(expected);
    expect(o.kind).toBe("STORE");
    expect(o.status).toBe("WAITING_APPROVAL");
    expect(o.code).toMatch(/^[DO]-\d+-0001$/);
    expect((await cartView(c.ctx, cart)).lines).toHaveLength(0);
    // Stations suggested from the priced operations (lamination was chosen).
    const suggested = await suggestedStations(createCtx({ kind: "system", name: "test" }), o);
    expect(suggested.some((k) => k.endsWith("LAMINATION"))).toBe(true);
    await addCartItem(c.ctx, cart, { productId: ref.products.get("business-card")!, quantity: 1000, selections: { lamination: "matte" }, urgency: "STANDARD" });
    await expect(checkout(c.ctx, { deliveryMethodId: methodId, expectedTotal: expected, idempotencyKey: "k1" })).rejects.toThrow(/قبلاً/);
  });

  it("a cart mixing Digital and Offset items becomes one order per process", async () => {
    const c = await newCustomer("09360000005");
    const cart = await getOrCreateCart(c.ctx);
    await addCartItem(c.ctx, cart, { productId: ref.products.get("business-card")!, quantity: 200, selections: {}, urgency: "STANDARD" });
    await addCartItem(c.ctx, cart, { productId: ref.products.get("flyer")!, quantity: 10_000, selections: {}, urgency: "STANDARD" });
    const lines = (await cartView(c.ctx, cart)).lines;
    const methods = new Set(lines.map((l) => l.price!.method));
    expect(methods.size).toBe(2);
    const courier = ref.deliveryMethods.get("PICKUP")!;
    const byMethod = new Map<string, number>();
    for (const l of lines) byMethod.set(l.price!.method, (byMethod.get(l.price!.method) ?? 0) + l.price!.subtotal);
    const total = [...byMethod.values()].reduce((s, x) => s + x + Math.round(x * 0.1), 0);
    const r = await checkout(c.ctx, { deliveryMethodId: courier, expectedTotal: total, idempotencyKey: "mix" });
    expect(r.orders.map((o) => o.code[0]).sort()).toEqual(["D", "O"]);
  });
});

describe("online payment (fake gateway)", () => {
  let orderId = "";
  let customer: { id: string; ctx: Ctx };

  it("custom orders cannot be paid before they are priced", async () => {
    customer = await newCustomer("09360000002");
    const o = await createCustomOrder(customer.ctx, { productionType: "DIGITAL", title: "منو رستوران", quantity: 50, needsDesign: false, idempotencyKey: "c1" });
    orderId = o.id;
    await expect(startOnlinePayment(customer.ctx, orderId, { idempotencyKey: "p0" })).rejects.toThrow(/تعیین نشده/);
    await approveOrder(await staffCtx(ref, MANAGER), orderId, { steps: ["D_PRINT", "D_CUT", "D_LAMINATION", "D_PACKAGING"], price: { amount: 8_000_000 } });
    expect((await orderRow(orderId)).total).toBe(8_800_000);
  });

  it("pays part online and ignores callback replays", async () => {
    const start = await startOnlinePayment(customer.ctx, orderId, { amount: 4_000_000, idempotencyKey: "p1" });
    expect(start.sandbox).toBe(true);
    const authority = new URL(start.redirectUrl).searchParams.get("authority")!;
    const q = new URLSearchParams({ pid: start.paymentId, Authority: authority, Status: "OK" });
    expect((await handlePaymentCallback("fake", q)).status).toBe("CONFIRMED");
    expect((await handlePaymentCallback("fake", q)).status).toBe("CONFIRMED");
    const o = await orderRow(orderId);
    expect(o.paidAmount).toBe(4_000_000); // credited once
    expect(o.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("rejects tampered callbacks and records cancellations and bank declines", async () => {
    const start = await startOnlinePayment(customer.ctx, orderId, { idempotencyKey: "p2" });
    await expect(handlePaymentCallback("fake", new URLSearchParams({ pid: start.paymentId, Authority: "FAKE-forged", Status: "OK" }))).rejects.toThrow();
    const authority = new URL(start.redirectUrl).searchParams.get("authority")!;
    expect((await handlePaymentCallback("fake", new URLSearchParams({ pid: start.paymentId, Authority: authority, Status: "NOK" }))).status).toBe("CANCELLED");
    const s3 = await startOnlinePayment(customer.ctx, orderId, { idempotencyKey: "p3" });
    const a3 = new URL(s3.redirectUrl).searchParams.get("authority")!;
    expect((await handlePaymentCallback("fake", new URLSearchParams({ pid: s3.paymentId, Authority: a3, Status: "FAIL" }))).status).toBe("FAILED");
    expect((await orderRow(orderId)).paidAmount).toBe(4_000_000);
  });

  it("another customer cannot pay into someone else's order", async () => {
    const other = await newCustomer("09360000003");
    await expect(startOnlinePayment(other.ctx, orderId, { idempotencyKey: "x" })).rejects.toThrow(/پیدا نشد/);
  });

  it("bank-transfer receipts wait for the accountant; only accounting can approve", async () => {
    const o = await orderRow(orderId);
    await expect(recordManualPayment(customer.ctx, orderId, { method: "BANK_TRANSFER", amount: 1000, idempotencyKey: "r0" })).rejects.toThrow(/رسید/);
    const { storeUpload } = await import("@/server/modules/files/service");
    const img = await storeUpload(customer.ctx, { data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), filename: "r.jpg", purpose: "PAYMENT_RECEIPT" });
    const p = await recordManualPayment(customer.ctx, orderId, { method: "BANK_TRANSFER", amount: o.total - o.paidAmount, receiptFileId: img.id, idempotencyKey: "r1" });
    expect(p.status).toBe("AWAITING_APPROVAL");
    await expect(approvePayment(await staffCtx(ref, LABAFI), p.id)).rejects.toThrow(/مجوز/);
    const acc = await staffCtx(ref, ABDALI);
    await approvePayment(acc, p.id);
    expect((await orderRow(orderId)).paymentStatus).toBe("PAID");
    await expect(approvePayment(acc, p.id)).rejects.toThrow();
  });

  it("refunds cannot exceed what was paid; rejected payments never touch the balance", async () => {
    const acc = await staffCtx(ref, ABDALI);
    const o = await orderRow(orderId);
    await expect(refundPayment(acc, orderId, { amount: o.paidAmount + 1, method: "BANK_TRANSFER", reason: "x", idempotencyKey: "rf0" })).rejects.toThrow(/حداکثر/);
    await refundPayment(acc, orderId, { amount: 100_000, method: "BANK_TRANSFER", reason: "تخفیف پس از تحویل", idempotencyKey: "rf1" });
    expect((await orderRow(orderId)).paymentStatus).toBe("PARTIALLY_PAID");
    // A cheque stays pending until cleared; a rejected one never touches the balance.
    const p = await recordManualPayment(acc, orderId, { method: "CHEQUE", amount: 50_000, idempotencyKey: "s1" });
    expect(p.status).toBe("AWAITING_APPROVAL");
    await rejectPayment(acc, p.id, "چک برگشت خورد");
    const [row] = await db().select().from(payments).where(eq(payments.id, p.id));
    expect(row!.status).toBe("REJECTED");
    expect((await orderRow(orderId)).paidAmount).toBe(o.paidAmount);
    expect((await orderRow(orderId)).refundedAmount).toBe(100_000);
  });
});

describe("invoices", () => {
  it("official invoices need the company's identifiers; snapshots never change", async () => {
    const acc = await staffCtx(ref, ABDALI);
    const c = await newCustomer("09360000030", { type: "COMPANY" });
    const o = await createCustomOrder(c.ctx, { productionType: "OFFSET", title: "کاتالوگ محصولات", quantity: 1000, needsDesign: false, idempotencyKey: "inv1" });
    await expect(issueInvoice(acc, o.id)).rejects.toThrow(/تعیین نشده/);
    await approveOrder(await staffCtx(ref, GHOLIPOUR), o.id, { steps: ["O_LITHO", "O_PAPER", "O_PRINT", "O_BINDING", "O_PACKAGING"] });
    const { setOrderPrice } = await import("@/server/modules/orders/approval");
    await setOrderPrice(acc, o.id, { amount: 120_000_000, discount: 10_000_000 });
    await expect(issueInvoice(acc, o.id, { type: "OFFICIAL" })).rejects.toThrow(/نام شرکت/);
    await expect(issueInvoice(await staffCtx(ref, LABAFI), o.id)).rejects.toThrow(/مجوز/);
    await updateCustomer(acc, c.id, { companyName: "شرکت پخش نمونه", nationalId: "10101234567", economicCode: "411122223333", billingAddress: "تهران، خیابان ولیعصر" });
    const inv = await issueInvoice(acc, o.id);
    expect(inv.type).toBe("OFFICIAL");
    expect(inv.snapshot.buyer.companyName).toBe("شرکت پخش نمونه");
    expect(inv.snapshot.lines[0]!.discount).toBe(10_000_000);
    expect(inv.snapshot.total).toBe(121_000_000);
    expect(inv.snapshot.orderCode).toBe((await orderRow(o.id)).code);
    await updateCustomer(acc, c.id, { companyName: "نام جدید شرکت" });
    const again = await getInvoice(acc, inv.id);
    expect(again.snapshot.buyer.companyName).toBe("شرکت پخش نمونه");
    await expect(getInvoice(c.ctx, inv.id)).resolves.toBeTruthy();
    const other = await newCustomer("09360000031");
    await expect(getInvoice(other.ctx, inv.id)).rejects.toThrow(/پیدا نشد/);
    await voidInvoice(acc, inv.id, "اصلاح مبلغ");
    const [row] = await db().select().from(invoices).where(eq(invoices.id, inv.id));
    expect(row!.status).toBe("VOID");
  });

  it("individual customers get an unofficial invoice", async () => {
    const acc = await staffCtx(ref, ABDALI);
    const c = await newCustomer("09360000032", { nationalId: "0012345678" });
    const o = await createCustomOrder(c.ctx, { productionType: "DIGITAL", title: "عکس چاپی", quantity: 20, needsDesign: false, idempotencyKey: "inv2" });
    await approveOrder(await staffCtx(ref, LABAFI), o.id, { steps: ["D_PRINT", "D_PACKAGING"] });
    await (await import("@/server/modules/orders/approval")).setOrderPrice(acc, o.id, { amount: 2_000_000, discount: 0 });
    const inv = await issueInvoice(acc, o.id);
    expect(inv.type).toBe("UNOFFICIAL");
    expect(inv.snapshot.buyer.nationalId).toBe("0012345678");
    expect(inv.snapshot.vat).toBe(200_000);
  });

  it("discount is split across lines in proportion", () => {
    expect(allocateDiscount([100, 300], 40)).toEqual([10, 30]);
    expect(allocateDiscount([1, 1, 1], 10)).toEqual([3, 3, 4]);
    expect(allocateDiscount([100], 0)).toEqual([0]);
  });
});

describe("pricing versions and snapshots", () => {
  it("publishing new rules never changes existing store orders", async () => {
    const c = await newCustomer("09360000010");
    const mgr = await staffCtx(ref, MANAGER);
    const cart = await getOrCreateCart(c.ctx);
    await addCartItem(c.ctx, cart, { productId: ref.products.get("flyer")!, quantity: 1000, selections: {}, urgency: "STANDARD" });
    const view = await cartView(c.ctx, cart);
    const r = await checkout(c.ctx, { deliveryMethodId: ref.deliveryMethods.get("PICKUP")!, expectedTotal: view.subtotal + Math.round(view.subtotal * 0.1), idempotencyKey: "pv" });
    const orderId = r.orders[0]!.id;
    const before = await orderRow(orderId);
    const [itemBefore] = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const live = await publishedVersion(db(), ref.ruleSetId);
    await expect(updateDraft(mgr, live.id, live.data)).rejects.toThrow(/پیش‌نویس/);
    const draft = await createDraft(mgr, live.id, "افزایش نرخ");
    const data = structuredClone(draft.data) as PricingRules;
    if (data.methods.OFFSET!.kind === "OFFSET") data.methods.OFFSET!.runCostPer1000PerColor *= 2;
    if (data.methods.DIGITAL!.kind === "DIGITAL") data.methods.DIGITAL!.clickCostColor *= 2;
    await updateDraft(mgr, draft.id, data);
    await expect(publishDraft(await staffCtx(ref, ABDALI), draft.id)).rejects.toThrow(/مجوز/);
    await publishDraft(mgr, draft.id);
    const newPrice = await priceProduct(db(), { productId: ref.products.get("flyer")!, quantity: 1000, selections: {}, urgency: "STANDARD" });
    expect(newPrice.subtotal).toBeGreaterThan(itemBefore!.lineSubtotal);
    const after = await orderRow(orderId);
    const [itemAfter] = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
    expect(after.total).toBe(before.total);
    expect(itemAfter!.priceSnapshot).toEqual(itemBefore!.priceSnapshot);
  });
});
