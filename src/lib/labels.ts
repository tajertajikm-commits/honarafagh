/** Persian labels and visual tones for every state domain. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "violet";

type Map_ = Record<string, readonly [label: string, tone: Tone]>;

export const ORDER_STATUS: Map_ = {
  DRAFT: ["پیش‌نویس", "neutral"],
  PENDING_REVIEW: ["در انتظار بررسی", "warning"],
  CONFIRMED: ["تأیید شده", "info"],
  IN_PROGRESS: ["در حال تولید", "accent"],
  ON_HOLD: ["متوقف", "danger"],
  READY: ["آماده تحویل", "success"],
  COMPLETED: ["تکمیل شده", "neutral"],
  CANCELLED: ["لغو شده", "neutral"],
};
export const PAYMENT_STATUS: Map_ = {
  UNPAID: ["پرداخت نشده", "warning"],
  PARTIALLY_PAID: ["پرداخت بخشی", "info"],
  PAID: ["تسویه", "success"],
  OVERPAID: ["اضافه پرداخت", "violet"],
  REFUNDED: ["بازپرداخت شده", "neutral"],
};
export const FILE_STATUS: Map_ = {
  NOT_REQUIRED: ["بدون فایل", "neutral"],
  AWAITING_FILE: ["منتظر فایل", "warning"],
  IN_DESIGN: ["در حال طراحی", "violet"],
  UNDER_REVIEW: ["در حال بررسی", "info"],
  NEEDS_REVISION: ["نیاز به اصلاح", "danger"],
  AWAITING_CUSTOMER_APPROVAL: ["منتظر تأیید مشتری", "warning"],
  APPROVED: ["تأیید شده", "success"],
};
export const PROCUREMENT_STATUS: Map_ = {
  NOT_EVALUATED: ["بررسی نشده", "neutral"],
  WAITING_FOR_MATERIAL: ["منتظر مواد", "danger"],
  PARTIALLY_RESERVED: ["رزرو بخشی", "warning"],
  RESERVED: ["رزرو شده", "info"],
  ISSUED: ["تحویل تولید", "success"],
  NOT_REQUIRED: ["بدون نیاز", "neutral"],
};
export const PRODUCTION_STATUS: Map_ = {
  NOT_STARTED: ["شروع نشده", "neutral"],
  WAITING: ["در صف", "info"],
  IN_PROGRESS: ["در حال تولید", "accent"],
  BLOCKED: ["متوقف (مشکل)", "danger"],
  COMPLETED: ["تولید شد", "success"],
  CANCELLED: ["لغو", "neutral"],
};
export const QC_STATUS: Map_ = {
  PENDING: ["در انتظار", "neutral"],
  IN_REWORK: ["دوباره‌کاری", "danger"],
  PASSED: ["تأیید کیفیت", "success"],
  FAILED: ["رد شده", "danger"],
};
export const DELIVERY_STATUS: Map_ = {
  NOT_READY: ["آماده نیست", "neutral"],
  READY: ["آماده ارسال", "success"],
  SCHEDULED: ["برنامه‌ریزی شده", "info"],
  OUT_FOR_DELIVERY: ["در مسیر", "accent"],
  PARTIALLY_DELIVERED: ["تحویل بخشی", "warning"],
  DELIVERED: ["تحویل شده", "success"],
  FAILED: ["تحویل ناموفق", "danger"],
};
export const TASK_STATUS: Map_ = {
  PENDING: ["منتظر پیش‌نیاز", "neutral"],
  READY: ["آماده شروع", "info"],
  IN_PROGRESS: ["در حال انجام", "accent"],
  PAUSED: ["متوقف موقت", "warning"],
  BLOCKED: ["مسدود", "danger"],
  COMPLETED: ["انجام شد", "success"],
  SKIPPED: ["رد شد", "neutral"],
  CANCELLED: ["لغو", "neutral"],
};
export const REQUIREMENT_STATUS: Map_ = {
  PENDING: ["بررسی نشده", "neutral"],
  SHORTAGE: ["کمبود", "danger"],
  PARTIALLY_RESERVED: ["رزرو بخشی", "warning"],
  RESERVED: ["رزرو شده", "info"],
  PARTIALLY_ISSUED: ["حواله بخشی", "warning"],
  ISSUED: ["حواله شده", "accent"],
  COMPLETED: ["مصرف و تسویه", "success"],
  RELEASED: ["آزاد شده", "neutral"],
};
export const PAYMENT_RECORD_STATUS: Map_ = {
  PENDING: ["در حال پرداخت", "neutral"],
  AWAITING_APPROVAL: ["در انتظار تأیید", "warning"],
  CONFIRMED: ["تأیید شده", "success"],
  FAILED: ["ناموفق", "danger"],
  CANCELLED: ["انصراف", "neutral"],
  REJECTED: ["رد شده", "danger"],
};
export const PAYMENT_METHOD: Record<string, string> = {
  ONLINE: "درگاه اینترنتی",
  CASH: "نقدی",
  POS: "کارتخوان",
  BANK_TRANSFER: "کارت به کارت / حواله",
  CHEQUE: "چک",
  CREDIT: "اعتبار",
};
export const SHIPMENT_STATUS: Map_ = {
  PENDING: ["منتظر تخصیص", "warning"],
  ASSIGNED: ["تخصیص داده شد", "info"],
  OUT_FOR_DELIVERY: ["در مسیر", "accent"],
  DELIVERED: ["تحویل شد", "success"],
  FAILED: ["ناموفق", "danger"],
  RETURNED: ["برگشتی", "neutral"],
  CANCELLED: ["لغو", "neutral"],
};
export const PO_STATUS: Map_ = {
  DRAFT: ["پیش‌نویس", "neutral"],
  ORDERED: ["سفارش داده شد", "info"],
  PARTIALLY_RECEIVED: ["دریافت بخشی", "warning"],
  RECEIVED: ["دریافت کامل", "success"],
  CANCELLED: ["لغو", "neutral"],
};
export const MATERIAL_REQUEST_STATUS: Map_ = {
  OPEN: ["باز", "warning"],
  ORDERED: ["سفارش داده شد", "info"],
  FULFILLED: ["تأمین شد", "success"],
  CANCELLED: ["لغو", "neutral"],
};
export const MACHINE_STATUS: Map_ = {
  ACTIVE: ["فعال", "success"],
  MAINTENANCE: ["در تعمیر", "warning"],
  OUT_OF_SERVICE: ["خارج از سرویس", "danger"],
};
export const QUOTE_STATUS: Map_ = {
  DRAFT: ["پیش‌نویس", "neutral"],
  SENT: ["ارسال شده", "info"],
  ACCEPTED: ["پذیرفته شده", "success"],
  REJECTED: ["رد شده", "danger"],
  EXPIRED: ["منقضی", "neutral"],
  CANCELLED: ["لغو", "neutral"],
  CONVERTED: ["تبدیل به سفارش", "success"],
};
export const INQUIRY_STATUS: Map_ = {
  NEW: ["جدید", "warning"],
  IN_REVIEW: ["در حال بررسی", "info"],
  QUOTED: ["پیش‌فاکتور صادر شد", "success"],
  CLOSED: ["بسته", "neutral"],
  REJECTED: ["رد شده", "neutral"],
};
export const ARTWORK_STATUS: Map_ = {
  UPLOADED: ["بارگذاری شد", "info"],
  REJECTED: ["نیاز به اصلاح", "danger"],
  SENT_FOR_APPROVAL: ["منتظر تأیید مشتری", "warning"],
  CUSTOMER_APPROVED: ["تأیید مشتری", "success"],
  CUSTOMER_REJECTED: ["درخواست اصلاح", "danger"],
  APPROVED_FOR_PRINT: ["فایل نهایی چاپ", "success"],
  SUPERSEDED: ["جایگزین شد", "neutral"],
};
export const ARTWORK_STAGE: Record<string, string> = {
  CUSTOMER_ORIGINAL: "فایل مشتری",
  DESIGNER: "طرح طراح",
  PREPRESS: "پیش از چاپ",
  PROOF: "نمونه تأیید",
  PRINT_READY: "آماده چاپ",
};
export const PRIORITY: Map_ = {
  URGENT: ["فوری", "danger"],
  HIGH: ["بالا", "warning"],
  NORMAL: ["عادی", "neutral"],
  LOW: ["پایین", "neutral"],
};
export const URGENCY: Record<string, string> = { STANDARD: "عادی", EXPRESS: "فوری", RUSH: "خیلی فوری" };
export const METHOD: Record<string, string> = { OFFSET: "افست", DIGITAL: "دیجیتال" };
export const ISSUE_TYPE: Record<string, string> = {
  MACHINE_BREAKDOWN: "خرابی ماشین",
  MATERIAL_SHORTAGE: "کمبود مواد",
  FILE_PROBLEM: "مشکل فایل",
  QUALITY_PROBLEM: "مشکل کیفیت",
  WAITING_FOR_INFO: "منتظر اطلاعات",
  OTHER: "سایر",
};
export const UNIT: Record<string, string> = { SHEET: "برگ", KG: "کیلوگرم", ROLL: "رول", METER: "متر", SQM: "مترمربع", PIECE: "عدد", LITER: "لیتر", PACK: "بسته" };
export const INV_TX: Map_ = {
  RECEIVE: ["دریافت", "success"],
  RESERVE: ["رزرو", "info"],
  RELEASE: ["آزادسازی", "neutral"],
  ISSUE: ["حواله", "accent"],
  CONSUME: ["مصرف", "neutral"],
  RETURN: ["برگشت", "info"],
  ADJUST: ["اصلاح", "warning"],
  WASTE: ["ضایعات", "danger"],
};

export function label(map: Map_, key: string | null | undefined): string {
  return (key && map[key]?.[0]) || key || "—";
}
export function tone(map: Map_, key: string | null | undefined): Tone {
  return (key && map[key]?.[1]) || "neutral";
}

const DOMAIN_MAP: Record<string, Map_> = {
  ORDER: ORDER_STATUS,
  PAYMENT: PAYMENT_STATUS,
  FILE: FILE_STATUS,
  PROCUREMENT: PROCUREMENT_STATUS,
  PRODUCTION: PRODUCTION_STATUS,
  QC: QC_STATUS,
  DELIVERY: DELIVERY_STATUS,
};
/** "در صف ← در حال تولید" for an order-event state change. */
export function stateChange(domain: string, from: string | null, to: string | null): string {
  const m = DOMAIN_MAP[domain];
  if (!m) return `${from ?? ""} ← ${to ?? ""}`;
  return `${label(m, from)} ← ${label(m, to)}`;
}
