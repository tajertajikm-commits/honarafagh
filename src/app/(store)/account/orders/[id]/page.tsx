import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Truck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { OrderTimeline } from "@/components/store/timeline";
import { ArtworkPanel, OrderActions, PaymentPanel } from "@/components/store/order-panels";
import { ARTWORK_STATUS, FILE_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_RECORD_STATUS, PAYMENT_STATUS, SHIPMENT_STATUS } from "@/lib/labels";
import { formatNumber, formatPhone, toFaDigits } from "@/lib/persian";
import { isAppError } from "@/server/core/errors";
import { requireCustomerPage } from "@/server/http/session";
import { type CustomerOrderView, getCustomerOrder } from "@/server/modules/orders/queries";

export const metadata: Metadata = { title: "جزئیات سفارش" };


export default async function CustomerOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const { placed } = await searchParams;
  const ctx = await requireCustomerPage(`/account/orders/${id}`);
  let d: CustomerOrderView;
  try {
    d = await getCustomerOrder(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const o = d.order;
  const balance = o.total - (o.paidAmount - o.refundedAmount);
  const depositDue = Math.max(0, Math.ceil((o.total * o.depositPct) / 100) - (o.paidAmount - o.refundedAmount));

  return (
    <div className="space-y-5">
      <Link href="/account" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        سفارش‌ها <ChevronLeft className="size-3.5" />
      </Link>
      {placed && <div className="rounded-2xl border border-success/25 bg-success-soft px-5 py-4 text-[14px] text-success">سفارش شما ثبت شد. برای شروع تولید، فایل طرح را بارگذاری و پیش‌پرداخت را انجام دهید.</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold">سفارش <OrderNo n={o.number} /></h2>
          <p className="text-[13px] text-muted">ثبت: <DateText value={o.placedAt} withTime />{o.dueDate && <> · تحویل تقریبی: <DateText value={o.dueDate} /></>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Status map={ORDER_STATUS} value={o.status} />
          <Status map={PAYMENT_STATUS} value={o.paymentStatus} />
          <Status map={FILE_STATUS} value={o.fileStatus} />
        </div>
      </div>
      {o.status === "CANCELLED" && o.cancelReason && <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] text-muted">علت لغو: {o.cancelReason}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="اقلام سفارش" icon={<FileText />} />
            <CardBody className="space-y-4">
              {d.items.map((it) => (
                <div key={it.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-bold">{it.title}</p>
                      <p className="text-[13px] text-muted">{formatNumber(it.quantity)} {it.unitLabel}{it.quantityDelivered > 0 && ` · ${formatNumber(it.quantityDelivered)} تحویل شده`}</p>
                    </div>
                    <Money rial={it.lineSubtotal} />
                  </div>
                  {it.summary.length > 0 && <p className="mt-2 text-[12.5px] leading-6 text-muted">{it.summary.map((s) => `${s.group}: ${toFaDigits(s.value)}`).join(" · ")}</p>}
                  <ArtworkPanel
                    itemId={it.id}
                    fileStatus={it.fileStatus}
                    needsDesign={it.needsDesign}
                    canUpload={!["CANCELLED", "COMPLETED"].includes(o.status) && it.fileStatus !== "APPROVED"}
                    versions={d.artwork.filter((a) => a.itemId === it.id).map((a) => ({ ...a, createdAt: String(a.createdAt), statusLabel: ARTWORK_STATUS[a.status]?.[0] ?? a.status }))}
                  />
                </div>
              ))}
            </CardBody>
          </Card>

          <PaymentPanel
            orderId={o.id}
            balance={balance}
            depositDue={depositDue}
            closed={o.status === "CANCELLED"}
            payments={d.payments.map((p) => ({ id: p.id, kind: p.kind, method: PAYMENT_METHOD[p.method] ?? p.method, status: p.status, statusLabel: PAYMENT_RECORD_STATUS[p.status]?.[0] ?? p.status, amount: p.amount, reference: p.reference, createdAt: String(p.createdAt), rejectionReason: p.rejectionReason }))}
            totals={{ subtotal: o.subtotal, discount: o.discountAmount, shipping: o.shippingAmount, vat: o.vatAmount, vatPct: o.vatPct, total: o.total, paid: o.paidAmount - o.refundedAmount }}
          />

          {d.shipments.length > 0 && (
            <Card>
              <CardHeader title="ارسال" icon={<Truck />} />
              <CardBody className="space-y-2">
                {d.shipments.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-[13.5px]">
                    <span>{formatNumber(s.quantity)} عدد {s.externalProvider ? `· ${s.externalProvider}` : ""} {s.trackingCode && <>· کد رهگیری <Code>{s.trackingCode}</Code></>}</span>
                    <span className="flex items-center gap-2">
                      {s.deliveredAt && <DateText value={s.deliveredAt} className="text-muted" />}
                      <Status map={SHIPMENT_STATUS} value={s.status} />
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="رویدادها" />
            <CardBody>
              <ul className="space-y-3">
                {d.events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-[13.5px]">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-subtle" />
                    <div>
                      <p>{e.message ?? e.type}</p>
                      <DateText value={e.createdAt} withTime className="text-[12px] text-muted" />
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card>
            <CardHeader title="روند سفارش" />
            <CardBody>
              <OrderTimeline steps={d.timeline} />
            </CardBody>
          </Card>
          {o.shippingAddress && (
            <Card>
              <CardHeader title={d.deliveryMethod?.name ?? "تحویل"} />
              <CardBody className="text-[13px] leading-7 text-muted">
                {o.shippingAddress.city}، {o.shippingAddress.line}
                <br />
                {o.shippingAddress.recipientName} · <bdi dir="ltr" className="tabular">{formatPhone(o.shippingAddress.recipientPhone)}</bdi>
              </CardBody>
            </Card>
          )}
          <OrderActions orderId={o.id} canCancel={o.status === "PENDING_REVIEW" && o.paidAmount === 0} canChange={!["CANCELLED", "COMPLETED"].includes(o.status)} changeRequests={d.changeRequests.map((c) => ({ ...c, createdAt: String(c.createdAt) }))} />
        </aside>
      </div>
    </div>
  );
}
