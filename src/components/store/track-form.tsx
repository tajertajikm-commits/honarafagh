"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { DateText } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import type { CustomerStatus } from "@/lib/order-status";
import { toEnDigits } from "@/lib/persian";
import { StatusStepper } from "./timeline";

interface Result { code: string; title: string; createdAt: string; status: CustomerStatus; events: { message: string; createdAt: string }[]; businessPhone: string | null }

export function TrackForm() {
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <form
        className="mt-6 grid gap-3 rounded-2xl border border-line bg-surface p-5 shadow-soft sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            setResult(await api<Result>(`track?code=${encodeURIComponent(code.trim())}&phone=${encodeURIComponent(toEnDigits(phone))}`));
          } catch (err) {
            setResult(null);
            setError(err instanceof ApiError ? err.message : "خطا");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Field label="کد سفارش"><Input ltr value={code} onChange={(e) => setCode(toEnDigits(e.target.value).toUpperCase())} placeholder="D-1042-0003" /></Field>
        <Field label="موبایل"><Input ltr inputMode="tel" value={phone} onChange={(e) => setPhone(toEnDigits(e.target.value))} placeholder="0912…" /></Field>
        <Button type="submit" loading={loading}>پیگیری</Button>
      </form>
      {error && <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-danger">{error}</p>}
      {result && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[18px] font-bold" dir="ltr">{result.code}</p>
              <p className="text-[13px] text-muted">{result.title} • <DateText value={result.createdAt} /></p>
            </div>
            <Badge tone={result.status.tone}>{result.status.label}</Badge>
          </div>
          {result.status.index >= 0 && <StatusStepper index={result.status.index} className="mt-6" />}
          {result.status.action && <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-[13.5px]">{result.status.action}</p>}
          {result.status.stage === "READY" && result.businessPhone && (
            <a href={`tel:${result.businessPhone.replace(/[^\d+]/g, "")}`} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-[14px] font-bold text-surface">
              <Phone className="size-4" /> سفارش آماده است — تماس با چاپخانه <bdi dir="ltr">{result.businessPhone}</bdi>
            </a>
          )}
          {result.events.length > 0 && (
            <ul className="mt-6 space-y-2 border-t border-line pt-4 text-[13px]">
              {result.events.slice(-6).reverse().map((ev, i) => (
                <li key={i} className="flex justify-between gap-3"><span>{ev.message}</span><DateText value={ev.createdAt} withTime className="shrink-0 text-muted" /></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
