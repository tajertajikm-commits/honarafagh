import { pgEnum } from "drizzle-orm/pg-core";

// ── Identity ────────────────────────────────────────────────────────────────
export const userKind = pgEnum("user_kind", ["CUSTOMER", "EMPLOYEE"]);
export const sessionKind = pgEnum("session_kind", ["CUSTOMER", "STAFF"]);
export const customerType = pgEnum("customer_type", ["INDIVIDUAL", "COMPANY"]);

// ── Catalog / pricing ───────────────────────────────────────────────────────
export const optionType = pgEnum("option_type", ["SELECT", "NUMBER", "TOGGLE"]);
export const ruleVersionStatus = pgEnum("rule_version_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const urgency = pgEnum("urgency", ["STANDARD", "EXPRESS", "RUSH"]);

// ── Quotes ──────────────────────────────────────────────────────────────────
export const inquiryStatus = pgEnum("inquiry_status", ["NEW", "IN_REVIEW", "QUOTED", "CLOSED", "REJECTED"]);
export const quoteStatus = pgEnum("quote_status", ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "CONVERTED"]);

// ── Orders: independent state domains ───────────────────────────────────────
export const orderStatus = pgEnum("order_status", [
  "DRAFT",
  "PENDING_REVIEW",
  "CONFIRMED",
  "IN_PROGRESS",
  "ON_HOLD",
  "READY",
  "COMPLETED",
  "CANCELLED",
]);
export const paymentStatus = pgEnum("payment_status", ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERPAID", "REFUNDED"]);
export const fileStatus = pgEnum("file_status", [
  "NOT_REQUIRED",
  "AWAITING_FILE",
  "IN_DESIGN",
  "UNDER_REVIEW",
  "NEEDS_REVISION",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED",
]);
export const procurementStatus = pgEnum("procurement_status", [
  "NOT_EVALUATED",
  "WAITING_FOR_MATERIAL",
  "PARTIALLY_RESERVED",
  "RESERVED",
  "ISSUED",
  "NOT_REQUIRED",
]);
export const productionStatus = pgEnum("production_status", [
  "NOT_STARTED",
  "WAITING",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);
export const qcStatus = pgEnum("qc_status", ["PENDING", "IN_REWORK", "PASSED", "FAILED"]);
export const deliveryStatus = pgEnum("delivery_status", [
  "NOT_READY",
  "READY",
  "SCHEDULED",
  "OUT_FOR_DELIVERY",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "FAILED",
]);
export const orderSource = pgEnum("order_source", ["WEBSITE", "SALES", "QUOTE", "PHONE", "API"]);
export const orderPriority = pgEnum("order_priority", ["LOW", "NORMAL", "HIGH", "URGENT"]);
export const itemStatus = pgEnum("item_status", ["ACTIVE", "CANCELLED"]);
export const changeRequestStatus = pgEnum("change_request_status", ["PENDING", "APPROVED", "REJECTED"]);

// ── Files ───────────────────────────────────────────────────────────────────
export const filePurpose = pgEnum("file_purpose", [
  "ARTWORK",
  "PROOF",
  "QC_IMAGE",
  "DELIVERY_PROOF",
  "ATTACHMENT",
  "PRODUCT_IMAGE",
  "PAYMENT_RECEIPT",
]);
export const artworkStage = pgEnum("artwork_stage", ["CUSTOMER_ORIGINAL", "DESIGNER", "PREPRESS", "PROOF", "PRINT_READY"]);
export const artworkStatus = pgEnum("artwork_status", [
  "UPLOADED",
  "REJECTED",
  "SENT_FOR_APPROVAL",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "APPROVED_FOR_PRINT",
  "SUPERSEDED",
]);

// ── Workflow / production ───────────────────────────────────────────────────
export const templateStatus = pgEnum("template_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const jobStatus = pgEnum("job_status", ["PLANNED", "RELEASED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);
export const taskStatus = pgEnum("task_status", [
  "PENDING",
  "READY",
  "IN_PROGRESS",
  "PAUSED",
  "BLOCKED",
  "COMPLETED",
  "SKIPPED",
  "CANCELLED",
]);
export const issueType = pgEnum("issue_type", [
  "MACHINE_BREAKDOWN",
  "MATERIAL_SHORTAGE",
  "FILE_PROBLEM",
  "QUALITY_PROBLEM",
  "WAITING_FOR_INFO",
  "OTHER",
]);
export const issueStatus = pgEnum("issue_status", ["OPEN", "RESOLVED"]);

// ── Machines ────────────────────────────────────────────────────────────────
export const machineStatus = pgEnum("machine_status", ["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"]);
export const maintenanceKind = pgEnum("maintenance_kind", ["PREVENTIVE", "REPAIR", "INSPECTION"]);
export const maintenanceStatus = pgEnum("maintenance_status", ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

// ── Inventory / procurement ─────────────────────────────────────────────────
export const inventoryTxType = pgEnum("inventory_tx_type", [
  "RECEIVE",
  "RESERVE",
  "RELEASE",
  "ISSUE",
  "CONSUME",
  "RETURN",
  "ADJUST",
  "WASTE",
]);
export const requirementStatus = pgEnum("requirement_status", [
  "PENDING",
  "SHORTAGE",
  "PARTIALLY_RESERVED",
  "RESERVED",
  "PARTIALLY_ISSUED",
  "ISSUED",
  "COMPLETED",
  "RELEASED",
]);
export const materialRequestStatus = pgEnum("material_request_status", ["OPEN", "ORDERED", "FULFILLED", "CANCELLED"]);
export const materialRequestReason = pgEnum("material_request_reason", ["SHORTAGE", "REORDER", "MANUAL"]);
export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "DRAFT",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
]);

// ── QC ──────────────────────────────────────────────────────────────────────
export const qcResult = pgEnum("qc_result", ["PASSED", "FAILED"]);
export const defectSeverity = pgEnum("defect_severity", ["MINOR", "MAJOR", "CRITICAL"]);

// ── Finance ─────────────────────────────────────────────────────────────────
export const paymentKind = pgEnum("payment_kind", ["PAYMENT", "REFUND"]);
export const paymentMethod = pgEnum("payment_method", ["ONLINE", "CASH", "POS", "BANK_TRANSFER", "CHEQUE", "CREDIT"]);
export const paymentRecordStatus = pgEnum("payment_record_status", [
  "PENDING",
  "AWAITING_APPROVAL",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
  "REJECTED",
]);

// ── Delivery ────────────────────────────────────────────────────────────────
export const deliveryKind = pgEnum("delivery_kind", ["PICKUP", "INTERNAL", "EXTERNAL"]);
export const shipmentStatus = pgEnum("shipment_status", [
  "PENDING",
  "ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
  "CANCELLED",
]);

// ── Platform ────────────────────────────────────────────────────────────────
export const outboxStatus = pgEnum("outbox_status", ["PENDING", "PROCESSING", "DONE", "FAILED"]);
export const notificationChannel = pgEnum("notification_channel", ["SMS", "IN_APP", "EMAIL"]);
export const notificationStatus = pgEnum("notification_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);
export const notificationAudience = pgEnum("notification_audience", ["CUSTOMER", "ROLE"]);
