import { and, asc, desc, eq, gt, ilike, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import {
  inventoryTransactions,
  materialCategories,
  materialRequests,
  materialRequirements,
  materials,
  orderItems,
  orders,
  purchaseOrderLines,
  purchaseOrders,
  stockLevels,
  suppliers,
  users,
  warehouseLocations,
} from "@/server/db/schema";
import { type Ctx, assertCan, assertCanAny } from "@/server/core/context";
import { notFound } from "@/server/core/errors";
import { normalizeFa } from "@/lib/persian";

export interface StockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  categoryCode: string;
  categoryName: string;
  reorderPoint: number;
  reorderQuantity: number;
  standardCost: number;
  onHand: number;
  reserved: number;
  available: number;
  /** Quantity on submitted, not yet fully received purchase orders. */
  onOrder: number;
  /** Open shortages across order requirements. */
  shortage: number;
  low: boolean;
}

/** Materials with aggregated stock, incoming quantity and outstanding shortages. */
export async function listStock(ctx: Ctx, f: { q?: string; category?: string; low?: boolean } = {}): Promise<StockRow[]> {
  assertCanAny(ctx, "inventory.view", "procurement.view");
  const conds = [eq(materials.isActive, true)];
  if (f.category) conds.push(eq(materials.categoryCode, f.category));
  if (f.q?.trim()) {
    const q = `%${normalizeFa(f.q)}%`;
    conds.push(or(ilike(materials.name, q), ilike(materials.sku, q))!);
  }
  const rows = await ctx.db
    .select({
      m: materials,
      categoryName: materialCategories.name,
      onHand: sql<number>`coalesce((select sum(on_hand) from stock_levels s where s.material_id = ${materials.id}), 0)::float`,
      reserved: sql<number>`coalesce((select sum(reserved) from stock_levels s where s.material_id = ${materials.id}), 0)::float`,
      onOrder: sql<number>`coalesce((select sum(greatest(l.quantity - l.received_quantity, 0)) from purchase_order_lines l join purchase_orders p on p.id = l.purchase_order_id where l.material_id = ${materials.id} and p.status in ('ORDERED','PARTIALLY_RECEIVED')), 0)::float`,
      shortage: sql<number>`coalesce((select sum(greatest(r.quantity_required - r.quantity_reserved - r.quantity_issued, 0)) from material_requirements r where r.material_id = ${materials.id} and r.status in ('SHORTAGE','PARTIALLY_RESERVED')), 0)::float`,
    })
    .from(materials)
    .innerJoin(materialCategories, eq(materialCategories.code, materials.categoryCode))
    .where(and(...conds))
    .orderBy(asc(materialCategories.sortOrder), asc(materials.name));
  const out = rows.map((r) => {
    const available = r.onHand - r.reserved;
    return {
      id: r.m.id,
      sku: r.m.sku,
      name: r.m.name,
      unit: r.m.unit,
      categoryCode: r.m.categoryCode,
      categoryName: r.categoryName,
      reorderPoint: r.m.reorderPoint,
      reorderQuantity: r.m.reorderQuantity,
      standardCost: r.m.standardCost,
      onHand: r.onHand,
      reserved: r.reserved,
      available,
      onOrder: r.onOrder,
      shortage: r.shortage,
      low: available <= r.m.reorderPoint || r.shortage > 0,
    };
  });
  return f.low ? out.filter((r) => r.low) : out;
}

export async function listCategoriesAndLocations(ctx: Ctx) {
  assertCanAny(ctx, "inventory.view", "procurement.view");
  const categories = await ctx.db.select().from(materialCategories).orderBy(asc(materialCategories.sortOrder));
  const locations = await ctx.db.select().from(warehouseLocations).where(eq(warehouseLocations.isActive, true)).orderBy(asc(warehouseLocations.code));
  return { categories, locations };
}

