import { and, eq, inArray, sql } from "drizzle-orm";
import { goodsReceipts, materialRequests, materials, purchaseOrderLines, purchaseOrders, suppliers } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { receiveStock } from "@/server/modules/inventory/service";

export interface PoLineInput {
  materialId: string;
  quantity: number;
  unitCost: number;
  locationId?: string | null;
  materialRequestIds?: string[];
}

export async function createMaterialRequest(ctx: Ctx, input: { materialId: string; quantity: number; neededBy?: Date | null; note?: string }) {
  assertCan(ctx, "procurement.manage");
  if (!(input.quantity > 0)) throw validation("مقدار باید بزرگ‌تر از صفر باشد.");
  const [row] = await ctx.db
    .insert(materialRequests)
    .values({ materialId: input.materialId, quantity: input.quantity, reason: "MANUAL", neededBy: input.neededBy ?? null, note: input.note ?? null, requestedBy: actorUserId(ctx) })
    .returning();
  return row!;
}

export async function cancelMaterialRequest(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx, "procurement.manage");
  return inTx(ctx, async (tx) => {
    const [r] = await tx.db.select().from(materialRequests).where(eq(materialRequests.id, id)).for("update");
    if (!r) throw notFound("درخواست مواد");
    if (r.status !== "OPEN") throw invalidState("فقط درخواست باز قابل لغو است.");
    await tx.db.update(materialRequests).set({ status: "CANCELLED", note: reason }).where(eq(materialRequests.id, id));
    await audit(tx, { action: "procurement.request.cancel", entityType: "material_request", entityId: id, reason });
  });
}

/** Creates a purchase order (optionally consolidating open material requests). */
export async function createPurchaseOrder(ctx: Ctx, input: { supplierId: string; expectedAt?: Date | null; note?: string; lines: PoLineInput[]; submit?: boolean }) {
  assertCan(ctx, "procurement.manage");
  if (input.lines.length === 0) throw validation("سفارش خرید باید حداقل یک ردیف داشته باشد.");
  return inTx(ctx, async (tx) => {
    const [supplier] = await tx.db.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
    if (!supplier) throw notFound("تأمین‌کننده");
    const total = Math.round(input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
    const expectedAt = input.expectedAt ?? new Date(Date.now() + supplier.leadTimeDays * 86_400_000);
    const [po] = await tx.db
      .insert(purchaseOrders)
      .values({
        supplierId: input.supplierId,
        status: input.submit ? "ORDERED" : "DRAFT",
        orderedAt: input.submit ? new Date() : null,
        expectedAt,
        totalAmount: total,
        note: input.note ?? null,
        createdBy: actorUserId(tx),
      })
      .returning();
    for (const l of input.lines) {
      if (!(l.quantity > 0) || l.unitCost < 0) throw validation("مقدار یا قیمت ردیف نامعتبر است.");
      const [line] = await tx.db
        .insert(purchaseOrderLines)
        .values({ purchaseOrderId: po!.id, materialId: l.materialId, quantity: l.quantity, unitCost: l.unitCost, locationId: l.locationId ?? null })
        .returning();
      if (l.materialRequestIds?.length) {
        await tx.db
          .update(materialRequests)
          .set({ status: "ORDERED", purchaseOrderLineId: line!.id })
          .where(and(inArray(materialRequests.id, l.materialRequestIds), eq(materialRequests.status, "OPEN"), eq(materialRequests.materialId, l.materialId)));
      }
    }
    await audit(tx, { action: "procurement.po.create", entityType: "purchase_order", entityId: po!.id, after: { number: po!.number, total, lines: input.lines.length } });
    return po!;
  });
}

export async function submitPurchaseOrder(ctx: Ctx, id: string) {
  assertCan(ctx, "procurement.manage");
  return inTx(ctx, async (tx) => {
    const [po] = await tx.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
    if (!po) throw notFound("سفارش خرید");
    if (po.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل ارسال است.");
    await tx.db.update(purchaseOrders).set({ status: "ORDERED", orderedAt: new Date() }).where(eq(purchaseOrders.id, id));
    await audit(tx, { action: "procurement.po.submit", entityType: "purchase_order", entityId: id });
  });
}

export async function cancelPurchaseOrder(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx, "procurement.manage");
  return inTx(ctx, async (tx) => {
    const [po] = await tx.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
    if (!po) throw notFound("سفارش خرید");
    if (!["DRAFT", "ORDERED"].includes(po.status)) throw invalidState("سفارش خریدی که دریافت شده قابل لغو نیست.");
    await tx.db.update(purchaseOrders).set({ status: "CANCELLED", note: reason }).where(eq(purchaseOrders.id, id));
    const lines = await tx.db.select({ id: purchaseOrderLines.id }).from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, id));
    if (lines.length) {
      await tx.db
        .update(materialRequests)
        .set({ status: "OPEN", purchaseOrderLineId: null })
        .where(and(inArray(materialRequests.purchaseOrderLineId, lines.map((l) => l.id)), eq(materialRequests.status, "ORDERED")));
    }
    await audit(tx, { action: "procurement.po.cancel", entityType: "purchase_order", entityId: id, reason });
  });
}

