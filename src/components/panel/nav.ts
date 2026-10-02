import type { Permission } from "@/server/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Shown when the employee holds any of these (empty = everyone). */
  anyOf?: Permission[];
}

/**
 * Short, role-driven navigation: everyone starts at «کارهای من»; each item
 * appears only for the people who use it.
 */
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "امروز",
    items: [
      { href: "/panel/work", label: "کارهای من", icon: "inbox" },
      { href: "/panel/dashboard", label: "داشبورد مدیریت", icon: "gauge", anyOf: ["dashboard.view"] },
    ],
  },
  {
    title: "تولید",
    items: [
      { href: "/panel/queues/digital", label: "صف دیجیتال", icon: "printer", anyOf: ["digital.queue", "dashboard.view"] },
      { href: "/panel/queues/offset", label: "صف افست", icon: "factory", anyOf: ["offset.queue", "dashboard.view"] },
      { href: "/panel/orders", label: "سفارش‌ها", icon: "receipt", anyOf: ["order.view", "order.approve.digital", "order.approve.offset", "digital.queue", "offset.queue", "payment.view"] },
    ],
  },
  {
    title: "مالی",
    items: [
      { href: "/panel/accounting", label: "حسابداری و فاکتور", icon: "wallet", anyOf: ["payment.view", "invoice.manage"] },
      { href: "/panel/customers", label: "مشتریان", icon: "users", anyOf: ["customer.view"] },
    ],
  },
  {
    title: "مدیریت",
    items: [
      { href: "/panel/inventory", label: "مواد و انبار", icon: "package", anyOf: ["inventory.manage"] },
      { href: "/panel/suppliers", label: "تأمین‌کنندگان", icon: "truck", anyOf: ["offset.paper", "offset.litho", "inventory.manage"] },
      { href: "/panel/catalog", label: "محصولات فروشگاه", icon: "layers", anyOf: ["catalog.manage"] },
      { href: "/panel/pricing", label: "قیمت‌گذاری فروشگاه", icon: "calculator", anyOf: ["catalog.manage"] },
      { href: "/panel/employees", label: "کارکنان و نقش‌ها", icon: "shield", anyOf: ["employee.manage"] },
      { href: "/panel/settings", label: "تنظیمات", icon: "settings", anyOf: ["settings.manage"] },
      { href: "/panel/audit", label: "گزارش ممیزی", icon: "history", anyOf: ["audit.view"] },
    ],
  },
];

export function visibleNav(actor: { permissions: ReadonlySet<string> }) {
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.anyOf || i.anyOf.some((p) => actor.permissions.has(p))) })).filter((s) => s.items.length > 0);
}

/** Where an employee lands: the manager on the control center, everyone else on their work. */
export function homeFor(actor: { permissions: ReadonlySet<string> }) {
  return actor.permissions.has("dashboard.view") ? "/panel/dashboard" : "/panel/work";
}
