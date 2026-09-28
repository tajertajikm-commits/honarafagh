import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "نتیجه پرداخت", robots: { index: false } };

export default async function PaymentResult({ searchParams }: { searchParams: Promise<{ status?: string; order?: string }> }) {
  const { status, order } = await searchParams;
  const ok = status === "success";
  const orderId = order && /^[0-9a-f-]{36}$/i.test(order) ? order : null;
  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
        {ok ? <CheckCircle2 className="mx-auto size-14 text-success" /> : <XCircle className="mx-auto size-14 text-danger" />}
        <h1 className="mt-4 text-[22px] font-bold">{ok ? "پرداخت با موفقیت انجام شد" : status === "cancelled" ? "پرداخت لغو شد" : "پرداخت ناموفق بود"}</h1>
        <p className="mt-2 text-[14px] leading-7 text-muted">
          {ok ? "سفارش شما ثبت شد و روند تولید آغاز می‌شود. وضعیت را می‌توانید از حساب کاربری دنبال کنید." : "مبلغی از حساب شما کسر نشده است؛ در صورت کسر، ظرف ۷۲ ساعت توسط بانک بازگردانده می‌شود. می‌توانید دوباره پرداخت کنید."}
        </p>
        <div className="mt-8 grid gap-2">
          {orderId && <Button asChild size="lg"><Link href={`/account/orders/${orderId}`}>مشاهده سفارش</Link></Button>}
          <Button asChild variant="secondary" size="lg"><Link href="/">بازگشت به فروشگاه</Link></Button>
        </div>
      </div>
    </div>
  );
}
