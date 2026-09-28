import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Money } from "@/components/ui/misc";
import { env } from "@/server/config/env";

export const metadata: Metadata = { title: "درگاه آزمایشی", robots: { index: false } };

/** Demo gateway. Only reachable when PAYMENT_PROVIDER=fake. No money moves. */
export default async function SandboxGateway({ searchParams }: { searchParams: Promise<{ authority?: string; amount?: string; callback?: string }> }) {
  if (env().PAYMENT_PROVIDER !== "fake") notFound();
  const { authority, amount, callback } = await searchParams;
  if (!authority || !callback) notFound();
  const cb = new URL(callback);
  if (cb.origin !== new URL(env().APP_URL).origin) notFound();
  const target = (status: "OK" | "NOK") => {
    const u = new URL(cb);
    u.searchParams.set("Authority", authority);
    u.searchParams.set("Status", status);
    return u.toString();
  };
  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning"><FlaskConical className="size-6" /></div>
        <h1 className="mt-4 text-[20px] font-bold">درگاه پرداخت آزمایشی</h1>
        <p className="mt-2 text-[13.5px] leading-7 text-muted">این صفحه جایگزین بانک در حالت نمایشی است و هیچ پولی جابه‌جا نمی‌شود. برای اتصال واقعی، درگاه زرین‌پال را در تنظیمات محیطی فعال کنید.</p>
        <p className="mt-6 text-[13px] text-muted">مبلغ</p>
        <Money rial={Number(amount ?? 0)} className="text-[28px] font-bold" />
        <div className="mt-8 grid gap-2">
          <a href={target("OK")} className="inline-flex h-12 items-center justify-center rounded-lg bg-success text-[15px] font-bold text-white hover:brightness-110">پرداخت موفق</a>
          <a href={target("NOK")} className="inline-flex h-12 items-center justify-center rounded-lg border border-line-strong text-[15px] font-bold hover:bg-surface-2">انصراف از پرداخت</a>
        </div>
      </div>
    </div>
  );
}