/** Material card: per-location stock, the append-only ledger and open requirements. */
export async function materialDetail(ctx: Ctx, id: string, opts: { ledgerLimit?: number } = {}) {
  assertCanAny(ctx, "inventory.view", "procurement.view");
  const [m] = await ctx.db
    .select({ m: materials, categoryName: materialCategories.name, supplierName: suppliers.name })
    .from(materials)
    .innerJoin(materialCategories, eq(materialCategories.code, materials.categoryCode))
    .leftJoin(suppliers, eq(suppliers.id, materials.defaultSupplierId))
    .where(eq(materials.id, id));
  if (!m) throw notFound("ماده");
  const levels = await ctx.db
    .select({ level: stockLevels, location: warehouseLocations })
    .from(stockLevels)
    .innerJoin(warehouseLocations, eq(warehouseLocations.id, stockLevels.locationId))
    .where(eq(stockLevels.materialId, id))
    .orderBy(asc(warehouseLocations.code));
  const ledger = await ctx.db
    .select({ tx: inventoryTransactions, locationCode: warehouseLocations.code, by: users.fullName, orderNumber: orders.number })
    .from(inventoryTransactions)
    .leftJoin(warehouseLocations, eq(warehouseLocations.id, inventoryTransactions.locationId))
    .leftJoin(users, eq(users.id, inventoryTransactions.performedBy))
    .leftJoin(orders, eq(orders.id, inventoryTransactions.orderId))
    .where(eq(inventoryTransactions.materialId, id))
    .orderBy(desc(inventoryTransactions.id))
    .limit(opts.ledgerLimit ?? 100);
  const requirements = await openRequirements(ctx, { materialId: id });
  const incoming = await ctx.db
    .select({ line: purchaseOrderLines, po: purchaseOrders, supplierName: suppliers.name })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(and(eq(purchaseOrderLines.materialId, id), inArray(purchaseOrders.status, ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"])))
    .orderBy(asc(purchaseOrders.expectedAt));
  return { material: m.m, categoryName: m.categoryName, supplierName: m.supplierName, levels, ledger, requirements, incoming };
}

export interface RequirementRow {
  req: typeof materialRequirements.$inferSelect;
  material: { id: string; sku: string; name: string; unit: string };
  orderId: string;
  orderNumber: number;
  orderStatus: string;
  dueDate: Date | null;
  priority: string;
  itemTitle: string;
  /** Earliest non-completed production step that consumes this material. */
  stepStatus: string | null;
  stepName: string | null;
}

/**
 * Requirements that still need warehouse action: reserving, issuing to the
 * floor or waiting for supply. Ordered by due date so the warehouse works in
 * the same sequence as production.
 */
export async function openRequirements(ctx: Ctx, f: { materialId?: string; stage?: "reserve" | "issue" | "shortage" } = {}): Promise<RequirementRow[]> {
  assertCanAny(ctx, "inventory.view", "procurement.view", "production.view");
  const conds = [
    notInArray(materialRequirements.status, ["RELEASED", "COMPLETED"]),
    lt(materialRequirements.quantityIssued, materialRequirements.quantityRequired),
    notInArray(orders.status, ["CANCELLED", "COMPLETED"]),
  ];
  if (f.materialId) conds.push(eq(materialRequirements.materialId, f.materialId));
  if (f.stage === "reserve") conds.push(inArray(materialRequirements.status, ["PENDING", "PARTIALLY_RESERVED"]));
  if (f.stage === "issue") conds.push(inArray(materialRequirements.status, ["RESERVED", "PARTIALLY_ISSUED"]));
  if (f.stage === "shortage") conds.push(inArray(materialRequirements.status, ["SHORTAGE", "PARTIALLY_RESERVED"]));
  const rows = await ctx.db
    .select({
      req: materialRequirements,
      material: { id: materials.id, sku: materials.sku, name: materials.name, unit: materials.unit },
      orderId: orders.id,
      orderNumber: orders.number,
      orderStatus: orders.status,
      dueDate: orders.dueDate,
      priority: orders.priority,
      itemTitle: orderItems.title,
      stepStatus: sql<string | null>`(select t.status from production_tasks t join production_jobs j on j.id = t.job_id where j.order_item_id = ${materialRequirements.orderItemId} and t.step_type_code = ${materialRequirements.stepTypeCode} and t.status not in ('COMPLETED','SKIPPED','CANCELLED') order by t.attempt desc limit 1)`,
      stepName: sql<string | null>`(select t.name from production_tasks t join production_jobs j on j.id = t.job_id where j.order_item_id = ${materialRequirements.orderItemId} and t.step_type_code = ${materialRequirements.stepTypeCode} order by t.attempt desc limit 1)`,
    })
    .from(materialRequirements)
    .innerJoin(materials, eq(materials.id, materialRequirements.materialId))
    .innerJoin(orders, eq(orders.id, materialRequirements.orderId))
    .innerJoin(orderItems, eq(orderItems.id, materialRequirements.orderItemId))
    .where(and(...conds))
    .orderBy(sql`${orders.dueDate} asc nulls last`, asc(orders.number));
  return rows;
}

export async function recentTransactions(ctx: Ctx, limit = 20) {
  assertCan(ctx, "inventory.view");
  return ctx.db
    .select({ tx: inventoryTransactions, material: { id: materials.id, name: materials.name, unit: materials.unit, sku: materials.sku }, by: users.fullName, orderNumber: orders.number })
    .from(inventoryTransactions)
    .innerJoin(materials, eq(materials.id, inventoryTransactions.materialId))
    .leftJoin(users, eq(users.id, inventoryTransactions.performedBy))
    .leftJoin(orders, eq(orders.id, inventoryTransactions.orderId))
    .orderBy(desc(inventoryTransactions.id))
    .limit(limit);
}

// ── Procurement ─────────────────────────────────────────────────────────────

export async function listMaterialRequests(ctx: Ctx, f: { status?: ("OPEN" | "ORDERED" | "FULFILLED" | "CANCELLED")[] } = {}) {
  assertCanAny(ctx, "procurement.view", "inventory.view");
  return ctx.db
    .select({
      request: materialRequests,
      material: { id: materials.id, sku: materials.sku, name: materials.name, unit: materials.unit, standardCost: materials.standardCost, defaultSupplierId: materials.defaultSupplierId, defaultLocationId: materials.defaultLocationId },
      orderNumber: orders.number,
      requestedBy: users.fullName,
    })
    .from(materialRequests)
    .innerJoin(materials, eq(materials.id, materialRequests.materialId))
    .leftJoin(orders, eq(orders.id, materialRequests.orderId))
    .leftJoin(users, eq(users.id, materialRequests.requestedBy))
    .where(f.status?.length ? inArray(materialRequests.status, f.status) : undefined)
    .orderBy(sql`${materialRequests.neededBy} asc nulls last`, desc(materialRequests.createdAt))
    .limit(200);
}

export async function listPurchaseOrders(ctx: Ctx, f: { status?: ("DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED")[]; supplierId?: string } = {}) {
  assertCanAny(ctx, "procurement.view", "inventory.receive");
  const conds = [];
  if (f.status?.length) conds.push(inArray(purchaseOrders.status, f.status));
  if (f.supplierId) conds.push(eq(purchaseOrders.supplierId, f.supplierId));
  const pos = await ctx.db
    .select({ po: purchaseOrders, supplierName: suppliers.name, createdBy: users.fullName })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(100);
  if (pos.length === 0) return [];
  const lines = await ctx.db
    .select({ line: purchaseOrderLines, material: { id: materials.id, sku: materials.sku, name: materials.name, unit: materials.unit } })
    .from(purchaseOrderLines)
    .innerJoin(materials, eq(materials.id, purchaseOrderLines.materialId))
    .where(inArray(purchaseOrderLines.purchaseOrderId, pos.map((p) => p.po.id)));
  return pos.map((p) => ({ ...p, lines: lines.filter((l) => l.line.purchaseOrderId === p.po.id) }));
}

export async function listSuppliers(ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  assertCanAny(ctx, "procurement.view", "inventory.view");
  const rows = await ctx.db
    .select({
      s: suppliers,
      openOrders: sql<number>`(select count(*) from purchase_orders p where p.supplier_id = ${suppliers.id} and p.status in ('ORDERED','PARTIALLY_RECEIVED'))::int`,
      totalPurchased: sql<number>`coalesce((select sum(total_amount) from purchase_orders p where p.supplier_id = ${suppliers.id} and p.status <> 'CANCELLED'), 0)::float`,
    })
    .from(suppliers)
    .where(opts.includeInactive ? undefined : eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.name));
  return rows;
}

/** Purchase orders past their expected date that are not fully received. */
export async function overduePurchaseOrders(ctx: Ctx) {
  assertCanAny(ctx, "procurement.view", "inventory.receive");
  return ctx.db
    .select({ po: purchaseOrders, supplierName: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(and(inArray(purchaseOrders.status, ["ORDERED", "PARTIALLY_RECEIVED"]), lt(purchaseOrders.expectedAt, new Date())));
}

/** Materials issued to the floor that have not been consumed, wasted or returned. */
export async function issuedOutstanding(ctx: Ctx) {
  assertCan(ctx, "inventory.view");
  return ctx.db
    .select({
      req: materialRequirements,
      material: { id: materials.id, name: materials.name, unit: materials.unit },
      orderNumber: orders.number,
      orderId: orders.id,
      itemTitle: orderItems.title,
    })
    .from(materialRequirements)
    .innerJoin(materials, eq(materials.id, materialRequirements.materialId))
    .innerJoin(orders, eq(orders.id, materialRequirements.orderId))
    .innerJoin(orderItems, eq(orderItems.id, materialRequirements.orderItemId))
    .where(
      and(
        gt(materialRequirements.quantityIssued, sql`${materialRequirements.quantityConsumed} + ${materialRequirements.quantityWasted} + ${materialRequirements.quantityReturned}`),
        inArray(orderItems.productionStatus, ["COMPLETED", "CANCELLED"]),
      ),
    )
    .limit(50);
}