/**
 * Receives goods against a PO (partial deliveries allowed). Each line becomes
 * a RECEIVE transaction; waiting order requirements are then reserved.
 */
export async function receivePurchaseOrder(ctx: Ctx, id: string, input: { lines: { lineId: string; quantity: number }[]; note?: string; idempotencyKey?: string }) {
  assertCan(ctx, "inventory.receive");
  return inTx(ctx, async (tx) => {
    const [po] = await tx.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
    if (!po) throw notFound("سفارش خرید");
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(po.status)) throw invalidState("این سفارش خرید در وضعیت دریافت نیست.");
    const lines = await tx.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, id)).for("update");
    const [receipt] = await tx.db.insert(goodsReceipts).values({ purchaseOrderId: id, receivedBy: actorUserId(tx), note: input.note ?? null }).returning();
    const affected: string[] = [];
    for (const [i, rl] of input.lines.entries()) {
      if (rl.quantity <= 0) continue;
      const line = lines.find((l) => l.id === rl.lineId);
      if (!line) throw validation("ردیف سفارش خرید نامعتبر است.");
      const [mat] = await tx.db.select({ loc: materials.defaultLocationId }).from(materials).where(eq(materials.id, line.materialId));
      const locationId = line.locationId ?? mat?.loc;
      if (!locationId) throw invalidState("انبار مقصد برای این ماده مشخص نیست.");
      const res = await receiveStock(tx, {
        materialId: line.materialId,
        locationId,
        quantity: rl.quantity,
        unitCost: line.unitCost,
        purchaseOrderId: id,
        receiptId: receipt!.id,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${i}` : undefined,
      });
      affected.push(...res.allocatedRequirementIds);
      await tx.db
        .update(purchaseOrderLines)
        .set({ receivedQuantity: sql`${purchaseOrderLines.receivedQuantity} + ${rl.quantity}` })
        .where(eq(purchaseOrderLines.id, line.id));
      // Material requests attached to this line are considered fulfilled once it is fully received.
      if (line.receivedQuantity + rl.quantity >= line.quantity - 1e-6) {
        await tx.db.update(materialRequests).set({ status: "FULFILLED" }).where(and(eq(materialRequests.purchaseOrderLineId, line.id), eq(materialRequests.status, "ORDERED")));
      }
    }
    const after = await tx.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.purchaseOrderId, id));
    const complete = after.every((l) => l.receivedQuantity >= l.quantity - 1e-6);
    await tx.db.update(purchaseOrders).set({ status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" }).where(eq(purchaseOrders.id, id));
    await audit(tx, { action: "procurement.po.receive", entityType: "purchase_order", entityId: id, after: { receipt: receipt!.number, lines: input.lines } });
    return { receiptId: receipt!.id, complete, affectedRequirementIds: [...new Set(affected)] };
  });
}

export async function upsertSupplier(ctx: Ctx, input: { id?: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; leadTimeDays: number; notes?: string | null; isActive?: boolean }) {
  assertCan(ctx, "procurement.manage");
  return inTx(ctx, async (tx) => {
    if (input.id) {
      const [before] = await tx.db.select().from(suppliers).where(eq(suppliers.id, input.id));
      if (!before) throw notFound("تأمین‌کننده");
      const [row] = await tx.db.update(suppliers).set({ ...input, id: undefined }).where(eq(suppliers.id, input.id)).returning();
      await audit(tx, { action: "supplier.update", entityType: "supplier", entityId: input.id, before, after: row });
      return row!;
    }
    const [row] = await tx.db.insert(suppliers).values(input).returning();
    await audit(tx, { action: "supplier.create", entityType: "supplier", entityId: row!.id, after: row });
    return row!;
  });
}
