"use client";

import { DateText, Money } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { PAYMENT_METHOD, PAYMENT_RECORD_STATUS } from "@/lib/labels";
import { MoneyDialogButton, PaymentDecision } from "../finance-actions";

export interface PaymentView { id: string; number: number; kind: string; method: string; status: string; amount: number; reference: string | null; note: string | null; receiptFileId: string | null; createdAt: string; rejectionReason: string | null; chequeDueDate?: string | null }

export function PaymentsPanel({ orderId, payments, balance, paid, perms }: { orderId: string; payments: PaymentView[]; balance: number; paid: number; perms: string[] }) {
  const can = (p: string) => perms.includes(p);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {can("payment.create") && balance > 0 && <MoneyDialogButton orderId={orderId} mode="pay" defaultAmount={balance} />}
        {can("payment.refund") && paid > 0 && <MoneyDialogButton orderId={orderId} mode="refund" defaultAmount={Math.max(0, -balance) || paid} maxAmount={paid} />}
      </div>
      {payments.length === 0 ? <p className="text-[13px] text-muted">پرداختی ثبت نشده است.</p> : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5 text-[12.5px]">
              <span className="font-bold">{p.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[p.method]}</span>
              <Money rial={p.amount} strong />
              <span className="text-muted"><DateText value={p.createdAt} withTime /></span>
              {p.reference && <span className="text-muted">مرجع: <bdi dir="ltr">{p.reference}</bdi></span>}
              {p.chequeDueDate && <span className="text-muted">سررسید: <DateText value={p.chequeDueDate} /></span>}
              {p.receiptFileId && <a className="font-bold text-accent-ink" href={`/api/v1/files/${p.receiptFileId}?inline=1`} target="_blank" rel="noreferrer">رسید</a>}
              <span className="ms-auto flex items-center gap-1.5">
                <Status map={PAYMENT_RECORD_STATUS} value={p.status} />
                {p.status === "AWAITING_APPROVAL" && can("payment.approve") && <PaymentDecision paymentId={p.id} />}
              </span>
              {p.rejectionReason && <span className="w-full text-danger">{p.rejectionReason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
