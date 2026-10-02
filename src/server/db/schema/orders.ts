import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { PriceBreakdown, Selections } from "@/server/modules/pricing/types";
import { pricingRuleVersions, products } from "./catalog";
import {
  approvalDecision,
  artworkFileStatus,
  artworkSource,
  artworkStatus,
  orderKind,
  orderStatus,
  paymentStatus,
  productionType,
  urgency,
} from "./enums";
import { customers, employees, timestamps, users } from "./identity";

const money = (name: string) => bigint(name, { mode: "number" });

export interface AddressSnapshot {
  title?: string;
  province: string;
  city: string;
  line: string;
  postalCode?: string | null;
  recipientName: string;
  recipientPhone: string;
}

// ── Files ───────────────────────────────────────────────────────────────────

export const fileObjects = pgTable(
  "file_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageDriver: varchar("storage_driver", { length: 16 }).notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    /** ARTWORK | DESIGN | PAYMENT_RECEIPT | PRODUCT_IMAGE | ATTACHMENT */
    purpose: varchar("purpose", { length: 24 }).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("file_objects_key_uq").on(t.storageKey), check("file_size_pos", sql`${t.sizeBytes} > 0`)],
);

// ── Cart (store purchases) ──────────────────────────────────────────────────

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    /** SHA-256 of the anonymous cart cookie token (guests). */
    tokenHash: varchar("token_hash", { length: 64 }),
    ...timestamps,
  },
  (t) => [uniqueIndex("carts_customer_uq").on(t.customerId), uniqueIndex("carts_token_uq").on(t.tokenHash)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    selections: jsonb("selections").$type<Selections>().notNull(),
    urgency: urgency("urgency").notNull().default("STANDARD"),
    /** Price shown when added; re-validated at checkout. */
    quotedSubtotal: money("quoted_subtotal").notNull(),
    pricingVersionId: uuid("pricing_version_id").references(() => pricingRuleVersions.id),
    artworkFileIds: uuid("artwork_file_ids").array().notNull().default(sql`'{}'::uuid[]`),
    needsDesign: boolean("needs_design").notNull().default(false),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId), check("cart_items_qty_pos", sql`${t.quantity} > 0`)],
);

// ── Orders ──────────────────────────────────────────────────────────────────

/**
 * One order = one printing project with one production type and one
 * production plan. Code: D-{customer code}-{seq} or O-{customer code}-{seq},
 * fixed for the lifetime of the order.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 24 }).notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: orderKind("kind").notNull(),
    productionType: productionType("production_type").notNull(),

    status: orderStatus("status").notNull().default("WAITING_APPROVAL"),
    paymentStatus: paymentStatus("payment_status").notNull().default("UNPAID"),
    artworkStatus: artworkStatus("artwork_status").notNull().default("AWAITING_FILE"),

    // Project specification (custom orders; store orders summarise their items)
    title: text("title").notNull(),
    description: text("description"),
    quantity: integer("quantity"),
    dimensions: text("dimensions"),
    material: text("material"),
    colors: text("colors"),
    finishing: text("finishing"),
    needsDesign: boolean("needs_design").notNull().default(false),
    designerId: uuid("designer_id").references(() => employees.id, { onDelete: "set null" }),
    requestedDeadline: timestamp("requested_deadline", { withTimezone: true }),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),

    // Queue priority (explicit and audited, see priority_changes)
    isPriority: boolean("is_priority").notNull().default(false),
    prioritySetAt: timestamp("priority_set_at", { withTimezone: true }),

    // Money (rial). Custom orders are priced at/after approval (pricedAt).
    subtotal: money("subtotal").notNull().default(0),
    discountAmount: money("discount_amount").notNull().default(0),
    shippingAmount: money("shipping_amount").notNull().default(0),
    vatPct: integer("vat_pct").notNull().default(10),
    vatAmount: money("vat_amount").notNull().default(0),
    total: money("total").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    refundedAmount: money("refunded_amount").notNull().default(0),
    pricedAt: timestamp("priced_at", { withTimezone: true }),

    deliveryMethodId: uuid("delivery_method_id"),
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot | null>(),

    approvedAt: timestamp("approved_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),

    createdBy: uuid("created_by").references(() => users.id),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_code_uq").on(t.code),
    uniqueIndex("orders_idempotency_uq").on(t.idempotencyKey),
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_status_idx").on(t.status),
    check(
      "orders_amounts_nonneg",
      sql`${t.subtotal} >= 0 AND ${t.discountAmount} >= 0 AND ${t.vatAmount} >= 0 AND ${t.total} >= 0 AND ${t.paidAmount} >= 0 AND ${t.refundedAmount} >= 0`,
    ),
  ],
);

/** Invoice lines. Store orders: one per cart line; custom orders: the priced project. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    productId: uuid("product_id").references(() => products.id),
    title: text("title").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull(),
    unitLabel: text("unit_label").notNull().default("عدد"),
    selections: jsonb("selections").$type<Selections>().notNull().default({}),
    /** Immutable price snapshot; future rule changes never alter it. */
    priceSnapshot: jsonb("price_snapshot").$type<PriceBreakdown | null>(),
    pricingVersionId: uuid("pricing_version_id").references(() => pricingRuleVersions.id),
    lineSubtotal: money("line_subtotal").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("order_items_line_uq").on(t.orderId, t.lineNo),
    check("order_items_qty_pos", sql`${t.quantity} > 0`),
    check("order_items_subtotal_nonneg", sql`${t.lineSubtotal} >= 0`),
  ],
);

/** Timeline: everything that happened to an order. Customer-visible rows are its messages/history. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** ORDER | APPROVAL | ARTWORK | PRODUCTION | QUALITY | PROCUREMENT | PAYMENT | SHIPPING | MESSAGE */
    domain: varchar("domain", { length: 16 }).notNull(),
    type: varchar("type", { length: 48 }).notNull(),
    message: text("message"),
    visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
    actorId: uuid("actor_id").references(() => users.id),
    actorLabel: text("actor_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/**
 * The first gate. Every decision is a row (history): approved with the
 * selected production steps, rejected with a reason, or sent back for info.
 */
export const orderApprovals = pgTable(
  "order_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    decision: approvalDecision("decision").notNull(),
    approverId: uuid("approver_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    reason: text("reason"),
    selectedSteps: text("selected_steps").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_approvals_order_idx").on(t.orderId, t.createdAt)],
);

/** Artwork versions: customer uploads and designer output. Never overwritten. */
export const artworkFiles = pgTable(
  "artwork_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    source: artworkSource("source").notNull(),
    status: artworkFileStatus("status").notNull().default("UPLOADED"),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileObjects.id),
    note: text("note"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("artwork_files_version_uq").on(t.orderId, t.versionNo)],
);
