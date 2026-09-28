import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { customers, inventoryTransactions, materialRequests, materialRequirements, orderItems, orders, stockLevels } from "@/server/db/schema";
import { systemCtx } from "@/server/core/context";
import {
  adjustStock,
  createRequirements,
  issueRequirement,
  receiveStock,
  recordConsumption,
  releaseRequirement,
  reserveRequirement,
  returnRequirement,
} from "@/server/modules/inventory/service";
import { createPurchaseOrder, receivePurchaseOrder } from "@/server/modules/procurement/service";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { MANAGER, resetTestDb, staffCtx, WAREHOUSE } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();

async function stock(sku: string, loc = "MAIN") {
  const [s] = await db()
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.materialId, ref.materials.get(sku)!), eq(stockLevels.locationId, ref.locations.get(loc)!)));
  return s!;
}

/** A bare order+item to hang requirements on. */
async function fakeItem(label: string) {
  const [c] = await db().insert(customers).values({ phone: `0935${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, fullName: label }).returning();
  const [o] = await db().insert(orders).values({ customerId: c!.id, source: "SALES", status: "CONFIRMED", subtotal: 0, total: 0 }).returning();
  const [i] = await db().insert(orderItems).values({ orderId: o!.id, lineNo: 1, title: label, quantity: 1, lineSubtotal: 0 }).returning();
  return { orderId: o!.id, itemId: i!.id };
}

async function requirement(sku: string, quantity: number, label = "test") {
  const { orderId, itemId } = await fakeItem(label);
  const [r] = await createRequirements(systemCtx(), orderId, itemId, [{ sku, name: sku, unit: "SHEET", quantity, purpose: "PAPER", stepType: "OFFSET_PRINTING" }]);
  return r!;
}

beforeAll(async () => {
  ref = await resetTestDb();
});
afterAll(async () => {
  await closeDb();
});

describe("reservation", () => {
  it("reserves stock: physical unchanged, available reduced", async () => {
    const before = await stock("P-GL135-70");
    const r = await requirement("P-GL135-70", 5000);
    const after = await reserveRequirement(systemCtx(), r.id);
    const s = await stock("P-GL135-70");
    expect(after.status).toBe("RESERVED");
    expect(s.onHand).toBe(before.onHand);
    expect(s.reserved).toBe(before.reserved + 5000);
    expect(s.available).toBe(before.onHand - before.reserved - 5000);
  });

  it("reserves partially and opens exactly one shortage request", async () => {
    // P-TH70-70 has 800 on hand
    const r = await requirement("P-TH70-70", 2500);
    const after = await reserveRequirement(systemCtx(), r.id);
    expect(after.status).toBe("PARTIALLY_RESERVED");
    expect(after.quantityReserved).toBe(800);
    // Re-running is idempotent (no double reservation, no second request)
    await reserveRequirement(systemCtx(), r.id);
    const reqs = await db().select().from(materialRequests).where(eq(materialRequests.requirementId, r.id));
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.quantity).toBe(1700);
    expect((await stock("P-TH70-70")).available).toBe(0);
  });

  it("never lets two concurrent reservations share the same stock", async () => {
    // P-KT300-70: 650 on hand. Ten requirements of 100 race; at most 650 can be reserved.
    const reqs = await Promise.all(Array.from({ length: 10 }, (_, i) => requirement("P-KT300-70", 100, `race-${i}`)));
    await Promise.all(reqs.map((r) => reserveRequirement(systemCtx(), r.id)));
    const s = await stock("P-KT300-70");
    expect(s.reserved).toBe(650);
    expect(s.reserved).toBeLessThanOrEqual(s.onHand);
    const rows = await Promise.all(reqs.map((r) => db().select().from(materialRequirements).where(eq(materialRequirements.id, r.id)).then((x) => x[0]!)));
    expect(rows.reduce((sum, r) => sum + r.quantityReserved, 0)).toBe(650);
  });

  it("serves waiting requirements when goods are received (most urgent first)", async () => {
    const r = await requirement("P-TH80-SRA3", 10_000); // 9,000 on hand
    const partial = await reserveRequirement(systemCtx(), r.id);
    expect(partial.quantityReserved).toBe(9000);
    const wh = await staffCtx(ref, WAREHOUSE);
    const res = await receiveStock(wh, { materialId: ref.materials.get("P-TH80-SRA3")!, locationId: ref.locations.get("DIGI")!, quantity: 2000, unitCost: 55_000 });
    expect(res.allocatedRequirementIds).toContain(r.id);
    const [after] = await db().select().from(materialRequirements).where(eq(materialRequirements.id, r.id));
    expect(after!.status).toBe("RESERVED");
    const [mr] = await db().select().from(materialRequests).where(eq(materialRequests.requirementId, r.id));
    expect(mr!.status).toBe("FULFILLED");
  });
});

describe("issue, consumption, waste, return", () => {
  it("tracks the full lifecycle with a traceable ledger", async () => {
    const wh = await staffCtx(ref, WAREHOUSE);
    const r = await requirement("P-GL135-70", 5000);
    await reserveRequirement(systemCtx(), r.id);
    const s0 = await stock("P-GL135-70");

    // Issue 5,200 (200 more than reserved — extra comes from free stock)
    const issued = await issueRequirement(wh, r.id, 5200);
    expect(issued.quantityReserved).toBe(0);
    expect(issued.quantityIssued).toBe(5200);
    const s1 = await stock("P-GL135-70");
    expect(s1.onHand).toBe(s0.onHand - 5200);
    expect(s1.reserved).toBe(s0.reserved - 5000);

    // Consumed 5,000, waste 150, return 50 → complete
    await recordConsumption(systemCtx(), r.id, { consumed: 5000, wasted: 150, taskId: null });
    await expect(recordConsumption(systemCtx(), r.id, { consumed: 100, wasted: 0, taskId: null })).rejects.toThrow(/حواله/);
    const back = await returnRequirement(wh, r.id, 50);
    expect(back.status).toBe("COMPLETED");
    expect((await stock("P-GL135-70")).onHand).toBe(s1.onHand + 50);

    const ledger = await db().select().from(inventoryTransactions).where(eq(inventoryTransactions.requirementId, r.id));
    expect(ledger.map((l) => l.type).sort()).toEqual(["CONSUME", "ISSUE", "RESERVE", "RETURN", "WASTE"]);
    expect(ledger.find((l) => l.type === "WASTE")!.quantity).toBe(150);
  });

  it("releases reservations on cancellation", async () => {
    const r = await requirement("P-GL135-SRA3", 100);
    await reserveRequirement(systemCtx(), r.id);
    const before = await stock("P-GL135-SRA3", "DIGI");
    const released = await releaseRequirement(systemCtx(), r.id, "test");
    expect(released.status).toBe("RELEASED");
    expect((await stock("P-GL135-SRA3", "DIGI")).reserved).toBe(before.reserved - 100);
  });
});

describe("adjustments and integrity", () => {
  it("requires permission and a reason, and cannot go negative", async () => {
    const wh = await staffCtx(ref, WAREHOUSE);
    const mgr = await staffCtx(ref, MANAGER);
    const input = { materialId: ref.materials.get("FO-GOLD")!, locationId: ref.locations.get("MAIN")!, delta: -10, reason: "شمارش" };
    await expect(adjustStock(wh, input)).rejects.toThrow(/مجوز/);
    await expect(adjustStock(mgr, { ...input, reason: " " })).rejects.toThrow(/دلیل/);
    const res = await adjustStock(mgr, input);
    expect(res.onHand).toBe(410);
    await expect(adjustStock(mgr, { ...input, delta: -100_000 })).rejects.toThrow(/موجودی کافی نیست/);
  });

  it("cannot reduce on-hand below what is reserved", async () => {
    const mgr = await staffCtx(ref, MANAGER);
    const s = await stock("P-GL135-70");
    await expect(adjustStock(mgr, { materialId: ref.materials.get("P-GL135-70")!, locationId: ref.locations.get("MAIN")!, delta: -(s.onHand - s.reserved + 1), reason: "x" })).rejects.toThrow();
  });
});

describe("procurement", () => {
  it("consolidates shortage requests into a PO and receives partially", async () => {
    const mgr = await staffCtx(ref, MANAGER);
    const open = await db().select().from(materialRequests).where(and(eq(materialRequests.materialId, ref.materials.get("P-TH70-70")!), eq(materialRequests.status, "OPEN")));
    expect(open.length).toBeGreaterThan(0);
    const po = await createPurchaseOrder(mgr, {
      supplierId: ref.suppliers.get("paper")!,
      submit: true,
      lines: [{ materialId: ref.materials.get("P-TH70-70")!, quantity: 2000, unitCost: 120_000, materialRequestIds: open.map((o) => o.id) }],
    });
    expect(po.status).toBe("ORDERED");
    const [ordered] = await db().select().from(materialRequests).where(eq(materialRequests.id, open[0]!.id));
    expect(ordered!.status).toBe("ORDERED");

    const lines = await db().query.purchaseOrderLines.findMany({ where: (l, { eq: e }) => e(l.purchaseOrderId, po.id) });
    const first = await receivePurchaseOrder(mgr, po.id, { lines: [{ lineId: lines[0]!.id, quantity: 800 }] });
    expect(first.complete).toBe(false);
    const second = await receivePurchaseOrder(mgr, po.id, { lines: [{ lineId: lines[0]!.id, quantity: 1200 }] });
    expect(second.complete).toBe(true);
    const req = await db().select().from(materialRequirements).where(eq(materialRequirements.id, open[0]!.requirementId!));
    expect(req[0]!.status).toBe("RESERVED");
  });
});
