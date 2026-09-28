import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CustomerFormButton } from "@/components/panel/customer-form";
import { KV, PageHeader, Stat } from "@/components/panel/page";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/labels";
import { formatNumber, formatPercent, formatPhone } from "@/lib/persian";
import { isAppError } from "@/server/core/errors";
import { requireStaffPage } from "@/server/http/session";
import { customerDetail } from "@/server/modules/people/service";

export const metadata: Metadata = { title: "پرونده مشتری" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStaffPage({ permission: "customer.view" });
  let d;
  try {
    d = await customerDetail(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const c = d.customer;
  const perms = ctx.actor.permissions;
  const live = d.orders.filter((o) => o.status !== "CANCELLED");
  const revenue = live.reduce((s, o) => s + o.total, 0);
  const balance = live.filter((o) => o.status !== "PENDING_REVIEW").reduce((s, o) => s + (o.total - (o.paidAmount - o.refundedAmount)), 0);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/customers", label: "مشتریان" }]}
        title={c.fullName}
        description={<>{c.companyName && `${c.companyName} • `}<Code>{formatPhone(c.phone)}</Code> • عضو از <DateText value={c.createdAt} /></>}
        actions={
          <>
            {perms.has("quote.manage") && <Button asChild size="sm" variant="secondary"><Link href={`/panel/sales/new?mode=quote&customer=${c.id}`}><FileText /> پیش‌فاکتور</Link></Button>}
            {perms.has("order.create") && <Button asChild size="sm" variant="secondary"><Link href={`/panel/sales/new?customer=${c.id}`}><Plus /> سفارش</Link></Button>}
            {perms.has("customer.manage") && <CustomerFormButton canEditTerms={perms.has("order.price.override")} customer={{ id: c.id, phone: c.phone, fullName: c.fullName, type: c.type, companyName: c.companyName, nationalId: c.nationalId, economicCode: c.economicCode, email: c.email, notes: c.notes, discountPct: c.discountPct, creditLimit: c.creditLimit }} />}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="سفارش‌ها" value={formatNumber(live.length)} />
        <Stat label="خرید کل" value={<Money rial={revenue} />} />
        <Stat label="مانده حساب" value={<Money rial={Math.max(0, balance)} />} tone={balance > 0 ? "danger" : "success"} sub={c.creditLimit ? <>سقف اعتبار <Money rial={c.creditLimit} /></> : "بدون خط اعتباری"} />
        <Stat label="تخفیف ثابت" value={c.discountPct ? formatPercent(c.discountPct) : "—"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader title="سفارش‌ها" />
          <Table>
            <THead><tr><TH>سفارش</TH><TH>تاریخ</TH><TH>وضعیت</TH><TH>پرداخت</TH><TH className="text-end">مبلغ</TH><TH className="text-end">مانده</TH></tr></THead>
            <TBody>
              {d.orders.map((o) => {
                const bal = o.total - (o.paidAmount - o.refundedAmount);
                return (
                  <TR key={o.id}>
                    <TD><Link href={`/panel/orders/${o.id}`} className="hover:text-accent-ink"><OrderNo n={o.number} /></Link></TD>
                    <TD className="text-muted"><DateText value={o.placedAt} /></TD>
                    <TD><Status map={ORDER_STATUS} value={o.status} /></TD>
                    <TD><Status map={PAYMENT_STATUS} value={o.paymentStatus} /></TD>
                    <TD className="text-end"><Money rial={o.total} /></TD>
                    <TD className={`text-end ${bal > 0 && o.status !== "CANCELLED" ? "text-danger" : "text-muted"}`}>{bal > 0 && o.status !== "CANCELLED" ? <Money rial={bal} unit={false} /> : "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="مشخصات" />
            <CardBody className="pt-0">
              <KV label="نوع">{c.type === "COMPANY" ? "حقوقی" : "حقیقی"}</KV>
              {c.nationalId && <KV label="شناسه ملی"><Code>{c.nationalId}</Code></KV>}
              {c.economicCode && <KV label="کد اقتصادی"><Code>{c.economicCode}</Code></KV>}
              {c.email && <KV label="ایمیل"><Code>{c.email}</Code></KV>}
              <KV label="حساب فروشگاه">{c.userId ? "فعال" : "ندارد (ثبت توسط کارکنان)"}</KV>
              {c.notes && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] leading-6">{c.notes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="نشانی‌ها" />
            <CardBody className="space-y-2 pt-0 text-[12.5px]">
              {d.addresses.length === 0 ? <p className="text-muted">نشانی ثبت نشده است.</p> : d.addresses.map((a) => (
                <div key={a.id} className="rounded-lg border border-line px-3 py-2">
                  <p className="font-bold">{a.title}{a.isDefault && <span className="ms-2 text-[11px] text-muted">پیش‌فرض</span>}</p>
                  <p className="text-muted">{a.province}، {a.city}، {a.line}</p>
                  <p className="text-muted">{a.recipientName} • <Code>{formatPhone(a.recipientPhone)}</Code></p>
                </div>
              ))}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
