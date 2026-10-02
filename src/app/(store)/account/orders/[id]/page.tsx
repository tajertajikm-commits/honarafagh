import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Receipt, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText, Money, OrderCode } from "@/components/ui/misc";
import { StatusStepper } from "@/components/store/timeline";
import { CancelOrder, PayPanel, ReplyForm, UploadArtwork } from "@/components/store/order-panels";
import { isAppError } from "@/server/core/errors";
import { requireCustomerPage } from "@/server/http/session";
import { customerOrder, type CustomerOrder } from "@/server/modules/orders/queries";
import { balanceOf } from "@/server/modules/orders/state";
import { ARTWORK_FILE_STATUS, INVOICE_TYPE, PAYMENT_METHOD, PAYMENT_RECORD_STATUS, PAYMENT_STATUS, PRODUCTION_TYPE, label } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/persian";

export const metadata: Metadata = { title: "سفارش من" };

export default async function CustomerOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const { placed } = await searchParams;
  const ctx = await requireCustomerPage(`/account/orders/${id}`);
  let d: CustomerOrder;
  try {
    d = await customerOrder(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const o = d.order;
  const balance = balanceOf(o);
  const closed = o.status === "REJECTED" || o.status === "CANCELLED";
  const lastQuestion = [...d.events].reverse().find((e) => e.type === "INFO_REQUESTED");
  const correction = [...d.artwork].reverse().find((a) => a.artwork.status === "REJECTED");
  const canUpload = !closed && o.status !== "DELIVERED" && !o.needsDesign && ["AWAITING_FILE", "NEEDS_CORRECTION"].includes(o.artworkStatus);

  return (
    <div className="space-y-5">
      <Link href="/account" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">سفارش‌ها <ChevronLeft className="size-3.5" /></Link>
      {placed && <div className="rounded-2xl border border-success/25 bg-success-soft px-5 py-4 text-[14px] text-success">سفارش شما ثبت شد و پس از بررسی تأیید می‌شود. وضعیت را همین‌جا دنبال کنید.</div>}

      <header className="rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">سفارش {PRODUCTION_TYPE[o.productionType]} • <DateText value={o.createdAt} /></p>
            <h2 className="mt-0.5 text-[22px] font-bold"><OrderCode code={o.code} /></h2>
            <p className="text-[15px] font-bold text-ink-2">{o.title}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={d.status.tone === "danger" ? "danger" : d.status.tone === "success" ? "success" : d.status.tone === "warning" ? "warning" : "info"} className="h-7 px-3 text-[13px]">{d.status.label}</Badge>
            {(o.status === "WAITING_APPROVAL" || o.status === "NEEDS_INFO") && <CancelOrder orderId={o.id} />}
          </div>
        </div>
        {d.status.index >= 0 && <StatusStepper index={d.status.index} className="mt-6" />}
        {o.status === "REJECTED" && <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-danger">{d.events.at(-1)?.message}</p>}
        {o.status === "CANCELLED" && o.cancelReason && <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] text-muted">علت لغو: {o.cancelReason}</p>}
      </header>

      {/* What the customer should do now */}
      {o.status === "NEEDS_INFO" && (
        <ActionCard title="به توضیح شما نیاز داریم" tone="violet">
          {lastQuestion && <p className="mb-3 rounded-xl bg-surface px-4 py-3 text-[14px] leading-7">{lastQuestion.message}</p>}
          <ReplyForm orderId={o.id} />
        </ActionCard>
      )}
      {canUpload && (
        <ActionCard title={o.artworkStatus === "NEEDS_CORRECTION" ? "فایل نیاز به اصلاح دارد" : "فایل طرح را بفرستید"} tone="warning">
          {correction?.artwork.reviewNote && <p className="mb-3 rounded-xl bg-surface px-4 py-3 text-[14px] leading-7">{correction.artwork.reviewNote}</p>}
          <UploadArtwork orderId={o.id} label={o.artworkStatus === "NEEDS_CORRECTION" ? "ارسال فایل اصلاح‌شده" : "ارسال فایل"} />
        </ActionCard>
      )}
      {o.pricedAt && balance > 0 && !closed && (
        <ActionCard title={`مبلغ قابل پرداخت: `} titleExtra={<Money rial={balance} strong />} tone="info">
          <PayPanel orderId={o.id} balance={balance} />
        </ActionCard>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="خلاصه سفارش" icon={<FileText />} />
            <CardBody className="space-y-3 text-[13.5px]">
              {d.items.length > 0 ? (
                d.items.map((it) => (
                  <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
                    <div>
                      <p className="font-bold">{it.title} <span className="text-muted">× {formatNumber(it.quantity)} {it.unitLabel}</span></p>
                      {it.priceSnapshot?.spec?.summary?.length ? <p className="text-[12px] text-muted">{it.priceSnapshot.spec.summary.join(" • ")}</p> : it.description ? <p className="text-[12px] text-muted">{it.description}</p> : null}
                    </div>
                    <Money rial={it.lineSubtotal} />
                  </div>
                ))
              ) : (
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {([
                    ["تیراژ", o.quantity ? formatNumber(o.quantity) : null],
                    ["ابعاد", o.dimensions],
                    ["جنس", o.material],
                    ["رنگ", o.colors],
                    ["عملیات تکمیلی", o.finishing],
                    ["فایل", o.needsDesign ? "طراحی توسط چاپخانه" : "فایل آماده"],
                  ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1"><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
                  ))}
                </dl>
              )}
              {o.description && <p className="text-[13px] leading-7 text-ink-2">{o.description}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="پیام‌ها و تاریخچه" />
            <ol className="divide-y divide-line">
              {d.events.map((e) => (
                <li key={e.id} className={cn("flex gap-3 px-5 py-3 text-[13.5px]", e.type === "CUSTOMER_MESSAGE" && "bg-surface-2/60")}>
                  <span className={cn("mt-2 size-2 shrink-0 rounded-full", e.type === "CUSTOMER_MESSAGE" ? "bg-ink" : e.domain === "MESSAGE" ? "bg-violet" : "bg-accent")} />
                  <div className="min-w-0 flex-1">
                    <p className="leading-7">{e.type === "CUSTOMER_MESSAGE" && <b>شما: </b>}{e.type === "INFO_REQUESTED" && <b>هنر آفاق: </b>}{e.message}</p>
                    <DateText value={e.createdAt} withTime className="text-[12px] text-muted" />
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="پرداخت" icon={<Receipt />} actions={o.pricedAt ? <Badge tone={o.paymentStatus === "PAID" ? "success" : o.paymentStatus === "UNPAID" ? "warning" : "info"}>{label(PAYMENT_STATUS, o.paymentStatus)}</Badge> : undefined} />
            <CardBody className="space-y-1.5 text-[13.5px]">
              {!o.pricedAt ? (
                <p className="text-muted">مبلغ پس از بررسی سفارش اعلام می‌شود.</p>
              ) : (
                <>
                  <Row k="مبلغ کل" v={<Money rial={o.total} strong />} />
                  <Row k="پرداخت‌شده" v={<Money rial={o.paidAmount - o.refundedAmount} />} />
                  <Row k="مانده" v={<Money rial={Math.max(0, balance)} strong />} />
                </>
              )}
              {d.payments.map((p) => (
                <p key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1.5 text-[12.5px]">
                  <span>{p.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[p.method]} — <Money rial={p.amount} /></span>
                  <span className="text-muted">{label(PAYMENT_RECORD_STATUS, p.status)}</span>
                </p>
              ))}
            </CardBody>
          </Card>
          {d.invoices.length > 0 && (
            <Card>
              <CardHeader title="فاکتورها" />
              <ul className="divide-y divide-line">
                {d.invoices.map((i) => (
                  <li key={i.id}><Link href={`/account/invoices/${i.id}`} className="flex items-center justify-between px-5 py-3 text-[13px] hover:bg-surface-2"><span>فاکتور {formatNumber(i.number)} <span className="text-muted">({INVOICE_TYPE[i.type]})</span></span><span className="font-bold text-accent-ink">مشاهده / PDF</span></Link></li>
                ))}
              </ul>
            </Card>
          )}
          {d.shipment && (
            <Card>
              <CardHeader title="ارسال" icon={<Truck />} />
              <CardBody className="space-y-1.5 text-[13.5px]">
                <Row k="روش" v={d.shipment.method} />
                {d.shipment.carrierName && <Row k="حمل‌کننده" v={d.shipment.carrierName} />}
                {d.shipment.trackingCode && <Row k="کد رهگیری" v={<bdi dir="ltr">{d.shipment.trackingCode}</bdi>} />}
                <Row k="ارسال" v={<DateText value={d.shipment.dispatchedAt} />} />
                {d.shipment.deliveredAt && <Row k="تحویل" v={<DateText value={d.shipment.deliveredAt} />} />}
              </CardBody>
            </Card>
          )}
          {d.artwork.length > 0 && (
            <Card>
              <CardHeader title="فایل‌ها" />
              <ul className="divide-y divide-line">
                {d.artwork.map((a) => (
                  <li key={a.artwork.id} className="flex items-center gap-2 px-5 py-2.5 text-[12.5px]">
                    <a href={`/api/v1/files/${a.file.id}`} className="min-w-0 flex-1 truncate font-bold hover:underline" dir="auto">{a.file.name}</a>
                    <span className="text-muted">{a.artwork.source === "DESIGNER" ? "طرح نهایی" : label(ARTWORK_FILE_STATUS, a.artwork.status)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <p className="flex items-center justify-between gap-3"><span className="text-muted">{k}</span><span>{v}</span></p>;
}

function ActionCard({ title, titleExtra, tone, children }: { title: string; titleExtra?: React.ReactNode; tone: "warning" | "violet" | "info"; children: React.ReactNode }) {
  const cls = { warning: "border-warning/30 bg-warning-soft/60", violet: "border-violet/25 bg-violet-soft/60", info: "border-info/20 bg-info-soft/50" }[tone];
  return (
    <section className={cn("rounded-3xl border p-5 sm:p-6", cls)}>
      <h3 className="mb-3 text-[16px] font-bold">{title}{titleExtra}</h3>
      {children}
    </section>
  );
}
