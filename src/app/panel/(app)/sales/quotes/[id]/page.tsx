import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, ReasonAction } from "@/components/panel/actions";
import { KV, PageHeader } from "@/components/panel/page";
import { QUOTE_STATUS, URGENCY } from "@/lib/labels";
import { formatNumber, formatPercent, formatPhone, toFaDigits } from "@/lib/persian";
import { isAppError } from "@/server/core/errors";
import { requireStaffPage } from "@/server/http/session";
import { quoteDetail } from "@/server/modules/quotes/queries";

export const metadata: Metadata = { title: "پیش‌فاکتور" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStaffPage({ permission: "quote.view" });
  let d;
  try {
    d = await quoteDetail(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const q = d.quote;
  const perms = ctx.actor.permissions;
  const canManage = perms.has("quote.manage");
  const seeCosts = perms.has("pricing.view") || perms.has("order.price.override");
  const margin = q.subtotal - q.discountAmount > 0 ? ((q.subtotal - q.discountAmount - q.costTotal) / (q.subtotal - q.discountAmount)) * 100 : 0;
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/sales?tab=quotes", label: "فروش" }]}
        title={<>پیش‌فاکتور {toFaDigits(q.number)} <Status map={QUOTE_STATUS} value={q.status} className="ms-2 align-middle" /></>}
        description={<>{d.customer.fullName}{d.customer.companyName && ` · ${d.customer.companyName}`} · صادرشده <DateText value={q.createdAt} />{d.createdBy && ` توسط ${d.createdBy}`}</>}
        actions={
          <>
            {d.orderNumber && q.convertedOrderId && <Button asChild size="sm" variant="secondary"><Link href={`/panel/orders/${q.convertedOrderId}`}>سفارش <OrderNo n={d.orderNumber} /></Link></Button>}
            {canManage && q.status === "DRAFT" && <ActionButton size="sm" path={`quotes/${q.id}/send`} success="پیش‌فاکتور برای مشتری پیامک شد.">ارسال برای مشتری</ActionButton>}
            {canManage && q.status === "SENT" && <ActionButton size="sm" path={`quotes/${q.id}/accept`} confirm="پذیرش از طرف مشتری ثبت و سفارش ساخته شود؟" success="پیش‌فاکتور پذیرفته و به سفارش تبدیل شد.">ثبت پذیرش مشتری</ActionButton>}
            {canManage && ["DRAFT", "SENT"].includes(q.status) && <ReasonAction path={`quotes/${q.id}/reject`} title="رد پیش‌فاکتور" success="پیش‌فاکتور رد شد." danger variant="ghost">رد</ReasonAction>}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <Table>
            <THead><tr><TH>شرح</TH><TH className="text-end">تعداد</TH><TH className="text-end">مبلغ</TH>{seeCosts && <TH className="text-end">بهای تمام‌شده</TH>}</tr></THead>
            <TBody>
              {d.items.map((it) => (
                <TR key={it.id}>
                  <TD><span className="font-bold">{it.title}</span>{it.isPriceOverridden && <span className="ms-2 text-[11.5px] text-warning">قیمت توافقی</span>}{it.description && <span className="block max-w-xl text-[12.5px] text-muted">{it.description}</span>}</TD>
                  <TD className="text-end tabular">{formatNumber(it.quantity)}</TD>
                  <TD className="text-end"><Money rial={it.lineSubtotal} /></TD>
                  {seeCosts && <TD className="text-end text-muted"><Money rial={it.costTotal} unit={false} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="space-y-1 border-t border-line px-5 py-4 text-[13.5px]">
            <KV label="جمع">{<Money rial={q.subtotal} />}</KV>
            {q.discountAmount > 0 && <KV label="تخفیف">−<Money rial={q.discountAmount} /></KV>}
            <KV label={`مالیات بر ارزش افزوده (${formatPercent(q.vatPct, 0)})`}><Money rial={q.vatAmount} /></KV>
            <KV label="مبلغ کل" className="text-[16px] font-bold"><Money rial={q.total} strong /></KV>
          </div>
        </Card>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="اطلاعات" />
            <CardBody className="pt-0">
              <KV label="مشتری"><Link href={`/panel/customers/${d.customer.id}`} className="hover:text-accent-ink">{d.customer.fullName}</Link></KV>
              <KV label="موبایل"><Code>{formatPhone(d.customer.phone)}</Code></KV>
              <KV label="فوریت">{URGENCY[q.urgency]}</KV>
              <KV label="اعتبار تا"><DateText value={q.validUntil} /></KV>
              {q.sentAt && <KV label="ارسال"><DateText value={q.sentAt} withTime /></KV>}
              {q.respondedAt && <KV label="پاسخ مشتری"><DateText value={q.respondedAt} withTime /></KV>}
              {seeCosts && <KV label="حاشیه سود">{formatPercent(margin)}</KV>}
              {d.inquiry && <KV label="استعلام">{toFaDigits(d.inquiry.number)} · {d.inquiry.title}</KV>}
            </CardBody>
          </Card>
          {(q.customerNote || q.internalNote) && (
            <Card>
              <CardHeader title="یادداشت‌ها" />
              <CardBody className="space-y-3 pt-0 text-[13px] leading-7">
                {q.customerNote && <p><b className="block text-[12px] text-muted">برای مشتری</b>{q.customerNote}</p>}
                {q.internalNote && <p><b className="block text-[12px] text-muted">داخلی</b>{q.internalNote}</p>}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
