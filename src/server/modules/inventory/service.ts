import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  inventoryTransactions,
  materialRequests,
  materialRequirements,
  materials,
  orders,
  stockLevels,
  warehouseLocations,
} from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { AppError, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import type { MaterialNeed } from "@/server/modules/pricing/types";

type Requirement = typeof materialRequirements.$inferSelect;
type TxType = (typeof inventoryTransactions.$inferInsert)["type"];

const EPS = 1e-6;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Every stock mutation goes through here: one guarded UPDATE (row-locked by
 * Postgres, conditions re-checked after any lock wait) plus one ledger row.
 * Concurrent reservations of the same stock therefore serialise and can never
 * push reserved above on-hand or on-hand below zero.
 */
export async function moveStock(
  ctx: Ctx,
  m: {
    type: TxType;
    materialId: string;
    locationId: string;
    quantity: number;
    onHandDelta: number;
    reservedDelta: number;
    unitCost?: number | null;
    refs?: Partial<Pick<typeof inventoryTransactions.$inferInsert, "orderId" | "orderItemId" | "taskId" | "requirementId" | "purchaseOrderId" | "receiptId">>;
    reason?: string | null;
    idempotencyKey?: string;
  },
) {
  if (!(m.quantity > 0)) throw validation("مقدار باید بزرگ‌تر از صفر باشد.");
  await ctx.db.insert(stockLevels).values({ materialId: m.materialId, locationId: m.locationId }).onConflictDoNothing();
  const updated = await ctx.db
    .update(stockLevels)
    .set({
      onHand: sql`${stockLevels.onHand} + ${m.onHandDelta}`,
      reserved: sql`${stockLevels.reserved} + ${m.reservedDelta}`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(stockLevels.materialId, m.materialId),
        eq(stockLevels.locationId, m.locationId),
        sql`${stockLevels.onHand} + ${m.onHandDelta} >= 0`,
        sql`${stockLevels.reserved} + ${m.reservedDelta} >= 0`,
        sql`${stockLevels.reserved} + ${m.reservedDelta} <= ${stockLevels.onHand} + ${m.onHandDelta}`,
      ),
    )
    .returning({ onHand: stockLevels.onHand, reserved: stockLevels.reserved });
  if (updated.length === 0) throw new AppError("INSUFFICIENT_STOCK", "موجودی کافی نیست.", { materialId: m.materialId, quantity: m.quantity });
  await ctx.db.insert(inventoryTransactions).values({
    type: m.type,
    materialId: m.materialId,
    locationId: m.locationId,
    quantity: m.quantity,
    onHandDelta: m.onHandDelta,
    reservedDelta: m.reservedDelta,
    unitCost: m.unitCost ?? null,
    reason: m.reason ?? null,
    performedBy: actorUserId(ctx),
    idempotencyKey: m.idempotencyKey,
    ...m.refs,
  });
  return updated[0]!;
}

/** Ledger entry for WIP usage (consumption / production waste) — stock already left the shelf at issue. */
async function recordUsage(ctx: Ctx, type: "CONSUME" | "WASTE", req: Requirement, quantity: number, taskId: string | null, reason?: string) {
  await ctx.db.insert(inventoryTransactions).values({
    type,
    materialId: req.materialId,
    locationId: req.locationId,
    quantity,
    onHandDelta: 0,
    reservedDelta: 0,
    orderId: req.orderId,
    orderItemId: req.orderItemId,
    requirementId: req.id,
    taskId,
    reason: reason ?? null,
    performedBy: actorUserId(ctx),
  });
}

export function requirementStatus(r: Pick<Requirement, "quantityRequired" | "quantityReserved" | "quantityIssued" | "quantityConsumed" | "quantityWasted" | "quantityReturned" | "status">): Requirement["status"] {
  if (r.status === "RELEASED") return "RELEASED";
  const used = r.quantityConsumed + r.quantityWasted + r.quantityReturned;
  if (r.quantityIssued + EPS >= r.quantityRequired) return used + EPS >= r.quantityIssued ? "COMPLETED" : "ISSUED";
  if (r.quantityIssued > EPS) return "PARTIALLY_ISSUED";
  if (r.quantityReserved + EPS >= r.quantityRequired) return "RESERVED";
  if (r.quantityReserved > EPS) return "PARTIALLY_RESERVED";
  return r.status === "PENDING" ? "PENDING" : "SHORTAGE";
}

export const isRequirementSatisfied = (r: Pick<Requirement, "quantityRequired" | "quantityReserved" | "quantityIssued" | "status">) =>
  r.status === "RELEASED" || r.quantityReserved + r.quantityIssued + EPS >= r.quantityRequired;

async function lockRequirement(ctx: Ctx, id: string) {
  const [r] = await ctx.db.select().from(materialRequirements).where(eq(materialRequirements.id, id)).for("update");
  if (!r) throw notFound("نیاز مواد");
  return r;
}

async function saveRequirement(ctx: Ctx, r: Requirement, patch: Partial<Requirement>) {
  const next = { ...r, ...patch };
  next.status = requirementStatus(next);
  await ctx.db
    .update(materialRequirements)
    .set({ ...patch, status: next.status })
    .where(eq(materialRequirements.id, r.id));
  return next;
}

async function defaultLocationId(ctx: Ctx, materialId: string): Promise<string> {
  const [m] = await ctx.db.select({ loc: materials.defaultLocationId }).from(materials).where(eq(materials.id, materialId));
  if (m?.loc) return m.loc;
  const [loc] = await ctx.db.select({ id: warehouseLocations.id }).from(warehouseLocations).where(eq(warehouseLocations.isActive, true)).orderBy(asc(warehouseLocations.code)).limit(1);
  if (!loc) throw invalidState("هیچ انباری تعریف نشده است.");
  return loc.id;
}

// ── Requirements & reservation ──────────────────────────────────────────────

/** Creates requirements for an order item from its price snapshot's material list. */
export async function createRequirements(ctx: Ctx, orderId: string, orderItemId: string, needs: MaterialNeed[]) {
  if (needs.length === 0) return [];
  const skus = [...new Set(needs.map((n) => n.sku))];
  const mats = await ctx.db.select({ id: materials.id, sku: materials.sku }).from(materials).where(inArray(materials.sku, skus));
  const bySku = new Map(mats.map((m) => [m.sku, m.id]));
  const rows = [];
  for (const n of needs) {
    const materialId = bySku.get(n.sku);
    if (!materialId) throw invalidState(`ماده ${n.sku} در انبار تعریف نشده است.`);
    rows.push({
      orderId,
      orderItemId,
      materialId,
      locationId: await defaultLocationId(ctx, materialId),
      purpose: n.purpose,
      component: n.component ?? null,
      stepTypeCode: n.stepType,
      quantityRequired: Math.ceil(n.quantity * 1000) / 1000,
    });
  }
  return ctx.db.insert(materialRequirements).values(rows).returning();
}

/**
 * Reserves as much of the outstanding need as is available (partial allowed).
 * Any shortfall opens one material request for procurement.
 */
export async function reserveRequirement(ctx: Ctx, requirementId: string): Promise<Requirement> {
  return inTx(ctx, async (tx) => {
    const r = await lockRequirement(tx, requirementId);
    if (r.status === "RELEASED") return r;
    const need = round3(r.quantityRequired - r.quantityReserved - r.quantityIssued);
    if (need <= EPS) return saveRequirement(tx, r, {});
    const locationId = r.locationId ?? (await defaultLocationId(tx, r.materialId));
    await tx.db.insert(stockLevels).values({ materialId: r.materialId, locationId }).onConflictDoNothing();
    const [stock] = await tx.db
      .select({ onHand: stockLevels.onHand, reserved: stockLevels.reserved })
      .from(stockLevels)
      .where(and(eq(stockLevels.materialId, r.materialId), eq(stockLevels.locationId, locationId)))
      .for("update");
    const available = round3((stock?.onHand ?? 0) - (stock?.reserved ?? 0));
    const qty = round3(Math.min(need, Math.max(0, available)));
    let next = r;
    if (qty > EPS) {
      await moveStock(tx, {
        type: "RESERVE",
        materialId: r.materialId,
        locationId,
        quantity: qty,
        onHandDelta: 0,
        reservedDelta: qty,
        refs: { orderId: r.orderId, orderItemId: r.orderItemId, requirementId: r.id },
      });
      next = await saveRequirement(tx, r, { quantityReserved: round3(r.quantityReserved + qty), locationId });
    } else {
      next = await saveRequirement(tx, { ...r, status: "SHORTAGE" }, { locationId });
    }
    const shortfall = round3(need - qty);
    if (shortfall > EPS) await openShortageRequest(tx, next, shortfall);
    else await closeShortageRequests(tx, r.id);
    await checkLowStock(tx, r.materialId);
    return next;
  });
}

async function openShortageRequest(ctx: Ctx, r: Requirement, shortfall: number) {
  const [existing] = await ctx.db
    .select()
    .from(materialRequests)
    .where(and(eq(materialRequests.requirementId, r.id), inArray(materialRequests.status, ["OPEN", "ORDERED"])))
    .limit(1);
  if (existing) {
    if (existing.status === "OPEN" && Math.abs(existing.quantity - shortfall) > EPS) {
      await ctx.db.update(materialRequests).set({ quantity: shortfall }).where(eq(materialRequests.id, existing.id));
    }
    return existing;
  }
  const [order] = await ctx.db.select({ dueDate: orders.dueDate }).from(orders).where(eq(orders.id, r.orderId));
  const [req] = await ctx.db
    .insert(materialRequests)
    .values({ materialId: r.materialId, quantity: shortfall, reason: "SHORTAGE", requirementId: r.id, orderId: r.orderId, neededBy: order?.dueDate ?? null, requestedBy: actorUserId(ctx) })
    .returning();
  await emit(ctx, "MaterialShortage", { type: "material", id: r.materialId }, { materialId: r.materialId, requestId: req!.id, orderId: r.orderId });
  return req!;
}

async function closeShortageRequests(ctx: Ctx, requirementId: string) {
  await ctx.db
    .update(materialRequests)
    .set({ status: "FULFILLED" })
    .where(and(eq(materialRequests.requirementId, requirementId), inArray(materialRequests.status, ["OPEN", "ORDERED"])));
}

async function checkLowStock(ctx: Ctx, materialId: string) {
  const [row] = await ctx.db
    .select({
      reorderPoint: materials.reorderPoint,
      available: sql<number>`coalesce(sum(${stockLevels.onHand} - ${stockLevels.reserved}), 0)::float`,
    })
    .from(materials)
    .leftJoin(stockLevels, eq(stockLevels.materialId, materials.id))
    .where(eq(materials.id, materialId))
    .groupBy(materials.id);
  if (row && row.reorderPoint > 0 && row.available < row.reorderPoint) {
    // One pending alert per material is enough; the outbox handler dedupes per day.
    await emit(ctx, "StockLow", { type: "material", id: materialId }, { materialId });
  }
}

export async function releaseRequirement(ctx: Ctx, requirementId: string, reason: string) {
  return inTx(ctx, async (tx) => {
    const r = await lockRequirement(tx, requirementId);
    if (r.quantityReserved > EPS && r.locationId) {
      await moveStock(tx, {
        type: "RELEASE",
        materialId: r.materialId,
        locationId: r.locationId,
        quantity: r.quantityReserved,
        onHandDelta: 0,
        reservedDelta: -r.quantityReserved,
        refs: { orderId: r.orderId, orderItemId: r.orderItemId, requirementId: r.id },
        reason,
      });
    }
    await closeShortageRequests(tx, r.id);
    await tx.db
      .update(materialRequests)
      .set({ status: "CANCELLED" })
      .where(and(eq(materialRequests.requirementId, r.id), eq(materialRequests.status, "OPEN")));
    return saveRequirement(tx, { ...r, status: "RELEASED" }, { quantityReserved: 0 });
  });
}

/** Warehouse hands material to the production floor. Reserved stock is used first. */
export async function issueRequirement(ctx: Ctx, requirementId: string, quantity: number, opts: { taskId?: string; idempotencyKey?: string } = {}) {
  assertCan(ctx, "inventory.issue");
  if (!(quantity > 0)) throw validation("مقدار حواله باید بزرگ‌تر از صفر باشد.");
  return inTx(ctx, async (tx) => {
    const r = await lockRequirement(tx, requirementId);
    if (r.status === "RELEASED") throw invalidState("این نیاز آزاد شده است.");
    const locationId = r.locationId ?? (await defaultLocationId(tx, r.materialId));
    const fromReserved = round3(Math.min(quantity, r.quantityReserved));
    await moveStock(tx, {
      type: "ISSUE",
      materialId: r.materialId,
      locationId,
      quantity,
      onHandDelta: -quantity,
      reservedDelta: -fromReserved,
      refs: { orderId: r.orderId, orderItemId: r.orderItemId, requirementId: r.id, taskId: opts.taskId },
      idempotencyKey: opts.idempotencyKey,
    });
    const next = await saveRequirement(tx, r, {
      quantityReserved: round3(r.quantityReserved - fromReserved),
      quantityIssued: round3(r.quantityIssued + quantity),
      locationId,
    });
    await audit(tx, { action: "inventory.issue", entityType: "material_requirement", entityId: r.id, after: { quantity, fromReserved } });
    await checkLowStock(tx, r.materialId);
    return next;
  });
}

/** Production reports what was used and wasted from issued material. */
export async function recordConsumption(ctx: Ctx, requirementId: string, input: { consumed: number; wasted: number; taskId: string | null; note?: string }) {
  if (input.consumed < 0 || input.wasted < 0 || input.consumed + input.wasted <= 0) throw validation("مقادیر مصرف و ضایعات نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const r = await lockRequirement(tx, requirementId);
    const outstanding = round3(r.quantityIssued - r.quantityConsumed - r.quantityWasted - r.quantityReturned);
    if (input.consumed + input.wasted > outstanding + EPS) {
      throw new AppError("INSUFFICIENT_STOCK", `فقط ${outstanding} واحد از این ماده حواله شده و مصرف‌نشده است. ابتدا حواله تکمیلی از انبار بگیرید.`, { outstanding });
    }
    if (input.consumed > 0) await recordUsage(tx, "CONSUME", r, input.consumed, input.taskId, input.note);
    if (input.wasted > 0) await recordUsage(tx, "WASTE", r, input.wasted, input.taskId, input.note);
    return saveRequirement(tx, r, {
      quantityConsumed: round3(r.quantityConsumed + input.consumed),
      quantityWasted: round3(r.quantityWasted + input.wasted),
    });
  });
}

