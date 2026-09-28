import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { PriceBreakdown, Selections } from "@/server/modules/pricing/types";
import { pricingRuleVersions, products } from "./catalog";
import {
  artworkStage,
  artworkStatus,
  changeRequestStatus,
  deliveryStatus,
  filePurpose,
  fileStatus,
  inquiryStatus,
  itemStatus,
  orderPriority,
  orderSource,
  orderStatus,
  paymentStatus,
  procurementStatus,
  productionStatus,
  qcStatus,
  quoteStatus,
  urgency,
} from "./enums";
import { deliveryMethods } from "./finance";
import { customers, timestamps, users } from "./identity";

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
    purpose: filePurpose("purpose").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("file_objects_key_uq").on(t.storageKey), check("file_size_pos", sql`${t.sizeBytes} > 0`)],
);

/** Generic attachment link (quote attachments, task photos, QC images, delivery proof …). */
export const entityFiles = pgTable(
  "entity_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileObjects.id, { onDelete: "cascade" }),
    label: text("label"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("entity_files_entity_idx").on(t.entityType, t.entityId)],
);

// ── Quotes ──────────────────────────────────────────────────────────────────

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity"),
    selections: jsonb("selections").$type<Selections>(),
    deadline: timestamp("deadline", { withTimezone: true }),
    status: inquiryStatus("status").notNull().default("NEW"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("inquiries_number_uq").on(t.number), index("inquiries_status_idx").on(t.status)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: quoteStatus("status").notNull().default("DRAFT"),
    urgency: urgency("urgency").notNull().default("STANDARD"),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    subtotal: money("subtotal").notNull().default(0),
    discountAmount: money("discount_amount").notNull().default(0),
    vatPct: integer("vat_pct").notNull().default(10),
    vatAmount: money("vat_amount").notNull().default(0),
    total: money("total").notNull().default(0),
    costTotal: money("cost_total").notNull().default(0),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    createdBy: uuid("created_by").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    convertedOrderId: uuid("converted_order_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_number_uq").on(t.number),
    index("quotes_customer_idx").on(t.customerId),
    check("quotes_totals_nonneg", sql`${t.subtotal} >= 0 AND ${t.discountAmount} >= 0 AND ${t.total} >= 0`),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    title: text("title").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull(),
    selections: jsonb("selections").$type<Selections>().notNull().default({}),
    priceSnapshot: jsonb("price_snapshot").$type<PriceBreakdown | null>(),
    pricingVersionId: uuid("pricing_version_id").references(() => pricingRuleVersions.id),
    /** Line price excluding VAT. When overridden, differs from the snapshot subtotal. */
    lineSubtotal: money("line_subtotal").notNull(),
    costTotal: money("cost_total").notNull().default(0),
    isPriceOverridden: boolean("is_price_overridden").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId), check("quote_items_qty_pos", sql`${t.quantity} > 0`)],
);

