import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { machineTypes, productionMethods } from "./catalog";
import {
  inventoryTxType,
  machineStatus,
  maintenanceKind,
  maintenanceStatus,
  materialRequestReason,
  materialRequestStatus,
  purchaseOrderStatus,
  requirementStatus,
} from "./enums";
import { employees, timestamps, users } from "./identity";
import { orderItems, orders } from "./orders";

const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

export const materialCategories = pgTable("material_categories", {
  code: varchar("code", { length: 24 }).primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const warehouseLocations = pgTable(
  "warehouse_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 24 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("warehouse_locations_code_uq").on(t.code)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: varchar("phone", { length: 16 }),
    email: text("email"),
    address: text("address"),
    leadTimeDays: integer("lead_time_days").notNull().default(3),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("suppliers_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`)],
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: varchar("sku", { length: 48 }).notNull(),
    name: text("name").notNull(),
    categoryCode: varchar("category_code", { length: 24 })
      .notNull()
      .references(() => materialCategories.code),
    /** SHEET | KG | ROLL | METER | SQM | PIECE | LITER | PACK */
    unit: varchar("unit", { length: 12 }).notNull(),
    reorderPoint: qty("reorder_point").notNull().default(0),
    reorderQuantity: qty("reorder_quantity").notNull().default(0),
    /** Standard cost per unit in rial (used by pricing when no override exists). */
    standardCost: numeric("standard_cost", { precision: 16, scale: 2, mode: "number" }).notNull().default(0),
    defaultSupplierId: uuid("default_supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    defaultLocationId: uuid("default_location_id").references(() => warehouseLocations.id, { onDelete: "set null" }),
    // Paper-specific properties (null for other categories)
    paperType: text("paper_type"),
    brand: text("brand"),
    grammage: integer("grammage"),
    sheetWidthMm: integer("sheet_width_mm"),
    sheetHeightMm: integer("sheet_height_mm"),
    color: text("color"),
    attributes: jsonb("attributes").$type<Record<string, string | number>>().notNull().default({}),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("materials_sku_uq").on(t.sku),
    index("materials_category_idx").on(t.categoryCode),
    index("materials_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    check("materials_cost_nonneg", sql`${t.standardCost} >= 0`),
  ],
);

/**
 * Current stock per material/location. Only ever changed together with an
 * inventory_transactions row (see inventory service). CHECK constraints make
 * negative stock and over-reservation impossible even under concurrency.
 */
export const stockLevels = pgTable(
  "stock_levels",
  {
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => warehouseLocations.id, { onDelete: "restrict" }),
    onHand: qty("on_hand").notNull().default(0),
    reserved: qty("reserved").notNull().default(0),
    available: qty("available").generatedAlwaysAs(sql`on_hand - reserved`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.materialId, t.locationId] }),
    check("stock_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("stock_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("stock_reserved_le_on_hand", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 100001 });
export const docNumberSeq = pgSequence("doc_number_seq", { startWith: 1001 });

/**
 * A material an order item needs. It is the holder of reservations and the
 * anchor for issue / consumption / waste / return tracking.
 */
export const materialRequirements = pgTable(
  "material_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    locationId: uuid("location_id").references(() => warehouseLocations.id),
    purpose: varchar("purpose", { length: 16 }).notNull(),
    component: varchar("component", { length: 32 }),
    stepTypeCode: varchar("step_type_code", { length: 32 }).notNull(),
    quantityRequired: qty("quantity_required").notNull(),
    quantityReserved: qty("quantity_reserved").notNull().default(0),
    quantityIssued: qty("quantity_issued").notNull().default(0),
    quantityConsumed: qty("quantity_consumed").notNull().default(0),
    quantityWasted: qty("quantity_wasted").notNull().default(0),
    quantityReturned: qty("quantity_returned").notNull().default(0),
    status: requirementStatus("status").notNull().default("PENDING"),
    ...timestamps,
  },
  (t) => [
    index("material_requirements_item_idx").on(t.orderItemId),
    index("material_requirements_material_idx").on(t.materialId, t.status),
    check("req_required_pos", sql`${t.quantityRequired} > 0`),
    check("req_reserved_nonneg", sql`${t.quantityReserved} >= 0`),
    check("req_issued_nonneg", sql`${t.quantityIssued} >= 0`),
    check(
      "req_usage_le_issued",
      sql`${t.quantityConsumed} + ${t.quantityWasted} + ${t.quantityReturned} <= ${t.quantityIssued}`,
    ),
  ],
);

/** Append-only ledger. UPDATE/DELETE are blocked by a trigger (see migrations). */
export const inventoryTransactions = pgTable(
  "inventory_transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: inventoryTxType("type").notNull(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    locationId: uuid("location_id").references(() => warehouseLocations.id),
    quantity: qty("quantity").notNull(),
    onHandDelta: qty("on_hand_delta").notNull().default(0),
    reservedDelta: qty("reserved_delta").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 16, scale: 2, mode: "number" }),
    orderId: uuid("order_id"),
    orderItemId: uuid("order_item_id"),
    taskId: uuid("task_id"),
    requirementId: uuid("requirement_id").references(() => materialRequirements.id),
    purchaseOrderId: uuid("purchase_order_id"),
    receiptId: uuid("receipt_id"),
    reason: text("reason"),
    performedBy: uuid("performed_by").references(() => users.id),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_tx_material_idx").on(t.materialId, t.createdAt),
    index("inv_tx_order_idx").on(t.orderId),
    index("inv_tx_task_idx").on(t.taskId),
    uniqueIndex("inv_tx_idempotency_uq").on(t.idempotencyKey),
    check("inv_tx_qty_pos", sql`${t.quantity} > 0`),
  ],
);

