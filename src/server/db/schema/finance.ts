import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { invoiceStatus, invoiceType, paymentKind, paymentMethod, paymentRecordStatus, shipmentStatus, shippingMethod } from "./enums";
import { customers, employees, timestamps, users } from "./identity";
import { type AddressSnapshot, fileObjects, orders } from "./orders";

const money = (name: string) => bigint(name, { mode: "number" });

export const docNumberSeq = pgSequence("doc_number_seq", { startWith: 1001 });
export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 1 });

/**
 * Payments are their own aggregate; the order's payment status is derived
 * from CONFIRMED payments and refunds.
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
    /** Bank tracking number, cheque number, POS reference … */
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

// ── Invoices ────────────────────────────────────────────────────────────────

export interface InvoiceParty {
  name: string;
  companyName?: string | null;
  nationalId?: string | null;
  economicCode?: string | null;
  registrationNo?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
}
export interface InvoiceLine {
  title: string;
  description?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
}
/** Frozen at issue time: later edits to the customer or order never change an issued invoice. */
export interface InvoiceSnapshot {
  customerCode: string;
  orderCode: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  vatPct: number;
  vat: number;
  total: number;
  paid: number;
  remaining: number;
  paymentStatus: string;
  paymentTerms?: string | null;
}

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('invoice_number_seq')`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    type: invoiceType("type").notNull(),
    status: invoiceStatus("status").notNull().default("ISSUED"),
    snapshot: jsonb("snapshot").$type<InvoiceSnapshot>().notNull(),
    total: money("total").notNull(),
    notes: text("notes"),
    issuedBy: uuid("issued_by").references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  },
  (t) => [uniqueIndex("invoices_number_uq").on(t.number), index("invoices_order_idx").on(t.orderId), index("invoices_customer_idx").on(t.customerId)],
);

// ── Delivery options (checkout) and shipments ───────────────────────────────

/** Delivery options a store customer can choose at checkout (with fee). */
export const deliveryMethods = pgTable(
  "delivery_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    method: shippingMethod("method").notNull(),
    baseFee: money("base_fee").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("delivery_methods_code_uq").on(t.code)],
);

/** How the finished order left the printing house, and whether it arrived. */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: shippingMethod("method").notNull(),
    status: shipmentStatus("status").notNull().default("DISPATCHED"),
    responsibleId: uuid("responsible_id").references(() => employees.id, { onDelete: "set null" }),
    /** External delivery company, post office, or the customer's courier name. */
    carrierName: text("carrier_name"),
    trackingCode: text("tracking_code"),
    recipientName: text("recipient_name"),
    recipientPhone: varchar("recipient_phone", { length: 11 }),
    address: jsonb("address").$type<AddressSnapshot | null>(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** The staff member who handed the order to the customer (or the courier who delivered it). */
    deliveredById: uuid("delivered_by_id").references(() => employees.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("shipments_order_uq").on(t.orderId)],
);
