import { PERMISSIONS, WORKSPACES } from "@/server/auth/permissions";

const GROUP_TITLES: Record<string, string> = {
  order: "سفارش",
  quote: "فروش و پیش‌فاکتور",
  customer: "مشتریان",
  file: "فایل و طراحی",
  production: "تولید",
  qc: "کنترل کیفیت",
  machine: "ماشین‌آلات",
  inventory: "انبار",
  procurement: "تأمین",
  payment: "مالی",
  delivery: "ارسال",
  catalog: "محصولات",
  pricing: "قیمت‌گذاری",
  workflow: "گردش‌کار",
  employee: "کارکنان",
  role: "کارکنان",
  report: "گزارش و ممیزی",
  audit: "گزارش و ممیزی",
  settings: "تنظیمات",
};

export function permissionGroups() {
  const groups = new Map<string, { code: string; label: string }[]>();
  for (const [code, label] of Object.entries(PERMISSIONS)) {
    const title = GROUP_TITLES[code.split(".")[0]!] ?? "سایر";
    groups.set(title, [...(groups.get(title) ?? []), { code, label }]);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

export const workspaceOptions = () => Object.entries(WORKSPACES).map(([code, w]) => ({ code, label: w.label }));