// ── Cart ────────────────────────────────────────────────────────────────────

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

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('order_number_seq')`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    source: orderSource("source").notNull(),
    quoteId: uuid("quote_id").references(() => quotes.id),

    // Independent state domains
    status: orderStatus("status").notNull().default("PENDING_REVIEW"),
    paymentStatus: paymentStatus("payment_status").notNull().default("UNPAID"),
    fileStatus: fileStatus("file_status").notNull().default("AWAITING_FILE"),
    procurementStatus: procurementStatus("procurement_status").notNull().default("NOT_EVALUATED"),
    productionStatus: productionStatus("production_status").notNull().default("NOT_STARTED"),
    qcStatus: qcStatus("qc_status").notNull().default("PENDING"),
    deliveryStatus: deliveryStatus("delivery_status").notNull().default("NOT_READY"),

    priority: orderPriority("priority").notNull().default("NORMAL"),
    urgency: urgency("urgency").notNull().default("STANDARD"),

    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull().default(0),
    shippingAmount: money("shipping_amount").notNull().default(0),
    vatPct: integer("vat_pct").notNull().default(10),
    vatAmount: money("vat_amount").notNull().default(0),
    total: money("total").notNull(),
    paidAmount: money("paid_amount").notNull().default(0),
    refundedAmount: money("refunded_amount").notNull().default(0),
    costTotal: money("cost_total").notNull().default(0),
    /** Minimum paid percentage before plates/printing may start. */
    depositPct: integer("deposit_pct").notNull().default(50),
    paymentGateOverride: boolean("payment_gate_override").notNull().default(false),

    deliveryMethodId: uuid("delivery_method_id").references(() => deliveryMethods.id),
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot | null>(),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    projectedCompletionAt: timestamp("projected_completion_at", { withTimezone: true }),

    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),

    createdBy: uuid("created_by").references(() => users.id),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    /** Optimistic concurrency token for manual edits. */
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_number_uq").on(t.number),
    uniqueIndex("orders_idempotency_uq").on(t.idempotencyKey),
    index("orders_customer_idx").on(t.customerId, t.placedAt),
    index("orders_status_idx").on(t.status),
    index("orders_due_idx").on(t.dueDate),
    check(
      "orders_amounts_nonneg",
      sql`${t.subtotal} >= 0 AND ${t.discountAmount} >= 0 AND ${t.vatAmount} >= 0 AND ${t.total} >= 0 AND ${t.paidAmount} >= 0 AND ${t.refundedAmount} >= 0`,
    ),
    check("orders_deposit_range", sql`${t.depositPct} BETWEEN 0 AND 100`),
  ],
);

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
    quantity: integer("quantity").notNull(),
    unitLabel: text("unit_label").notNull().default("عدد"),
    selections: jsonb("selections").$type<Selections>().notNull().default({}),
    /** Immutable price snapshot; future rule changes never alter it. */
    priceSnapshot: jsonb("price_snapshot").$type<PriceBreakdown | null>(),
    pricingVersionId: uuid("pricing_version_id").references(() => pricingRuleVersions.id),
    lineSubtotal: money("line_subtotal").notNull(),
    costTotal: money("cost_total").notNull().default(0),
    isPriceOverridden: boolean("is_price_overridden").notNull().default(false),
    productionMethod: varchar("production_method", { length: 24 }),
    workflowTemplateCode: varchar("workflow_template_code", { length: 48 }),
    needsDesign: boolean("needs_design").notNull().default(false),
    status: itemStatus("status").notNull().default("ACTIVE"),
    fileStatus: fileStatus("file_status").notNull().default("AWAITING_FILE"),
    productionStatus: productionStatus("production_status").notNull().default("NOT_STARTED"),
    qcStatus: qcStatus("qc_status").notNull().default("PENDING"),
    quantityProduced: integer("quantity_produced").notNull().default(0),
    quantityDelivered: integer("quantity_delivered").notNull().default(0),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("order_items_line_uq").on(t.orderId, t.lineNo),
    check("order_items_qty_pos", sql`${t.quantity} > 0`),
    check("order_items_delivered_le_qty", sql`${t.quantityDelivered} <= ${t.quantity}`),
    check("order_items_subtotal_nonneg", sql`${t.lineSubtotal} >= 0`),
  ],
);

/** Timeline of everything that happened to an order across all domains. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id"),
    domain: varchar("domain", { length: 16 }).notNull(),
    type: varchar("type", { length: 48 }).notNull(),
    fromState: varchar("from_state", { length: 32 }),
    toState: varchar("to_state", { length: 32 }),
    message: text("message"),
    visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const orderChangeRequests = pgTable(
  "order_change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id),
    description: text("description").notNull(),
    status: changeRequestStatus("status").notNull().default("PENDING"),
    priceDelta: money("price_delta"),
    resolution: text("resolution"),
    requestedBy: uuid("requested_by").references(() => users.id),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_change_requests_order_idx").on(t.orderId)],
);

/**
 * Artwork versions: never overwritten. Every upload is a new row.
 * Exactly one version per item may be APPROVED_FOR_PRINT at a time.
 */
export const artworkVersions = pgTable(
  "artwork_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    stage: artworkStage("stage").notNull(),
    status: artworkStatus("status").notNull().default("UPLOADED"),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileObjects.id),
    parentVersionId: uuid("parent_version_id"),
    note: text("note"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    customerDecisionAt: timestamp("customer_decision_at", { withTimezone: true }),
    customerComment: text("customer_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("artwork_versions_no_uq").on(t.orderItemId, t.versionNo),
    uniqueIndex("artwork_versions_one_approved")
      .on(t.orderItemId)
      .where(sql`${t.status} = 'APPROVED_FOR_PRINT'`),
  ],
);
