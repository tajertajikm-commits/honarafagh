"use client";

import { useRouter } from "next/navigation";
import { CreditCard, MessageSquare, Upload, XCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, newIdempotencyKey } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        after?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "خطا در انجام عملیات");
      }
    });
  return { run, pending, toast };
}

/** Answer the printing house's question (optionally with new files). */
export function ReplyForm({ orderId }: { orderId: string }) {
  const { run, pending, toast } = useAction();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  return (
    <div className="space-y-3">
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="پاسخ شما…" />
      <FileDrop purpose="ARTWORK" files={files} onChange={setFiles} compact onError={toast.error} />
      <Button loading={pending} disabled={message.trim().length < 2} onClick={() => run(() => api(`orders/${orderId}/reply`, { body: { message, fileIds: files.map((f) => f.id) } }), "پاسخ شما ارسال شد.", () => { setMessage(""); setFiles([]); })}>
        <MessageSquare className="size-4" /> ارسال پاسخ
      </Button>
    </div>
  );
}

/** Send (or correct) the print file. */
export function UploadArtwork({ orderId, label = "ارسال فایل" }: { orderId: string; label?: string }) {
  const { run, pending, toast } = useAction();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  return (
    <div className="space-y-3">
      <FileDrop purpose="ARTWORK" files={files} onChange={setFiles} onError={toast.error} />
      {files.length > 0 && (
        <Button loading={pending} onClick={() => run(() => api(`orders/${orderId}/artwork`, { body: { fileIds: files.map((f) => f.id) } }), "فایل ارسال شد و بررسی می‌شود.", () => setFiles([]))}>
          <Upload className="size-4" /> {label}
        </Button>
      )}
    </div>
  );
}

/** Online payment (sandbox in demo) or a bank-transfer receipt the accountant confirms. */
export function PayPanel({ orderId, balance }: { orderId: string; balance: number }) {
  const { run, pending, toast } = useAction();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(balance / 10)));
  const [ref, setRef] = useState("");
  const [receipt, setReceipt] = useState<UploadedFile[]>([]);
  const key = useRef(newIdempotencyKey());
  const pay = () =>
    run(async () => {
      const r = await api<{ redirectUrl: string }>(`orders/${orderId}/pay`, { body: { idempotencyKey: newIdempotencyKey() } });
      window.location.href = r.redirectUrl;
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={pay} loading={pending}>
        <CreditCard className="size-4" /> پرداخت آنلاین <Money rial={balance} unit={false} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">ثبت رسید کارت به کارت</Button>
        </DialogTrigger>
        <DialogContent
          title="ثبت رسید واریز"
          description="پس از بررسی حسابداری، پرداخت روی سفارش ثبت می‌شود."
          footer={
            <Button loading={pending} disabled={!receipt.length || !amount} onClick={() => run(() => api(`orders/${orderId}/payments`, { body: { method: "BANK_TRANSFER", amount: Number(toEnDigits(amount).replace(/\D/g, "")) * 10, reference: ref || null, receiptFileId: receipt[0]!.id, idempotencyKey: key.current } }), "رسید ثبت شد و پس از بررسی تأیید می‌شود.", () => setOpen(false))}>
              ثبت رسید
            </Button>
          }
        >
          <div className="space-y-4">
            <Field label="مبلغ واریزی (تومان)"><Input ltr inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="شماره پیگیری" hint="اختیاری"><Input ltr value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
            <FileDrop purpose="PAYMENT_RECEIPT" files={receipt} onChange={setReceipt} multiple={false} accept=".jpg,.jpeg,.png,.pdf" hint="تصویر یا PDF رسید" onError={toast.error} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CancelOrder({ orderId }: { orderId: string }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger-ghost" size="sm"><XCircle className="size-4" /> لغو سفارش</Button>
      </DialogTrigger>
      <DialogContent title="لغو سفارش" description="سفارش تا پیش از تأیید قابل لغو است." footer={<Button variant="danger" disabled={reason.trim().length < 3} loading={pending} onClick={() => run(() => api(`orders/${orderId}/cancel`, { body: { reason } }), "سفارش لغو شد.", () => setOpen(false))}>لغو سفارش</Button>}>
        <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </DialogContent>
    </Dialog>
  );
}
