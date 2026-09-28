import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { customers, orders } from "@/server/db/schema";
import { assertSettledForDelivery } from "@/server/modules/delivery/service";
import { recordManualPayment } from "@/server/modules/finance/service";
import { createManualOrder, setDepositOverride } from "@/server/modules/orders/service";
import { updateSetting } from "@/server/modules/settings/service";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { ACCOUNTANT, MANAGER, resetTestDb, SALES, staffCtx } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();
const orderRow = async (id: string) => (await db().select().from(orders).where(eq(orders.id, id)))[0]!;

beforeAll(async () => {
  ref = await resetTestDb();
});
afterAll(async () => {
  await closeDb();
});

describe("settlement gate before goods leave", () => {
  let customerId = "";
  let orderId = "";

  it("blocks an order with an open balance", async () => {
    const [c] = await db().insert(customers).values({ phone: "09360000001", fullName: "مشتری اعتباری" }).returning();
    customerId = c!.id;
    const sales = await staffCtx(ref, SALES);
    const o = await createManualOrder(sales, { customerId, items: [{ productId: ref.products.get("business-card")!, quantity: 500, selections: {} }] });
    orderId = o.id;
    const mgr = await staffCtx(ref, MANAGER);
    await expect(assertSettledForDelivery(mgr, await orderRow(orderId))).rejects.toThrow(/مانده/);
  });

  it("passes when the customer's credit limit covers everything they owe", async () => {
    const mgr = await staffCtx(ref, MANAGER);
    const o = await orderRow(orderId);
    await db().update(customers).set({ creditLimit: o.total - 1 }).where(eq(customers.id, customerId));
    await expect(assertSettledForDelivery(mgr, o)).rejects.toThrow(/مانده/);
    await db().update(customers).set({ creditLimit: o.total }).where(eq(customers.id, customerId));
    await expect(assertSettledForDelivery(mgr, o)).resolves.toBeUndefined();
    await db().update(customers).set({ creditLimit: 0 }).where(eq(customers.id, customerId));
  });

  it("passes with a manager's audited payment-gate override", async () => {
    const mgr = await staffCtx(ref, MANAGER);
    await setDepositOverride(mgr, orderId, { override: true, reason: "مشتری قدیمی، تسویه هفته آینده" });
    await expect(assertSettledForDelivery(mgr, await orderRow(orderId))).resolves.toBeUndefined();
    await setDepositOverride(mgr, orderId, { override: false, reason: "بازگرداندن شرط" });
    await expect(assertSettledForDelivery(mgr, await orderRow(orderId))).rejects.toThrow(/مانده/);
  });

  it("can be switched off in settings", async () => {
    const mgr = await staffCtx(ref, MANAGER);
    await updateSetting(mgr, "orders", { defaultDepositPct: 50, quoteValidityDays: 7, autoConfirmPaidWebOrders: true, requireSettlementBeforeDelivery: false });
    await expect(assertSettledForDelivery(mgr, await orderRow(orderId))).resolves.toBeUndefined();
    await updateSetting(mgr, "orders", { defaultDepositPct: 50, quoteValidityDays: 7, autoConfirmPaidWebOrders: true, requireSettlementBeforeDelivery: true });
  });

  it("passes once fully paid", async () => {
    const acc = await staffCtx(ref, ACCOUNTANT);
    const o = await orderRow(orderId);
    await recordManualPayment(acc, orderId, { method: "POS", amount: o.total, idempotencyKey: "settle-credit-1" });
    await expect(assertSettledForDelivery(acc, await orderRow(orderId))).resolves.toBeUndefined();
  });
});
