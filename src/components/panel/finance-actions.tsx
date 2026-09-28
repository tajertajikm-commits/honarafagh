"use client";

import { Check, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatToman, toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

const PAY_METHODS = ["POS", "CASH", "BANK_TRANSFER", "CHEQUE", "CREDIT"] as const;
const REFUND_METHODS = ["BANK_TRANSFER", "CASH", "POS", "CHEQUE"] as const;

/**
 * Records a received payment (mode "pay") or a refund (mode "refund") against
 * an order. Amounts are typed in toman and sent as rial. Each dialog opening
 * gets a fresh idempotency key so a double-click cannot post twice.
 */
export function MoneyDialogButton({ orderId, mode, defaultAmount, maxAmount, label, size = "sm", variant }: { orderId: string; mode: "pay" | "refund"; defaultAmount: number; maxAmount?: number; label?: string } & Pick<ButtonProps, "size" | "variant">) {
  const { run, pending } = useApiAction();
  const key = useRef(newIdempotencyKey());
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ method: "POS", amount: "", reference: "", note: "", chequeDueDate: "" });
  const amountRial = Number(toEnDigits(f.amount) || 0) * 10;
  const over = maxAmount != null && amountRial > maxAmount;
  const needsNote = mode === "refund";
  const openIt = () => {
    key.current = newIdempotencyKey();
    setF({ method: mode === "pay" ? "POS" : "BANK_TRANSFER", amount: String(Math.round(defaultAmount / 10)), reference: "", note: "", chequeDueDate: "" });
    setOpen(true);
  };
  const submit = async () => {
    const ok =
      mode === "pay"
        ? await run(() => api(`orders/${orderId}/payments`, { body: { method: f.method, amount: amountRial, reference: f.reference || null, note: f.note || null, chequeDueDate: f.method === "CHEQUE" && f.chequeDueDate ? f.chequeDueDate : null, idempotencyKey: key.current } }), "پرداخت ثبت شد.")
        : await run(() => api(`orders/${orderId}/refunds`, { body: { method: f.method, amount: amountRial, reference: f.reference || null, reason: f.note, idempotencyKey: key.current } }), "بازپرداخت ثبت شد.");
    if (ok) setOpen(false);
  };
  return (
    <>
      <Button size={size} variant={variant ?? (mode === "pay" ? "primary" : "secondary")} onClick={openIt}>{label ?? (mode === "pay" ? "ثبت دریافت" : "بازپرداخت")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={mode === "pay" ? "ثبت دریافت وجه" : "ثبت بازپرداخت"}
          description={mode === "pay" ? "دریافت نقدی و کارتخوان با مجوز تأیید مستقیماً قطعی می‌شود؛ چک و حواله تا تأیید حسابداری در انتظار می‌ماند." : "بازپرداخت از مانده پرداخت‌شده مشتری کسر و در گزارش ممیزی ثبت می‌شود."}
          footer={<Button loading={pending} disabled={amountRial <= 0 || over || (needsNote && f.note.trim().length < 2) || (f.method === "CHEQUE" && mode === "pay" && !f.chequeDueDate)} onClick={submit}>ثبت</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="روش">
              <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                {(mode === "pay" ? PAY_METHODS : REFUND_METHODS).map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m]}</option>)}
              </Select>
            </Field>
            <Field label="مبلغ (تومان)" error={over ? `حداکثر ${formatToman(maxAmount!)}` : null}>
              <Input ltr inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: toEnDigits(e.target.value).replace(/\D/g, "") })} />
            </Field>
            {f.method === "CHEQUE" && mode === "pay" && <Field label="تاریخ سررسید چک"><Input ltr type="date" value={f.chequeDueDate} onChange={(e) => setF({ ...f, chequeDueDate: e.target.value })} /></Field>}
            <Field label={f.method === "CHEQUE" ? "شماره چک / صیادی" : "شماره مرجع / پیگیری"} className={f.method === "CHEQUE" && mode === "pay" ? "" : "sm:col-span-2"}>
              <Input ltr value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </Field>
            <Field label={mode === "pay" ? "یادداشت" : "دلیل بازپرداخت"} className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Approve / reject a payment awaiting accounting approval (cheque, transfer receipt). */
export function PaymentDecision({ paymentId }: { paymentId: string }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="icon-sm" variant="ghost" aria-label="تأیید پرداخت" loading={pending} onClick={() => run(() => api(`payments/${paymentId}/approve`, { method: "POST" }), "پرداخت تأیید شد.")}><Check className="text-success" /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="رد پرداخت" onClick={() => { setReason(""); setOpen(true); }}><X className="text-danger" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="رد پرداخت" description="مشتری از رد پرداخت مطلع می‌شود." footer={<Button variant="danger" loading={pending} disabled={reason.trim().length < 2} onClick={async () => { if (await run(() => api(`payments/${paymentId}/reject`, { body: { reason } }), "پرداخت رد شد.")) setOpen(false); }}>رد پرداخت</Button>}>
          <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        </DialogContent>
      </Dialog>
    </span>
  );
}
