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
import { deliveryKind, paymentKind, paymentMethod, paymentRecordStatus, shipmentStatus } from "./enums";
import { customers, employees, timestamps, users } from "./identity";
import { type AddressSnapshot, fileObjects, orderItems, orders } from "./orders";

const money = (name: string) => bigint(name, { mode: "number" });

/**
 * Payments are their own aggregate. The order's payment status is derived
 * from CONFIRMED payments/refunds; order status never depends on it directly.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: paymentKind("kind").notNull().default("PAYMENT"),
    method: paymentMethod("method").notNull(),
    status: paymentRecordStatus("status").notNull(),
    amount: money("amount").notNull(),
    provider: varchar("provider", { length: 24 }),
    providerAuthority: varchar("provider_authority", { length: 128 }),
    providerRefId: varchar("provider_ref_id", { length: 128 }),
    cardPanMasked: varchar("card_pan_masked", { length: 32 }),
    gatewayPayload: jsonb("gateway_payload").$type<Record<string, unknown>>(),
    /** Bank tracking number, cheque number, POS terminal ref … */
    reference: text("reference"),
    chequeDueDate: timestamp("cheque_due_date", { withTimezone: true }),
    note: text("note"),
    receiptFileId: uuid("receipt_file_id").references(() => fileObjects.id),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    createdBy: uuid("created_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_number_uq").on(t.number),
    uniqueIndex("payments_idempotency_uq").on(t.idempotencyKey),
    uniqueIndex("payments_authority_uq")
      .on(t.provider, t.providerAuthority)
      .where(sql`${t.providerAuthority} IS NOT NULL`),
    uniqueIndex("payments_ref_uq")
      .on(t.provider, t.providerRefId)
      .where(sql`${t.providerRefId} IS NOT NULL`),
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.status),
    check("payments_amount_pos", sql`${t.amount} > 0`),
  ],
);

// ── Delivery ────────────────────────────────────────────────────────────────

export const deliveryMethods = pgTable(
  "delivery_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    kind: deliveryKind("kind").notNull(),
    /** For EXTERNAL methods: which provider adapter handles it. */
    providerCode: varchar("provider_code", { length: 32 }),
    baseFee: money("base_fee").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("delivery_methods_code_uq").on(t.code)],
);

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plateNumber: varchar("plate_number", { length: 32 }),
  kind: varchar("kind", { length: 24 }).notNull().default("VAN"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
});

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    methodId: uuid("method_id")
      .notNull()
      .references(() => deliveryMethods.id),
    status: shipmentStatus("status").notNull().default("PENDING"),
    assigneeId: uuid("assignee_id").references(() => employees.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    externalProvider: text("external_provider"),
    trackingCode: text("tracking_code"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    recipientName: text("recipient_name"),
    recipientPhone: varchar("recipient_phone", { length: 11 }),
    address: jsonb("address").$type<AddressSnapshot | null>(),
    notes: text("notes"),
    proofNote: text("proof_note"),
    proofFileId: uuid("proof_file_id").references(() => fileObjects.id),
    failureReason: text("failure_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("shipments_number_uq").on(t.number),
    index("shipments_order_idx").on(t.orderId),
    index("shipments_status_idx").on(t.status),
  ],
);

export const shipmentItems = pgTable(
  "shipment_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("shipment_items_uq").on(t.shipmentId, t.orderItemId),
    check("shipment_items_qty_pos", sql`${t.quantity} > 0`),
  ],
);