/** Unused issued material goes back on the shelf. */
export async function returnRequirement(ctx: Ctx, requirementId: string, quantity: number) {
  assertCan(ctx, "inventory.issue");
  return inTx(ctx, async (tx) => {
    const r = await lockRequirement(tx, requirementId);
    const outstanding = round3(r.quantityIssued - r.quantityConsumed - r.quantityWasted - r.quantityReturned);
    if (quantity <= 0 || quantity > outstanding + EPS) throw validation(`حداکثر قابل برگشت ${outstanding} است.`);
    await moveStock(tx, {
      type: "RETURN",
      materialId: r.materialId,
      locationId: r.locationId ?? (await defaultLocationId(tx, r.materialId)),
      quantity,
      onHandDelta: quantity,
      reservedDelta: 0,
      refs: { orderId: r.orderId, orderItemId: r.orderItemId, requirementId: r.id },
    });
    return saveRequirement(tx, r, { quantityReturned: round3(r.quantityReturned + quantity) });
  });
}

// ── Warehouse operations outside orders ─────────────────────────────────────

export async function receiveStock(
  ctx: Ctx,
  input: { materialId: string; locationId: string; quantity: number; unitCost?: number | null; purchaseOrderId?: string; receiptId?: string; reason?: string; idempotencyKey?: string },
) {
  assertCan(ctx, "inventory.receive");
  return inTx(ctx, async (tx) => {
    const res = await moveStock(tx, {
      type: "RECEIVE",
      materialId: input.materialId,
      locationId: input.locationId,
      quantity: input.quantity,
      onHandDelta: input.quantity,
      reservedDelta: 0,
      unitCost: input.unitCost,
      refs: { purchaseOrderId: input.purchaseOrderId, receiptId: input.receiptId },
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    const allocated = await allocateShortages(tx, input.materialId);
    return { stock: res, allocatedRequirementIds: allocated };
  });
}

/**
 * After stock arrives, serve waiting requirements — most urgent order first.
 * Returns affected requirement ids (callers re-evaluate production gates).
 */
export async function allocateShortages(ctx: Ctx, materialId: string): Promise<string[]> {
  const waiting = await ctx.db
    .select({ id: materialRequirements.id })
    .from(materialRequirements)
    .innerJoin(orders, eq(orders.id, materialRequirements.orderId))
    .where(
      and(
        eq(materialRequirements.materialId, materialId),
        inArray(materialRequirements.status, ["PENDING", "SHORTAGE", "PARTIALLY_RESERVED"]),
        notInArray(orders.status, ["CANCELLED", "COMPLETED"]),
      ),
    )
    .orderBy(sql`CASE ${orders.priority} WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END`, asc(orders.dueDate), asc(orders.placedAt));
  const touched: string[] = [];
  for (const w of waiting) {
    const r = await reserveRequirement(ctx, w.id);
    touched.push(r.id);
  }
  return touched;
}

export async function adjustStock(ctx: Ctx, input: { materialId: string; locationId: string; delta: number; reason: string }) {
  assertCan(ctx, "inventory.adjust");
  if (!input.reason.trim()) throw validation("دلیل اصلاح موجودی الزامی است.");
  if (input.delta === 0) throw validation("مقدار اصلاح نمی‌تواند صفر باشد.");
  return inTx(ctx, async (tx) => {
    const [before] = await tx.db.select().from(stockLevels).where(and(eq(stockLevels.materialId, input.materialId), eq(stockLevels.locationId, input.locationId)));
    const res = await moveStock(tx, {
      type: "ADJUST",
      materialId: input.materialId,
      locationId: input.locationId,
      quantity: Math.abs(input.delta),
      onHandDelta: input.delta,
      reservedDelta: 0,
      reason: input.reason,
    });
    await audit(tx, {
      action: "inventory.adjust",
      entityType: "material",
      entityId: input.materialId,
      before: { onHand: before?.onHand ?? 0 },
      after: { onHand: res.onHand },
      reason: input.reason,
      extra: { locationId: input.locationId, delta: input.delta },
    });
    if (input.delta > 0) await allocateShortages(tx, input.materialId);
    else await checkLowStock(tx, input.materialId);
    return res;
  });
}

/** Damaged / expired stock written off from the shelf (not production waste). */
export async function writeOffStock(ctx: Ctx, input: { materialId: string; locationId: string; quantity: number; reason: string }) {
  assertCan(ctx, "inventory.waste");
  if (!input.reason.trim()) throw validation("دلیل ثبت ضایعات الزامی است.");
  return inTx(ctx, async (tx) => {
    const res = await moveStock(tx, {
      type: "WASTE",
      materialId: input.materialId,
      locationId: input.locationId,
      quantity: input.quantity,
      onHandDelta: -input.quantity,
      reservedDelta: 0,
      reason: input.reason,
    });
    await audit(tx, { action: "inventory.write_off", entityType: "material", entityId: input.materialId, after: { quantity: input.quantity }, reason: input.reason });
    await checkLowStock(tx, input.materialId);
    return res;
  });
}

export async function requirementsForItem(ctx: Ctx, orderItemId: string) {
  return ctx.db.select().from(materialRequirements).where(eq(materialRequirements.orderItemId, orderItemId));
}
