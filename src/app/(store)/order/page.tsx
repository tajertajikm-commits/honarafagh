import type { Metadata } from "next";
import { CustomOrderForm } from "@/components/orders/custom-order-form";
import { requireCustomerPage } from "@/server/http/session";

export const metadata: Metadata = { title: "سفارش اختصاصی" };

export default async function CustomOrderPage() {
  await requireCustomerPage("/order");
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <p className="text-[13px] font-bold text-accent-ink">سفارش اختصاصی</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight">کار چاپی خودتان را ثبت کنید</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-7 text-muted">مشخصات را بنویسید و فایل را بفرستید. کارشناس ما سفارش را بررسی و تأیید می‌کند و مبلغ را اعلام می‌کند؛ وضعیت را همیشه از حساب کاربری می‌بینید.</p>
      <div className="mt-8 rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8">
        <CustomOrderForm mode="customer" />
      </div>
    </div>
  );
}
