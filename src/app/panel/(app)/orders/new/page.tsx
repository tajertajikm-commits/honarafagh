import type { Metadata } from "next";
import { CustomOrderForm } from "@/components/orders/custom-order-form";
import { PageHeader } from "@/components/panel/page";
import { requireStaffPage } from "@/server/http/session";

export const metadata: Metadata = { title: "ثبت سفارش برای مشتری" };

/** Phone or walk-in orders: the same request a customer would make, entered by staff. */
export default async function NewOrderPage() {
  await requireStaffPage({ permission: "order.create" });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ثبت سفارش برای مشتری" description="سفارش تلفنی یا حضوری؛ مثل سفارش آنلاین وارد صف تأیید می‌شود." crumbs={[{ href: "/panel/orders", label: "سفارش‌ها" }]} />
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <CustomOrderForm mode="staff" />
      </div>
    </div>
  );
}
