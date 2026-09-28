/**
 * Action-based permission catalog. Permissions are enforced in the service
 * layer (every interface — REST, server components, workers — goes through it).
 * Roles are stored in the database and map to a subset of these codes.
 */
export const PERMISSIONS = {
  "order.view": "مشاهده سفارش‌ها",
  "order.create": "ثبت سفارش دستی",
  "order.edit": "ویرایش سفارش",
  "order.cancel": "لغو سفارش",
  "order.price.override": "تغییر دستی قیمت و تخفیف",
  "order.state.force": "تغییر اجباری وضعیت سفارش",
  "order.priority.change": "تغییر اولویت سفارش",
  "quote.view": "مشاهده استعلام و پیش‌فاکتور",
  "quote.manage": "صدور و مدیریت پیش‌فاکتور",
  "customer.view": "مشاهده مشتریان",
  "customer.manage": "مدیریت مشتریان",
  "file.view": "مشاهده فایل‌های سفارش",
  "file.upload": "بارگذاری نسخه فایل",
  "file.review": "تأیید فایل برای چاپ",
  "production.view": "مشاهده تولید",
  "production.plan": "برنامه‌ریزی و آزادسازی تولید",
  "production.assign": "تخصیص کار به اپراتور و ماشین",
  "production.execute": "اجرای کارهای تولیدی",
  "production.override": "عبور اجباری، بازگشایی و لغو مرحله",
  "qc.perform": "انجام کنترل کیفیت",
  "machine.view": "مشاهده ماشین‌آلات",
  "machine.manage": "مدیریت ماشین‌آلات و تعمیرات",
  "inventory.view": "مشاهده موجودی",
  "inventory.receive": "دریافت کالا",
  "inventory.issue": "حواله و تحویل مواد",
  "inventory.reserve": "رزرو و آزادسازی مواد",
  "inventory.adjust": "اصلاح موجودی",
  "inventory.waste": "ثبت ضایعات انبار",
  "procurement.view": "مشاهده تأمین",
  "procurement.manage": "مدیریت خرید و تأمین‌کنندگان",
  "payment.view": "مشاهده پرداخت‌ها",
  "payment.create": "ثبت پرداخت",
  "payment.approve": "تأیید پرداخت",
  "payment.refund": "بازپرداخت",
  "delivery.view": "مشاهده ارسال",
  "delivery.manage": "مدیریت ارسال",
  "delivery.execute": "انجام تحویل",
  "catalog.manage": "مدیریت محصولات",
  "pricing.view": "مشاهده قوانین قیمت‌گذاری",
  "pricing.edit": "ویرایش قوانین قیمت‌گذاری",
  "pricing.publish": "انتشار نسخه قیمت‌گذاری",
  "workflow.edit": "ویرایش گردش‌کار تولید",
  "employee.view": "مشاهده کارکنان",
  "employee.manage": "مدیریت کارکنان",
  "role.manage": "مدیریت نقش‌ها و مجوزها",
  "report.view": "مشاهده گزارش‌ها",
  "audit.view": "مشاهده گزارش ممیزی",
  "settings.manage": "مدیریت تنظیمات",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/** UI workspaces. A role lists the workspaces its members see. */
export const WORKSPACES = {
  control: { label: "مرکز کنترل", href: "/panel/control" },
  sales: { label: "فروش", href: "/panel/sales" },
  accounting: { label: "مالی", href: "/panel/accounting" },
  procurement: { label: "تأمین", href: "/panel/procurement" },
  warehouse: { label: "انبار", href: "/panel/warehouse" },
  studio: { label: "طراحی و پیش از چاپ", href: "/panel/studio" },
  station: { label: "ایستگاه کار", href: "/panel/station" },
  qc: { label: "کنترل کیفیت", href: "/panel/qc" },
  shipping: { label: "ارسال", href: "/panel/shipping" },
} as const;
export type Workspace = keyof typeof WORKSPACES;
export const ALL_WORKSPACES = Object.keys(WORKSPACES) as Workspace[];
