/**
 * Permission catalog. Every action is checked in the service layer; roles
 * (stored in the database) are named sets of these codes, and the panel's
 * navigation is derived from them. Grouped so the role editor reads well.
 */
export const PERMISSION_GROUPS = {
  orders: {
    title: "سفارش‌ها",
    items: {
      "order.view": "مشاهده همه سفارش‌ها",
      "order.create": "ثبت سفارش برای مشتری",
      "order.approve.digital": "تأیید سفارش دیجیتال و انتخاب ایستگاه‌ها",
      "order.approve.offset": "تأیید سفارش افست و انتخاب مراحل",
      "order.price": "قیمت‌گذاری و تخفیف سفارش سفارشی",
      "order.priority": "تغییر اولویت صف",
      "order.cancel": "لغو سفارش",
    },
  },
  artwork: {
    title: "فایل و طراحی",
    items: {
      "artwork.review": "بررسی و تأیید فایل چاپی",
      "design.work": "انجام طراحی سفارش‌ها",
    },
  },
  digital: {
    title: "تولید دیجیتال",
    items: {
      "digital.queue": "مشاهده صف ایستگاه‌های دیجیتال",
      "digital.production": "اجرای ایستگاه‌های دیجیتال (شیت، کاغذ، چاپ، برش، سلفون، صحافی)",
      "digital.quality": "تأیید کیفیت نهایی دیجیتال",
      "digital.dispatch": "بسته‌بندی و ارسال دیجیتال",
    },
  },
  offset: {
    title: "تولید افست",
    items: {
      "offset.queue": "مشاهده صف ایستگاه‌های افست",
      "offset.litho": "ثبت و پیگیری لیتوگرافی",
      "offset.paper": "استعلام قیمت کاغذ از تأمین‌کنندگان",
      "offset.paper.approve": "انتخاب تأمین‌کننده کاغذ",
      "offset.press.assign": "تعیین ماشین چاپ",
      "offset.print": "اجرای چاپ افست",
      "offset.quality": "تأیید کیفیت چاپ و کیفیت نهایی افست",
      "offset.postpress": "اجرای برش، سلفون و صحافی افست",
      "offset.packaging": "بسته‌بندی افست",
      "offset.shipping": "ارسال افست",
    },
  },
  finance: {
    title: "مالی و مشتریان",
    items: {
      "customer.view": "مشاهده مشتریان",
      "customer.manage": "ویرایش اطلاعات مشتریان",
      "payment.view": "مشاهده پرداخت‌ها",
      "payment.record": "ثبت و تأیید پرداخت",
      "invoice.manage": "صدور و ابطال فاکتور",
    },
  },
  admin: {
    title: "مدیریت",
    items: {
      "dashboard.view": "داشبورد مدیریت",
      "inventory.manage": "مدیریت مواد و موجودی",
      "catalog.manage": "مدیریت محصولات فروشگاه و قیمت‌ها",
      "employee.manage": "مدیریت کارکنان و نقش‌ها",
      "audit.view": "مشاهده گزارش ممیزی",
      "settings.manage": "تنظیمات و اطلاعات فروشنده",
    },
  },
} as const;

type Groups = typeof PERMISSION_GROUPS;
export type Permission = { [G in keyof Groups]: keyof Groups[G]["items"] }[keyof Groups];

export const PERMISSIONS = Object.fromEntries(Object.values(PERMISSION_GROUPS).flatMap((g) => Object.entries(g.items))) as Record<Permission, string>;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}
