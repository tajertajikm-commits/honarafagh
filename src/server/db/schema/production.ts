import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { lithoStatus, machineCategory, qualityDecision, stepStatus, stockMovementReason } from "./enums";
import { employees, timestamps, users } from "./identity";
import { orders } from "./orders";

const money = (name: string) => bigint(name, { mode: "number" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

// ── Machines ────────────────────────────────────────────────────────────────

/** Offset presses (1/4/8 colour) and digital printers. */
export const machines = pgTable(
  "machines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 24 }).notNull(),
    name: text("name").notNull(),
    category: machineCategory("category").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("machines_code_uq").on(t.code)],
);

// ── Production plan ─────────────────────────────────────────────────────────

/**
 * The production plan of one order: only the stations the approver selected.
 * `phase` orders the plan; a step becomes READY when every step in earlier
 * phases is DONE (steps sharing a phase run in parallel, e.g. Offset
 * lithography and paper procurement). Station definitions: modules/workflow/stations.ts.
 */
export const productionSteps = pgTable(
  "production_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 32 }).notNull(),
    phase: integer("phase").notNull(),
    status: stepStatus("status").notNull().default("WAITING"),
    assigneeId: uuid("assignee_id").references(() => employees.id, { onDelete: "set null" }),
    machineId: uuid("machine_id").references(() => machines.id, { onDelete: "set null" }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    startedBy: uuid("started_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
    /** Times this step was sent back by a quality rejection. */
    reworkCount: integer("rework_count").notNull().default(0),
    note: text("note"),
    /** Step-specific record, e.g. paper used: { materialId, quantity }. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("production_steps_order_key_uq").on(t.orderId, t.key), index("production_steps_queue_idx").on(t.key, t.status)],
);

/** Print-quality and final-quality decisions (history; a rejection sends work back). */
export const qualityApprovals = pgTable(
  "quality_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => productionSteps.id, { onDelete: "cascade" }),
    decision: qualityDecision("decision").notNull(),
    approverId: uuid("approver_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    reason: text("reason"),
    /** On rejection: the step the work returns to. */
    returnToStep: varchar("return_to_step", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quality_approvals_order_idx").on(t.orderId, t.createdAt)],
);

/** Audited priority changes (who, when, why, optional extra charge). */
export const priorityChanges = pgTable(
  "priority_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    isPriority: boolean("is_priority").notNull(),
    reason: text("reason").notNull(),
    charge: money("charge"),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("priority_changes_order_idx").on(t.orderId, t.createdAt)],
);

// ── Materials (paper, cardboard, film, UV, binding, plates, packaging) ──────

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: varchar("sku", { length: 48 }).notNull(),
    name: text("name").notNull(),
    /** PAPER | CARDBOARD | FILM | UV | BINDING | PLATE | PACKAGING | OTHER */
    category: varchar("category", { length: 16 }).notNull(),
    unit: varchar("unit", { length: 12 }).notNull(),
    /** Standard cost per unit (rial); the store pricing engine uses it. */
    standardCost: numeric("standard_cost", { precision: 16, scale: 2, mode: "number" }).notNull().default(0),
    grammage: integer("grammage"),
    sheetWidthMm: integer("sheet_width_mm"),
    sheetHeightMm: integer("sheet_height_mm"),
    stock: qty("stock").notNull().default(0),
    minStock: qty("min_stock").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("materials_sku_uq").on(t.sku), check("materials_cost_nonneg", sql`${t.standardCost} >= 0`)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    delta: qty("delta").notNull(),
    reason: stockMovementReason("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movements_material_idx").on(t.materialId, t.createdAt)],
);

// ── Offset: suppliers, paper quotations, lithography ───────────────────────

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** PAPER | LITHO | OTHER */
  kind: varchar("kind", { length: 12 }).notNull(),
  contactName: text("contact_name"),
  phone: varchar("phone", { length: 16 }),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/** Prices collected by phone from paper suppliers for one order. */
export const supplierQuotes = pgTable(
  "supplier_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    price: money("price").notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplier_quotes_order_idx").on(t.orderId), check("supplier_quotes_price_pos", sql`${t.price} > 0`)],
);

/** The manager's choice among the quotes (one per order; re-deciding replaces it and is audited). */
export const procurementDecisions = pgTable(
  "procurement_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => supplierQuotes.id),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("procurement_decisions_order_uq").on(t.orderId)],
);

/** Outsourced lithography (plates/films): recorded, not controlled. */
export const lithographyJobs = pgTable(
  "lithography_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    status: lithoStatus("status").notNull().default("NOT_ORDERED"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    price: money("price"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("lithography_jobs_order_uq").on(t.orderId)],
);
