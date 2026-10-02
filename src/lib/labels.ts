/** Persian labels and visual tones for every state domain. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "violet";

type Map_ = Record<string, readonly [label: string, tone: Tone]>;

/** Internal order lifecycle (staff). Customers see lib/order-status.ts. */
export const ORDER_STATUS: Map_ = {
  WAITING_APPROVAL: ["در انتظار تأیید", "warning"],
  NEEDS_INFO: ["منتظر پاسخ مشتری", "violet"],
  APPROVED: ["تأیید شده", "info"],
  IN_PRODUCTION: ["در حال تولید", "accent"],
  READY: ["آماده ارسال", "success"],
  SHIPPING: ["در حال ارسال", "info"],
  DELIVERED: ["تحویل شده", "neutral"],
  REJECTED: ["رد شده", "danger"],
  CANCELLED: ["لغو شده", "neutral"],
};
export const PAYMENT_STATUS: Map_ = {
  UNPAID: ["پرداخت نشده", "warning"],
  PARTIALLY_PAID: ["پرداخت بخشی", "info"],
  PAID: ["تسویه", "success"],
  OVERPAID: ["اضافه پرداخت", "violet"],
  REFUNDED: ["بازپرداخت شده", "neutral"],
};
export const ARTWORK_STATUS: Map_ = {
  AWAITING_FILE: ["منتظر فایل مشتری", "warning"],
  AWAITING_REVIEW: ["فایل در انتظار بررسی", "info"],
  APPROVED: ["فایل تأیید شده", "success"],
  NEEDS_CORRECTION: ["فایل نیاز به اصلاح", "danger"],
  DESIGN_REQUESTED: ["طراحی درخواست شده", "violet"],
  DESIGN_IN_PROGRESS: ["در حال طراحی", "violet"],
  DESIGN_COMPLETED: ["طراحی انجام شد", "success"],
};
export const ARTWORK_FILE_STATUS: Map_ = {
  UPLOADED: ["در انتظار بررسی", "info"],
  APPROVED: ["تأیید برای چاپ", "success"],
  REJECTED: ["نیاز به اصلاح", "danger"],
  SUPERSEDED: ["نسخه قدیمی", "neutral"],
};
export const STEP_STATUS: Map_ = {
  WAITING: ["در نوبت", "neutral"],
  READY: ["در صف", "warning"],
  IN_PROGRESS: ["در حال انجام", "accent"],
  DONE: ["انجام شد", "success"],
};
export const LITHO_STATUS: Map_ = {
  NOT_ORDERED: ["سفارش داده نشده", "neutral"],
  ORDERED: ["سفارش داده شد", "info"],
  IN_PROGRESS: ["در حال انجام در لیتوگرافی", "accent"],
  READY: ["آماده تحویل", "warning"],
  RECEIVED: ["دریافت شد", "success"],
  CANCELLED: ["لغو شد", "neutral"],
};
export const APPROVAL_DECISION: Map_ = {
  APPROVED: ["تأیید", "success"],
  REJECTED: ["رد", "danger"],
  NEEDS_INFO: ["درخواست توضیح", "violet"],
};
export const PAYMENT_RECORD_STATUS: Map_ = {
  PENDING: ["در جریان", "neutral"],
  AWAITING_APPROVAL: ["منتظر تأیید", "warning"],
  CONFIRMED: ["تأیید شده", "success"],
  FAILED: ["ناموفق", "danger"],
  CANCELLED: ["لغو شده", "neutral"],
  REJECTED: ["رد شده", "danger"],
};
export const PAYMENT_METHOD: Record<string, string> = {
  ONLINE: "پرداخت اینترنتی",
  CASH: "نقدی",
  POS: "کارتخوان",
  BANK_TRANSFER: "کارت به کارت / حواله",
  CHEQUE: "چک",
  CREDIT: "اعتبار",
};
export const SHIPPING_METHOD: Record<string, string> = {
  COURIER: "پیک چاپخانه",
  POST: "پست",
  EXTERNAL: "باربری / شرکت پخش",
  CUSTOMER_COURIER: "پیک مشتری",
  PICKUP: "تحویل حضوری",
};
export const PRODUCTION_TYPE: Record<string, string> = { DIGITAL: "دیجیتال", OFFSET: "افست" };
export const ORDER_KIND: Record<string, string> = { STORE: "خرید از فروشگاه", CUSTOM: "سفارش اختصاصی" };
export const MACHINE_CATEGORY: Record<string, string> = { ONE_COLOR: "تک‌رنگ", FOUR_COLOR: "چهاررنگ", EIGHT_COLOR: "هشت‌رنگ", DIGITAL: "دیجیتال" };
export const INVOICE_TYPE: Record<string, string> = { OFFICIAL: "رسمی (حقوقی)", UNOFFICIAL: "غیررسمی (حقیقی)" };
export const CUSTOMER_TYPE: Record<string, string> = { INDIVIDUAL: "حقیقی", COMPANY: "حقوقی" };
export const URGENCY: Record<string, string> = { STANDARD: "عادی", EXPRESS: "فوری", RUSH: "خیلی فوری" };
export const METHOD = PRODUCTION_TYPE;
export const UNIT: Record<string, string> = { SHEET: "برگ", KG: "کیلوگرم", ROLL: "رول", METER: "متر", SQM: "مترمربع", PIECE: "عدد", LITER: "لیتر", PACK: "بسته" };

export function label(map: Map_, key: string | null | undefined): string {
  return key ? (map[key]?.[0] ?? key) : "—";
}
export function tone(map: Map_, key: string | null | undefined): Tone {
  return key ? (map[key]?.[1] ?? "neutral") : "neutral";
}
