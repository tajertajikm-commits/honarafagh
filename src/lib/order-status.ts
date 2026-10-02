/**
 * What the customer sees. The internal workflow (stations, quality checks,
 * procurement) never leaks; the order's lifecycle maps onto six stages.
 */
export type OrderStatus = "WAITING_APPROVAL" | "NEEDS_INFO" | "APPROVED" | "IN_PRODUCTION" | "READY" | "SHIPPING" | "DELIVERED" | "REJECTED" | "CANCELLED";

export const CUSTOMER_STAGES = [
  { key: "WAITING_APPROVAL", label: "در انتظار تأیید" },
  { key: "APPROVED", label: "تأیید شد" },
  { key: "PREPARING", label: "در حال آماده‌سازی" },
  { key: "READY", label: "آماده" },
  { key: "SHIPPING", label: "در حال ارسال" },
  { key: "SHIPPED", label: "ارسال شد" },
] as const;
export type CustomerStage = (typeof CUSTOMER_STAGES)[number]["key"];

const STAGE_OF: Record<OrderStatus, CustomerStage | null> = {
  WAITING_APPROVAL: "WAITING_APPROVAL",
  NEEDS_INFO: "WAITING_APPROVAL",
  APPROVED: "APPROVED",
  IN_PRODUCTION: "PREPARING",
  READY: "READY",
  SHIPPING: "SHIPPING",
  DELIVERED: "SHIPPED",
  REJECTED: null,
  CANCELLED: null,
};

export interface CustomerStatus {
  stage: CustomerStage | null;
  /** Index into CUSTOMER_STAGES (−1 when closed). */
  index: number;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  /** Something the customer should do now. */
  action: string | null;
}

export function customerStatus(status: OrderStatus, artwork?: string | null): CustomerStatus {
  if (status === "REJECTED") return { stage: null, index: -1, label: "پذیرفته نشد", tone: "danger", action: null };
  if (status === "CANCELLED") return { stage: null, index: -1, label: "لغو شد", tone: "neutral", action: null };
  const stage = STAGE_OF[status]!;
  const index = CUSTOMER_STAGES.findIndex((s) => s.key === stage);
  const label = CUSTOMER_STAGES[index]!.label;
  let action: string | null = null;
  if (status === "NEEDS_INFO") action = "برای بررسی سفارش به توضیح بیشتری از شما نیاز داریم.";
  else if (artwork === "NEEDS_CORRECTION") action = "فایل شما نیاز به اصلاح دارد؛ لطفاً نسخه اصلاح‌شده را بارگذاری کنید.";
  else if (artwork === "AWAITING_FILE" && status !== "DELIVERED") action = "فایل طرح را بارگذاری کنید.";
  const tone = status === "NEEDS_INFO" || action ? "warning" : stage === "SHIPPED" ? "success" : stage === "READY" ? "success" : "info";
  return { stage, index, label, tone, action };
}

/** D-1042-0037 / O-1042-0019 */
export const ORDER_CODE_RE = /^([DO])-(\d{3,})-(\d{4,})$/i;
/** CUS-1042 (the prefix is optional when searching). */
export const CUSTOMER_CODE_RE = /^(?:CUS-?)?(\d{4,})$/i;
export const customerCodeLabel = (code: number) => `CUS-${code}`;