// ── Procurement ─────────────────────────────────────────────────────────────

export const materialRequests = pgTable(
  "material_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    quantity: qty("quantity").notNull(),
    reason: materialRequestReason("reason").notNull(),
    status: materialRequestStatus("status").notNull().default("OPEN"),
    requirementId: uuid("requirement_id").references(() => materialRequirements.id),
    orderId: uuid("order_id"),
    neededBy: timestamp("needed_by", { withTimezone: true }),
    purchaseOrderLineId: uuid("purchase_order_line_id"),
    requestedBy: uuid("requested_by").references(() => users.id),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("material_requests_number_uq").on(t.number),
    index("material_requests_status_idx").on(t.status),
    // One open shortage request per requirement.
    uniqueIndex("material_requests_open_requirement_uq")
      .on(t.requirementId)
      .where(sql`${t.status} IN ('OPEN','ORDERED') AND ${t.requirementId} IS NOT NULL`),
    check("material_requests_qty_pos", sql`${t.quantity} > 0`),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: purchaseOrderStatus("status").notNull().default("DRAFT"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("purchase_orders_number_uq").on(t.number), index("purchase_orders_status_idx").on(t.status)],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    locationId: uuid("location_id").references(() => warehouseLocations.id),
    quantity: qty("quantity").notNull(),
    receivedQuantity: qty("received_quantity").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 16, scale: 2, mode: "number" }).notNull().default(0),
    note: text("note"),
  },
  (t) => [
    index("po_lines_po_idx").on(t.purchaseOrderId),
    index("po_lines_material_idx").on(t.materialId),
    check("po_lines_qty_pos", sql`${t.quantity} > 0`),
    check("po_lines_received_nonneg", sql`${t.receivedQuantity} >= 0`),
  ],
);

export const goodsReceipts = pgTable("goods_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  receivedBy: uuid("received_by").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Machines ────────────────────────────────────────────────────────────────

export const machines = pgTable(
  "machines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 24 }).notNull(),
    name: text("name").notNull(),
    typeCode: varchar("type_code", { length: 32 })
      .notNull()
      .references(() => machineTypes.code),
    methodCode: varchar("method_code", { length: 24 }).references(() => productionMethods.code),
    status: machineStatus("status").notNull().default("ACTIVE"),
    /** Throughput in the machine type's capacity unit per hour. */
    capacityPerHour: integer("capacity_per_hour").notNull().default(1000),
    setupMinutes: integer("setup_minutes").notNull().default(15),
    maxSheetWidthMm: integer("max_sheet_width_mm"),
    maxSheetHeightMm: integer("max_sheet_height_mm"),
    colors: integer("colors"),
    hourlyCost: bigint("hourly_cost", { mode: "number" }).notNull().default(0),
    location: text("location"),
    defaultOperatorId: uuid("default_operator_id").references(() => employees.id, { onDelete: "set null" }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("machines_code_uq").on(t.code), index("machines_type_idx").on(t.typeCode)],
);

export const machineMaintenance = pgTable(
  "machine_maintenance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    kind: maintenanceKind("kind").notNull(),
    status: maintenanceStatus("status").notNull().default("SCHEDULED"),
    title: text("title").notNull(),
    notes: text("notes"),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cost: bigint("cost", { mode: "number" }),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("maintenance_machine_idx").on(t.machineId, t.scheduledStart),
    check("maintenance_window", sql`${t.scheduledEnd} > ${t.scheduledStart}`),
  ],
);
