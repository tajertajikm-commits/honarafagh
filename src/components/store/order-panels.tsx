"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Download, Eye, MessageSquare, RefreshCcw, XCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FileDrop, formatBytes, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Textarea } from "@/components/ui/input";
import { DateText, Money } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, newIdempotencyKey } from "@/lib/api-client";
import { ARTWORK_STAGE, FILE_STATUS, label, tone } from "@/lib/labels";
import { formatNumber, toEnDigits, toFaDigits } from "@/lib/persian";

function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "خطا در انجام عملیات");
      }
    });
  return { run, pending, toast };
}

interface Version {
  id: string;
  versionNo: number;
  stage: string;
  status: string;
  statusLabel: string;
  note: string | null;
  reviewNote: string | null;
  customerComment: string | null;
  createdAt: string;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number };
}

export function ArtworkPanel({ itemId, fileStatus, needsDesign, canUpload, versions }: { itemId: string; fileStatus: string; needsDesign: boolean; canUpload: boolean; versions: Version[] }) {
  const { run, pending, toast } = useAction();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [comment, setComment] = useState("");
  const proof = versions.find((v) => v.status === "SENT_FOR_APPROVAL");

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-ink-2">فایل طرح</p>
        <Badge tone={tone(FILE_STATUS, fileStatus)} dot>{label(FILE_STATUS, fileStatus)}</Badge>
      </div>

      {proof && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-4">
          <p className="text-[14px] font-bold">نمونه طرح آماده تأیید شماست</p>
          {proof.note && <p className="mt-1 text-[13px] text-ink-2">{proof.note}</p>}
          <a href={`/api/v1/files/${proof.file.id}?inline=1`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink">
            <Eye className="size-4" /> مشاهده نمونه ({proof.file.originalName})
          </a>
          <Textarea className="mt-3 min-h-[64px] bg-surface" placeholder="در صورت نیاز به تغییر، توضیح دهید…" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" loading={pending} onClick={() => run(() => api(`artwork/${proof.id}/decision`, { body: { approve: true } }), "طرح تأیید شد و برای چاپ ارسال می‌شود.")}>
              <CheckCircle2 /> تأیید نهایی برای چاپ
            </Button>
            <Button size="sm" variant="secondary" disabled={pending || comment.trim().length < 3} onClick={() => run(() => api(`artwork/${proof.id}/decision`, { body: { approve: false, comment } }), "درخواست اصلاح ارسال شد.")}>
              <XCircle /> درخواست اصلاح
            </Button>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <ul className="space-y-1.5">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-[12.5px]">
              <span className="font-bold tabular">نسخه {toFaDigits(v.versionNo)}</span>
              <span className="text-muted">{ARTWORK_STAGE[v.stage]}</span>
              <span className="min-w-0 flex-1 truncate text-muted" dir="auto">{v.file.originalName} • {formatBytes(v.file.sizeBytes)}</span>
              <span className="text-ink-2">{v.statusLabel}</span>
              <a href={`/api/v1/files/${v.file.id}`} className="text-muted hover:text-ink" aria-label="دانلود"><Download className="size-3.5" /></a>
            </li>
          ))}
        </ul>
      )}
      {versions.some((v) => v.status === "REJECTED" && v.reviewNote) && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">نیاز به اصلاح: {versions.find((v) => v.status === "REJECTED")?.reviewNote}</p>
      )}

      {canUpload && !needsDesign && (
        <div className="space-y-2">
          <FileDrop purpose="ARTWORK" files={files} onChange={setFiles} compact onError={toast.error} />
          {files.length > 0 && (
            <Button size="sm" loading={pending} onClick={() => run(async () => { for (const f of files) await api(`order-items/${itemId}/artwork`, { body: { fileId: f.id, stage: "CUSTOMER_ORIGINAL" } }); setFiles([]); }, "فایل برای بررسی ارسال شد.")}>
              ارسال فایل برای بررسی
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function PaymentPanel({ orderId, balance, depositDue, closed, payments, totals }: {
  orderId: string;
  balance: number;
  depositDue: number;
  closed: boolean;
  payments: { id: string; kind: string; method: string; status: string; statusLabel: string; amount: number; reference: string | null; createdAt: string; rejectionReason: string | null }[];
  totals: { subtotal: number; discount: number; shipping: number; vat: number; vatPct: number; total: number; paid: number };
}) {
  const { run, pending, toast } = useAction();
  const key = useRef(newIdempotencyKey());
  const [receipt, setReceipt] = useState<UploadedFile[]>([]);
  const [amount, setAmount] = useState(String(Math.round(balance / 10)));
  const [ref, setRef] = useState("");

  const pay = (rial: number) =>
    run(async () => {
      const r = await api<{ redirectUrl: string }>(`orders/${orderId}/pay`, { body: { amount: rial, idempotencyKey: newIdempotencyKey() } });
      window.location.href = r.redirectUrl;
    });

  return (
    <Card>
      <CardHeader title="پرداخت" icon={<CreditCard />} />
      <CardBody>
        <dl className="grid gap-2 text-[13.5px] sm:grid-cols-2">
          <Row label="جمع اقلام"><Money rial={totals.subtotal} /></Row>
          {totals.discount > 0 && <Row label="تخفیف"><Money rial={totals.discount} /></Row>}
          <Row label="ارسال"><Money rial={totals.shipping} /></Row>
          <Row label={`مالیات (${formatNumber(totals.vatPct)}٪)`}><Money rial={totals.vat} /></Row>
          <Row label="جمع کل"><Money rial={totals.total} strong /></Row>
          <Row label="پرداخت‌شده"><Money rial={totals.paid} className="text-success" /></Row>
        </dl>
        {!closed && balance > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-2/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] text-muted">مانده حساب</p>
              <Money rial={balance} className="text-[20px] font-bold" />
            </div>
            <div className="flex flex-wrap gap-2">
              {depositDue > 0 && depositDue < balance && <Button variant="secondary" onClick={() => pay(depositDue)} loading={pending}>پیش‌پرداخت <Money rial={depositDue} unit={false} /></Button>}
              <Button onClick={() => pay(balance)} loading={pending}>پرداخت آنلاین</Button>
              <Dialog>
                <DialogTrigger asChild><Button variant="ghost">ثبت رسید واریز</Button></DialogTrigger>
                <DialogContent
                  title="ثبت رسید کارت به کارت"
                  description="پس از تأیید حسابداری، پرداخت در سفارش ثبت می‌شود."
                  footer={
                    <Button
                      loading={pending}
                      disabled={receipt.length === 0}
                      onClick={() => run(() => api(`orders/${orderId}/payments`, { body: { method: "BANK_TRANSFER", amount: Number(toEnDigits(amount)) * 10, reference: ref || null, receiptFileId: receipt[0]!.id, idempotencyKey: key.current } }), "رسید ثبت شد و پس از بررسی تأیید می‌شود.")}
                    >
                      ثبت رسید
                    </Button>
                  }
                >
                  <div className="space-y-4">
                    <Field label="مبلغ واریزی (تومان)"><Input ltr inputMode="numeric" value={amount} onChange={(e) => setAmount(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
                    <Field label="شماره پیگیری بانک"><Input ltr value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
                    <FileDrop purpose="PAYMENT_RECEIPT" files={receipt} onChange={setReceipt} multiple={false} accept=".jpg,.jpeg,.png,.pdf" hint="تصویر یا PDF رسید" onError={toast.error} />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}
        {payments.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
                <span className="font-bold">{p.kind === "REFUND" ? "بازپرداخت" : p.method}</span>
                <Money rial={p.amount} />
                <span className="text-muted"><DateText value={p.createdAt} /></span>
                {p.reference && <span className="text-muted">پیگیری: <bdi dir="ltr">{p.reference}</bdi></span>}
                <span className="ms-auto">{p.statusLabel}</span>
                {p.rejectionReason && <span className="w-full text-danger">{p.rejectionReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function OrderActions({ orderId, canCancel, canChange, changeRequests }: { orderId: string; canCancel: boolean; canChange: boolean; changeRequests: { id: string; description: string; status: string; resolution: string | null; createdAt: string }[] }) {
  const { run, pending } = useAction();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [change, setChange] = useState("");
  return (
    <Card>
      <CardHeader title="عملیات" />
      <CardBody className="space-y-2">
        <Button variant="secondary" className="w-full" loading={pending} onClick={() => run(async () => { const r = await api<{ added: string[] }>(`orders/${orderId}/reorder`, { method: "POST" }); if (r.added.length) router.push("/cart"); }, "اقلام با قیمت امروز به سبد اضافه شد.")}>
          <RefreshCcw /> سفارش مجدد
        </Button>
        {canChange && (
          <Dialog>
            <DialogTrigger asChild><Button variant="ghost" className="w-full"><MessageSquare /> درخواست تغییر</Button></DialogTrigger>
            <DialogContent title="درخواست تغییر در سفارش" description="اگر تولید شروع شده باشد، تغییر ممکن است هزینه یا زمان اضافه داشته باشد؛ همکاران ما بررسی و اطلاع می‌دهند." footer={<Button disabled={change.trim().length < 3} loading={pending} onClick={() => run(() => api(`orders/${orderId}/change-requests`, { body: { description: change } }), "درخواست ثبت شد.")}>ثبت درخواست</Button>}>
              <Textarea value={change} onChange={(e) => setChange(e.target.value)} placeholder="چه تغییری لازم است؟" />
            </DialogContent>
          </Dialog>
        )}
        {canCancel && (
          <Dialog>
            <DialogTrigger asChild><Button variant="danger-ghost" className="w-full">لغو سفارش</Button></DialogTrigger>
            <DialogContent title="لغو سفارش" footer={<Button variant="danger" disabled={reason.trim().length < 2} loading={pending} onClick={() => run(() => api(`orders/${orderId}/cancel`, { body: { reason } }), "سفارش لغو شد.")}>لغو سفارش</Button>}>
              <Field label="علت لغو"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </DialogContent>
          </Dialog>
        )}
        {changeRequests.length > 0 && (
          <ul className="space-y-2 border-t border-line pt-3 text-[12.5px]">
            {changeRequests.map((c) => (
              <li key={c.id}>
                <p className="text-ink-2">{c.description}</p>
                <p className="text-muted">{c.status === "PENDING" ? "در انتظار بررسی" : c.status === "APPROVED" ? "پذیرفته شد" : "پذیرفته نشد"}{c.resolution ? ` — ${c.resolution}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{l}</dt>
      <dd>{children}</dd>
    </div>
  );
}
