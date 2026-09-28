import type { Metadata } from "next";
import { TrackForm } from "@/components/store/track-form";

export const metadata: Metadata = { title: "پیگیری سفارش" };

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-12">
      <h1 className="text-[28px] font-bold">پیگیری سفارش</h1>
      <p className="mt-2 text-[14px] leading-7 text-muted">شماره سفارش و موبایل ثبت‌شده را وارد کنید تا وضعیت سفارش را ببینید؛ نیازی به ورود نیست.</p>
      <TrackForm />
    </div>
  );
}
