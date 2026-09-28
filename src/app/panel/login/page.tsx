import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { StaffLogin } from "@/components/panel/staff-login";
import { env } from "@/server/config/env";
import { getStaffActor } from "@/server/http/session";
import { DEMO_STAFF_PASSWORD, EMPLOYEES } from "@/server/seed/reference";

export const metadata: Metadata = { title: "ورود کارکنان" };

export default async function StaffLoginPage() {
  if (await getStaffActor()) redirect("/panel");
  const demo = env().DEMO_MODE;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-16">
        <Logo height={64} priority />
        <h1 className="mt-10 text-[26px] font-bold">ورود به سامانه عملیات</h1>
        <p className="mt-2 text-[14px] text-muted">با شماره موبایل و رمز عبور سازمانی وارد شوید.</p>
        <StaffLogin />
        {demo && (
          <div className="mt-8 max-w-sm rounded-2xl border border-dashed border-line-strong bg-surface p-4">
            <p className="text-[13px] font-bold">حساب‌های نمایشی</p>
            <p className="mt-1 text-[12px] text-muted">رمز همه: <bdi dir="ltr" className="font-bold text-ink">{DEMO_STAFF_PASSWORD}</bdi></p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
              {EMPLOYEES.map((e) => (
                <li key={e.code} className="flex justify-between gap-2">
                  <span className="truncate text-ink-2">{e.title}</span>
                  <bdi dir="ltr" className="tabular text-muted" data-demo-phone={e.phone}>{e.phone}</bdi>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute inset-x-16 bottom-16">
          <div className="brand-spectrum-rtl h-1.5 w-40 rounded-full" />
          <p className="mt-6 text-[28px] font-bold leading-[1.6] text-white">از سفارش تا تحویل،<br />هر مرحله در یک نگاه.</p>
          <p className="mt-3 max-w-md text-[14px] leading-7 text-white/60">مرکز کنترل تولید، انبار، مالی و ارسال چاپخانه هنر آفاق — هر همکار، فضای کار خودش.</p>
        </div>
      </div>
    </div>
  );
}
