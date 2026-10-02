import { pgEnum } from "drizzle-orm/pg-core";

// ── Identity ────────────────────────────────────────────────────────────────
export const userKind = pgEnum("user_kind", ["CUSTOMER", "EMPLOYEE"]);
export const sessionKind = pgEnum("session_kind", ["CUSTOMER", "STAFF"]);
export const customerType = pgEnum("customer_type", ["INDIVIDUAL", "COMPANY"]);

// ── Store catalog / pricing ─────────────────────────────────────────────────
export const optionType = pgEnum("option_type", ["SELECT", "NUMBER", "TOGGLE"]);
export const ruleVersionStatus = pgEnum("rule_version_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const urgency = pgEnum("urgency", ["STANDARD", "EXPRESS", "RUSH"]);

// ── Orders ──────────────────────────────────────────────────────────────────
/** Every order is produced by exactly one of the two processes. */
export const productionType = pgEnum("production_type", ["DIGITAL", "OFFSET"]);
/** STORE = bought from the catalog, CUSTOM = custom printing request. */
export const orderKind = pgEnum("order_kind", ["STORE", "CUSTOM"]);
/**
 * Order lifecycle. Production/quality/shipping details live in their own
 * records (steps, quality approvals, shipments); this is the summary the
 * engine keeps in sync and the customer status is derived from.
 */
export const orderStatus = pgEnum("order_status", [
  "WAITING_APPROVAL",
  "NEEDS_INFO",
  "APPROVED",
  "IN_PRODUCTION",
  "READY",
  "SHIPPING",
  "DELIVERED",
  "REJECTED",
  "CANCELLED",
]);
export const paymentStatus = pgEnum("payment_status", ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERPAID", "REFUNDED"]);
export const artworkStatus = pgEnum("artwork_status", [
  "AWAITING_FILE",
  "AWAITING_REVIEW",
  "APPROVED",
  "NEEDS_CORRECTION",
  "DESIGN_REQUESTED",
  "DESIGN_IN_PROGRESS",
  "DESIGN_COMPLETED",
]);
export const artworkSource = pgEnum("artwork_source", ["CUSTOMER", "DESIGNER"]);
export const artworkFileStatus = pgEnum("artwork_file_status", ["UPLOADED", "APPROVED", "REJECTED", "SUPERSEDED"]);
export const approvalDecision = pgEnum("approval_decision", ["APPROVED", "REJECTED", "NEEDS_INFO"]);

// ── Production ──────────────────────────────────────────────────────────────
/** WAITING = earlier steps not finished, READY = in the station queue. */
export const stepStatus = pgEnum("step_status", ["WAITING", "READY", "IN_PROGRESS", "DONE"]);
export const qualityDecision = pgEnum("quality_decision", ["APPROVED", "REJECTED"]);
export const machineCategory = pgEnum("machine_category", ["ONE_COLOR", "FOUR_COLOR", "EIGHT_COLOR", "DIGITAL"]);
export const lithoStatus = pgEnum("litho_status", ["NOT_ORDERED", "ORDERED", "IN_PROGRESS", "READY", "RECEIVED", "CANCELLED"]);
export const stockMovementReason = pgEnum("stock_movement_reason", ["RECEIVE", "CONSUME", "ADJUST"]);

// ── Finance ─────────────────────────────────────────────────────────────────
export const paymentKind = pgEnum("payment_kind", ["PAYMENT", "REFUND"]);
export const paymentMethod = pgEnum("payment_method", ["ONLINE", "CASH", "POS", "BANK_TRANSFER", "CHEQUE", "CREDIT"]);
export const paymentRecordStatus = pgEnum("payment_record_status", ["PENDING", "AWAITING_APPROVAL", "CONFIRMED", "FAILED", "CANCELLED", "REJECTED"]);
export const invoiceType = pgEnum("invoice_type", ["OFFICIAL", "UNOFFICIAL"]);
export const invoiceStatus = pgEnum("invoice_status", ["ISSUED", "VOID"]);

// ── Shipping ────────────────────────────────────────────────────────────────
/** Printing-house courier, post, external delivery service, customer's courier, pickup. */
export const shippingMethod = pgEnum("shipping_method", ["COURIER", "POST", "EXTERNAL", "CUSTOMER_COURIER", "PICKUP"]);
export const shipmentStatus = pgEnum("shipment_status", ["DISPATCHED", "DELIVERED"]);

// ── Platform ────────────────────────────────────────────────────────────────
export const outboxStatus = pgEnum("outbox_status", ["PENDING", "PROCESSING", "DONE", "FAILED"]);
export const notificationChannel = pgEnum("notification_channel", ["SMS", "IN_APP", "EMAIL"]);
export const notificationStatus = pgEnum("notification_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);
export const notificationAudience = pgEnum("notification_audience", ["CUSTOMER", "STAFF"]);
