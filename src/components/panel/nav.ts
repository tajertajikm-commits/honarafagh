import type { Permission, Workspace } from "@/server/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  workspace?: Workspace;
  anyOf?: Permission[];
}

/** Role workspaces first (each built around a job), then shared modules, then administration. */
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "فضای کار",
    items: [
      { href: "/panel/control", label: "مرکز کنترل", icon: "gauge", workspace: "control" },
      { href: "/panel/station", label: "کارهای من", icon: "play", workspace: "station" },
      { href: "/panel/studio", label: "طراحی و پیش از چاپ", icon: "palette", workspace: "studio" },
      { href: "/panel/qc", label: "کنترل کیفیت", icon: "badge-check", workspace: "qc" },
      { href: "/panel/sales", label: "فروش", icon: "tag", workspace: "sales" },
      { href: "/panel/accounting", label: "مالی", icon: "wallet", workspace: "accounting" },
      { href: "/panel/warehouse", label: "انبار", icon: "warehouse", workspace: "warehouse" },
      { href: "/panel/procurement", label: "تأمین و خرید", icon: "boxes", workspace: "procurement" },
      { href: "/panel/shipping", label: "ارسال", icon: "truck", workspace: "shipping" },
    ],
  },
  {
    title: "عملیات",
    items: [
      { href: "/panel/orders", label: "سفارش‌ها", icon: "receipt", anyOf: ["order.view"] },
      { href: "/panel/production", label: "تولید", icon: "factory", anyOf: ["production.view"] },
      { href: "/panel/machines", label: "ماشین‌آلات", icon: "cog", anyOf: ["machine.view", "machine.manage", "production.view"] },
      { href: "/panel/inventory", label: "موجودی", icon: "package", anyOf: ["inventory.view"] },
      { href: "/panel/customers", label: "مشتریان", icon: "users", anyOf: ["customer.view"] },
    ],
  },
  {
    title: "مدیریت",
    items: [
      { href: "/panel/reports", label: "گزارش‌ها", icon: "chart", anyOf: ["report.view"] },
      { href: "/panel/catalog", label: "محصولات", icon: "layers", anyOf: ["catalog.manage"] },
      { href: "/panel/pricing", label: "قیمت‌گذاری", icon: "calculator", anyOf: ["pricing.view"] },
      { href: "/panel/workflows", label: "گردش‌کار تولید", icon: "workflow", anyOf: ["workflow.edit"] },
      { href: "/panel/employees", label: "کارکنان و نقش‌ها", icon: "shield", anyOf: ["employee.view", "role.manage"] },
      { href: "/panel/audit", label: "گزارش ممیزی", icon: "history", anyOf: ["audit.view"] },
      { href: "/panel/settings", label: "تنظیمات", icon: "settings", anyOf: ["settings.manage"] },
    ],
  },
];

export function visibleNav(actor: { workspaces: readonly string[]; permissions: ReadonlySet<string> }) {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => (i.workspace ? actor.workspaces.includes(i.workspace) : true) && (!i.anyOf || i.anyOf.some((p) => actor.permissions.has(p)))),
  })).filter((s) => s.items.length > 0);
}
