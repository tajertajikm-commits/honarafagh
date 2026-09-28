"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { formatPhone, normalizePhone, toEnDigits, toFaDigits } from "@/lib/persian";

export function OtpLogin({ next, demo }: { next: string; demo: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const p = normalizePhone(phone);
    if (!p) return setError("شماره موبایل را درست وارد کنید (مثلاً ۰۹۱۲۱۲۳۴۵۶۷).");
    setLoading(true);
    try {
      const r = await api<{ phone: string; expiresIn: number; devCode?: string }>("auth/otp/request", { body: { phone: p } });
      setPhone(r.phone);
      setDevCode(r.devCode ?? null);
      setStep("code");
      setLeft(60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ارسال کد");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ isNew: boolean }>("auth/otp/verify", { body: { phone, code: toEnDigits(code) } });
      router.replace(r.isNew ? `/account?welcome=1&next=${encodeURIComponent(next)}` : next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "کد نادرست است.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-surface p-8 shadow-card">
      <h1 className="text-[24px] font-bold">ورود یا ثبت‌نام</h1>
      {step === "phone" ? (
        <form onSubmit={request} className="mt-6 space-y-5">
          <p className="text-[14px] leading-7 text-muted">شماره موبایل خود را وارد کنید تا کد تأیید برایتان پیامک شود.</p>
          <Field label="شماره موبایل" error={error} htmlFor="phone">
            <Input id="phone" ltr inputMode="tel" autoComplete="tel" placeholder="09121234567" value={phone} onChange={(e) => setPhone(toEnDigits(e.target.value))} autoFocus className="h-12 text-[17px] tracking-wide" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>دریافت کد تأیید</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 space-y-5">
          <p className="text-[14px] leading-7 text-muted">
            کد ۵ رقمی ارسال‌شده به <bdi dir="ltr" className="font-bold text-ink tabular">{formatPhone(phone)}</bdi> را وارد کنید.{" "}
            <button type="button" className="font-bold text-accent-ink" onClick={() => { setStep("phone"); setCode(""); }}>ویرایش شماره</button>
          </p>
          {demo && devCode && (
            <div className="rounded-xl border border-dashed border-accent/40 bg-accent-soft px-4 py-3 text-[13px] text-accent-ink">
              حالت نمایشی — کد تأیید: <b className="tabular text-[16px]" dir="ltr">{devCode}</b>
            </div>
          )}
          <Field label="کد تأیید" error={error} htmlFor="code">
            <Input ref={codeRef} id="code" ltr inputMode="numeric" autoComplete="one-time-code" maxLength={5} value={code} onChange={(e) => { const v = toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 5); setCode(v); if (v.length === 5) setTimeout(() => (e.target.form as HTMLFormElement | null)?.requestSubmit(), 0); }} className="h-14 text-center text-[24px] font-bold tracking-[0.6em]" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={code.length < 5}>ورود</Button>
          <p className="text-center text-[13px] text-muted">
            {left > 0 ? <>ارسال مجدد تا {toFaDigits(left)} ثانیه دیگر</> : <button type="button" className="font-bold text-accent-ink" onClick={() => request()}>ارسال مجدد کد</button>}
          </p>
        </form>
      )}
    </div>
  );
}
