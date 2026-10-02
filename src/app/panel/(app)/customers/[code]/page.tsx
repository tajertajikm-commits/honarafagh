import Link from "next/link";
import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CustomerCode, DateText, Money, OrderCode } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KV, PageHeader, Stat } from "@/components/panel/page";
import { TypeChip } from "@/components/panel/chips";
import { CustomerEdit } from "@/components/panel/customer-edit";
import { can } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { customerProfile } from "@/server/modules/people/service";
import { CUSTOMER_TYPE, INVOICE_TYPE, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_RECORD_STATUS, PAYMENT_STATUS } from "@/lib/labels";
import { formatNumber, formatPhone } from "@/lib/persian";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).code) };
}

export default async function CustomerPage({ params }: { params: Promise<{ code: string }> }) {
  const ctx = await requireStaffPage({ anyOf: ["customer.view", "payment.view"] });
  const p = await customerProfile(ctx, decodeURIComponent((await params).code));
  const c = p.customer;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        crumbs={[{ href: "/panel/customers", label: "مشتریان" }]}
        title={<span className="flex flex-wrap items-center gap-2">{c.companyName || c.fullName} <CustomerCode code={c.code} className="text-[16px] text-muted" /> <Badge tone={c.type === "COMPANY" ? "violet" : "neutral"}>{CUSTOMER_TYPE[c.type]}</Badge></span>}
        description={c.companyName ? c.fullName : undefined}
        actions={can(ctx, "customer.manage") ? <CustomerEdit customer={c} /> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="سفارش‌ها" value={formatNumber(p.totals.orders)} sub={`${formatNumber(p.totals.digital)} دیجیتال • ${formatNumber(p.totals.offset)} افست`} />
        <Stat label="جمع صورتحساب" value={<Money rial={p.totals.billed} />} />
        <Stat label="پرداخت‌شده" value={<Money rial={p.totals.paid} />} tone="success" />
        <Stat label="مانده" value={<Money rial={p.totals.balance} />} tone={p.totals.balance > 0 ? "danger" : "neutral"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader title="اطلاعات تماس و حقوقی" />
          <CardBody className="space-y-1">
            <KV label={<span className="flex items-center gap-1"><Phone className="size-3.5" /> موبایل</span>}><bdi dir="ltr">{formatPhone(c.phone)}</bdi></KV>
            {c.email && <KV label={<span className="flex items-center gap-1"><Mail className="size-3.5" /> ایمیل</span>}><bdi dir="ltr">{c.email}</bdi></KV>}
            <KV label={c.type === "COMPANY" ? "شناسه ملی" : "کد ملی"}>{c.nationalId ? <bdi dir="ltr">{c.nationalId}</bdi> : "—"}</KV>
            {c.type === "COMPANY" && <KV label="کد اقتصادی">{c.economicCode ? <bdi dir="ltr">{c.economicCode}</bdi> : "—"}</KV>}
            {c.type === "COMPANY" && <KV label="شماره ثبت">{c.registrationNo ? <bdi dir="ltr">{c.registrationNo}</bdi> : "—"}</KV>}
            {(c.billingAddress || p.addresses[0]) && <KV label={<span className="flex items-center gap-1"><MapPin className="size-3.5" /> نشانی</span>}>{c.billingAddress ?? `${p.addresses[0]!.city}، ${p.addresses[0]!.line}`}</KV>}
            <KV label="عضویت"><DateText value={c.createdAt} /></KV>
            {c.notes && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px]">{c.notes}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="همه سفارش‌ها" />
          <Table>
            <THead><TR><TH>کد سفارش</TH><TH>عنوان</TH><TH>وضعیت</TH><TH className="text-end">مبلغ</TH><TH>پرداخت</TH><TH>ثبت</TH></TR></THead>
            <TBody>
              {p.orders.map((o) => (
                <TR key={o.id}>
                  <TD><Link href={`/panel/orders/${o.code}`} className="hover:underline"><OrderCode code={o.code} /></Link> <TypeChip type={o.productionType} className="h-5 text-[11px]" /></TD>
                  <TD className="max-w-56 truncate">{o.title}</TD>
                  <TD><Status map={ORDER_STATUS} value={o.status} /></TD>
                  <TD className="text-end">{o.pricedAt ? <Money rial={o.total} /> : "—"}</TD>
                  <TD>{o.pricedAt ? <Status map={PAYMENT_STATUS} value={o.paymentStatus} /> : <Badge tone="warning">بدون قیمت</Badge>}</TD>
                  <TD><DateText value={o.createdAt} className="text-[12.5px]" /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="پرداخت‌ها" />
          <ul className="divide-y divide-line">
            {p.payments.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">پرداختی ثبت نشده است.</li>}
            {p.payments.map(({ payment: pay, orderCode }) => (
              <li key={pay.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                <OrderCode code={orderCode} />
                <span>{pay.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[pay.method]}</span>
                <Money rial={pay.amount} strong />
                <Status map={PAYMENT_RECORD_STATUS} value={pay.status} />
                <DateText value={pay.createdAt} className="ms-auto text-[12px] text-muted" />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="فاکتورها" />
          <ul className="divide-y divide-line">
            {p.invoices.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">فاکتوری صادر نشده است.</li>}
            {p.invoices.map(({ invoice: i, orderCode }) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                <b className="tabular">فاکتور {formatNumber(i.number)}</b>
                <span className="text-muted">{INVOICE_TYPE[i.type]}</span>
                <OrderCode code={orderCode} />
                <Money rial={i.total} />
                {i.status === "VOID" && <Badge tone="neutral">باطل</Badge>}
                <Link href={`/panel/invoices/${i.id}`} className="ms-auto font-bold text-accent-ink hover:underline">مشاهده</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
