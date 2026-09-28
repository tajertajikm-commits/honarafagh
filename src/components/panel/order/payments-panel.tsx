"use client";

import { Check, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DateText, Money } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { PAYMENT_METHOD, PAYMENT_RECORD_STATUS } from "@/lib/labels";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "../actions";

export interface PaymentView { id: string; number: number; kind: string; method: string; status: string; amount: number; reference: string | null; note: string | null; receiptFileId: string | null; createdAt: string; rejectionReason: string | null }

export function PaymentsPanel({ orderId, payments, balance, paid, perms }: { orderId: string; payments: PaymentView[]; balance: number; paid: number; perms: string[] }) {
  const can = (p: string) => perms.includes(p);
  const { run, pending } = useApiAction();
  const [mode, setMode] = useState<null | "pay" | "refund" | { reject: string }>(null);
  const [form, setForm] = useState({ method: "POS", amount: "", reference: "", note: "" });
  const key = useRef(newIdempotencyKey());
  const open = (m: "pay" | "refund") => { key.current = newIdempotencyKey(); setForm({ method: m === "pay" ? "POS" : "BANK_TRANSFER", amount: String(Math.round((m === "pay" ? balance : paid) / 10)), reference: "", note: "" }); setMode(m); };
  const amountRial = Number(toEnDigits(form.amount) || 0) * 10;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {can("payment.create") && balance > 0 && <Button size="sm" onClick={() => open("pay")}>ثبت دریافت</Button>}
        {can("payment.refund") && paid > 0 && <Button size="sm" variant="secondary" onClick={() => open("refund")}>بازپرداخت</Button>}
      </div>
      {payments.length === 0 ? <p className="text-[13px] text-muted">پرداختی ثبت نشده است.</p> : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5 text-[12.5px]">
              <span className="font-bold">{p.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[p.method]}</span>
              <Money rial={p.amount} strong />
              <span className="text-muted"><DateText value={p.createdAt} withTime /></span>
              {p.reference && <span className="text-muted">مرجع: <bdi dir="ltr">{p.reference}</bdi></span>}
              {p.receiptFileId && <a className="font-bold text-accent-ink" href={`/api/v1/files/${p.receiptFileId}?inline=1`} target="_blank" rel="noreferrer">رسید</a>}
              <span className="ms-auto flex items-center gap-1.5">
                <Status map={PAYMENT_RECORD_STATUS} value={p.status} />
                {p.status === "AWAITING_APPROVAL" && can("payment.approve") && (
                  <>
                    <Button size="icon-sm" variant="ghost" aria-label="تأیید" loading={pending} onClick={() => run(() => api(`payments/${p.id}/approve`, { method: "POST" }), "پرداخت تأیید شد.")}><Check className="text-success" /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label="رد" onClick={() => setMode({ reject: p.id })}><X className="text-danger" /></Button>
                  </>
                )}
              </span>
              {p.rejectionReason && <span className="w-full text-danger">{p.rejectionReason}</span>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        {(mode === "pay" || mode === "refund") && (
          <DialogContent
            title={mode === "pay" ? "ثبت دریافت وجه" : "ثبت بازپرداخت"}
            description={mode === "pay" ? "پرداخت‌های نقدی و کارتخوان با مجوز تأیید مستقیماً ثبت می‌شوند؛ چک تا وصول در انتظار می‌ماند." : "وجه از طریق حواله بانکی به مشتری بازگردانده می‌شود."}
            footer={<Button loading={pending} disabled={amountRial <= 0 || (mode === "refund" && form.note.trim().length < 2)} onClick={async () => {
              const ok = mode === "pay"
                ? await run(() => api(`orders/${orderId}/payments`, { body: { method: form.method, amount: amountRial, reference: form.reference || null, note: form.note || null, idempotencyKey: key.current } }), "پرداخت ثبت شد.")
                : await run(() => api(`orders/${orderId}/refunds`, { body: { method: form.method, amount: amountRial, reference: form.reference || null, reason: form.note, idempotencyKey: key.current } }), "بازپرداخت ثبت شد.");
              if (ok) setMode(null);
            }}>ثبت</Button>}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="روش"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{(mode === "pay" ? ["POS", "CASH", "BANK_TRANSFER", "CHEQUE", "CREDIT"] : ["BANK_TRANSFER", "CASH", "POS", "CHEQUE"]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}</Select></Field>
              <Field label="مبلغ (تومان)"><Input ltr inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: toEnDigits(e.target.value).replace(/\D/g, "") })} /></Field>
              <Field label="شماره مرجع / پیگیری" className="sm:col-span-2"><Input ltr value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
              <Field label={mode === "pay" ? "یادداشت" : "دلیل بازپرداخت"} className="sm:col-span-2"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            </div>
          </DialogContent>
        )}
        {mode && typeof mode === "object" && (
          <DialogContent title="رد پرداخت" footer={<Button variant="danger" loading={pending} disabled={form.note.trim().length < 2} onClick={async () => { if (await run(() => api(`payments/${mode.reject}/reject`, { body: { reason: form.note } }), "پرداخت رد شد.")) setMode(null); }}>رد پرداخت</Button>}>
            <Field label="دلیل"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
