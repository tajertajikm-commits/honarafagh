"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

const DAYS = [
  { n: 6, label: "شنبه" }, { n: 0, label: "یکشنبه" }, { n: 1, label: "دوشنبه" }, { n: 2, label: "سه‌شنبه" }, { n: 3, label: "چهارشنبه" }, { n: 4, label: "پنجشنبه" }, { n: 5, label: "جمعه" },
];

export interface BusinessSettings { name: string; phone: string; address: string; workdays: number[]; thursdayHalf: boolean; workStart: string; workEnd: string }
export interface OrderSettings { defaultDepositPct: number; quoteValidityDays: number; autoConfirmPaidWebOrders: boolean; requireSettlementBeforeDelivery: boolean }

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
      <span className="text-[13.5px]"><b>{label}</b>{hint && <span className="block text-[12px] leading-6 text-muted">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="mt-1 size-4 shrink-0 accent-[var(--color-ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function BusinessSettingsForm({ value, disabled }: { value: BusinessSettings; disabled?: boolean }) {
  const { run, pending } = useApiAction();
  const [f, setF] = useState(value);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="نام کسب‌وکار"><Input value={f.name} disabled={disabled} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="تلفن"><Input ltr value={f.phone} disabled={disabled} onChange={(e) => setF({ ...f, phone: toEnDigits(e.target.value) })} /></Field>
      <Field label="نشانی" className="sm:col-span-2"><Textarea className="min-h-[60px]" value={f.address} disabled={disabled} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <div className="sm:col-span-2">
        <p className="mb-2 text-[13px] font-bold text-ink-2">روزهای کاری</p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = f.workdays.includes(d.n);
            return <button key={d.n} type="button" disabled={disabled} aria-pressed={on} onClick={() => setF({ ...f, workdays: on ? f.workdays.filter((x) => x !== d.n) : [...f.workdays, d.n] })} className={cn("h-8 rounded-lg border px-3 text-[13px] font-bold", on ? "border-ink bg-ink text-surface" : "border-line-strong text-ink-2 hover:bg-surface-2")}>{d.label}</button>;
          })}
        </div>
      </div>
      <Field label="شروع ساعت کاری"><Input ltr type="time" value={f.workStart} disabled={disabled} onChange={(e) => setF({ ...f, workStart: e.target.value })} /></Field>
      <Field label="پایان ساعت کاری"><Input ltr type="time" value={f.workEnd} disabled={disabled} onChange={(e) => setF({ ...f, workEnd: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Toggle label="پنجشنبه نیمه‌وقت" hint="در برنامه‌ریزی ظرفیت، پنجشنبه تا ظهر در نظر گرفته می‌شود." checked={f.thursdayHalf} onChange={(v) => setF({ ...f, thursdayHalf: v })} /></div>
      {!disabled && <div><Button loading={pending} disabled={f.name.trim().length < 1 || f.workdays.length === 0} onClick={() => run(() => api("settings/business", { method: "PUT", body: f }), "تنظیمات ذخیره شد. برنامه‌ریزی تولید با تقویم جدید محاسبه می‌شود.")}>ذخیره</Button></div>}
    </div>
  );
}

export function OrderSettingsForm({ value, disabled }: { value: OrderSettings; disabled?: boolean }) {
  const { run, pending } = useApiAction();
  const [f, setF] = useState(value);
  const n = (s: string) => Number(toEnDigits(s).replace(/\D/g, "") || 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="پیش‌پرداخت پیش‌فرض (٪)" hint="تولید سفارش‌های فروشگاه پس از این مقدار پرداخت آغاز می‌شود."><Input ltr inputMode="numeric" value={String(f.defaultDepositPct)} disabled={disabled} onChange={(e) => setF({ ...f, defaultDepositPct: Math.min(100, n(e.target.value)) })} /></Field>
      <Field label="اعتبار پیش‌فاکتور (روز)"><Input ltr inputMode="numeric" value={String(f.quoteValidityDays)} disabled={disabled} onChange={(e) => setF({ ...f, quoteValidityDays: Math.max(1, Math.min(90, n(e.target.value))) })} /></Field>
      <div className="space-y-2 sm:col-span-2">
        <Toggle label="تأیید خودکار سفارش‌های پرداخت‌شده فروشگاه" hint="سفارش آنلاین پس از دریافت پیش‌پرداخت بدون بررسی دستی وارد تولید می‌شود." checked={f.autoConfirmPaidWebOrders} onChange={(v) => setF({ ...f, autoConfirmPaidWebOrders: v })} />
        <Toggle label="تحویل فقط پس از تسویه" hint="ارسال یا تحویل حضوری سفارش دارای مانده ممکن نیست، مگر با مجوز مدیر یا پوشش سقف اعتبار مشتری." checked={f.requireSettlementBeforeDelivery} onChange={(v) => setF({ ...f, requireSettlementBeforeDelivery: v })} />
      </div>
      {!disabled && <div><Button loading={pending} onClick={() => run(() => api("settings/orders", { method: "PUT", body: f }), "تنظیمات ذخیره شد.")}>ذخیره</Button></div>}
    </div>
  );
}
