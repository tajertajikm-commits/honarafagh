"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { DateText } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { api, ApiError } from "@/lib/api-client";
import { ORDER_STATUS } from "@/lib/labels";
import { formatNumber, toEnDigits, toFaDigits } from "@/lib/persian";
import { OrderTimeline, type TimelineStepView } from "./timeline";

interface Result { number: number; status: string; placedAt: string; dueDate: string | null; items: { title: string; quantity: number; unitLabel: string }[]; timeline: TimelineStepView[] }

export function TrackForm() {
  const [number, setNumber] = useState("");
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
            setResult(await api<Result>(`track?number=${encodeURIComponent(toEnDigits(number))}&phone=${encodeURIComponent(toEnDigits(phone))}`));
          } catch (err) {
            setResult(null);
            setError(err instanceof ApiError ? err.message : "خطا");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Field label="شماره سفارش"><Input ltr inputMode="numeric" value={number} onChange={(e) => setNumber(toEnDigits(e.target.value))} placeholder="100012" /></Field>
        <Field label="موبایل"><Input ltr inputMode="tel" value={phone} onChange={(e) => setPhone(toEnDigits(e.target.value))} placeholder="0912…" /></Field>
        <Button type="submit" loading={loading}>پیگیری</Button>
      </form>
      {error && <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-danger">{error}</p>}
      {result && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[18px] font-bold">سفارش #{toFaDigits(result.number)}</p>
              <p className="text-[13px] text-muted">{result.items.map((i) => `${i.title} (${formatNumber(i.quantity)} ${i.unitLabel})`).join("، ")}</p>
              {result.dueDate && <p className="text-[13px] text-muted">تحویل تقریبی: <DateText value={result.dueDate} /></p>}
            </div>
            <Status map={ORDER_STATUS} value={result.status} />
          </div>
          <OrderTimeline steps={result.timeline} className="mt-6" />
        </div>
      )}
    </>
  );
}
