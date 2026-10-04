import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { CustomerCode, DateText, EmptyState, Money, OrderCode } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, ReasonAction } from "@/components/panel/actions";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { SearchBox } from "@/components/panel/search-box";
import { TypeChip } from "@/components/panel/chips";
import { can } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { accountingOrders, accountingSummary, invoiceList, paymentLedger, type AccountingFilter } from "@/server/modules/finance/queries";
import { CUSTOMER_TYPE, INVOICE_TYPE, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_RECORD_STATUS, PAYMENT_STATUS } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { withBase } from "@/lib/base-path";

export const metadata: Metadata = { title: "حسابداری و فاکتور" };

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ tab?: string; filter?: string; q?: string }> }) {
  const ctx = await requireStaffPage({ anyOf: ["payment.view", "invoice.manage"] });
  const sp = await searchParams;
  const tab = sp.tab === "payments" || sp.tab === "invoices" ? sp.tab : "orders";
  const filter = (["open", "unpaid", "unpriced", "all"].includes(sp.filter ?? "") ? sp.filter : "open") as AccountingFilter;
  const summary = await accountingSummary(ctx);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="حسابداری و فاکتور" description="سفارش‌ها و مانده حساب، پرداخت‌ها و فاکتورهای رسمی و غیررسمی." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="مطالبات" value={<Money rial={summary.receivable} />} tone="warning" />
        <Stat label="سفارش با مانده" value={formatNumber(summary.unpaidOrders)} href="/panel/accounting?filter=unpaid" />
        <Stat label="بدون قیمت" value={formatNumber(summary.unpriced)} href="/panel/accounting?filter=unpriced" tone={summary.unpriced ? "warning" : "neutral"} />
        <Stat label="پرداخت منتظر تأیید" value={formatNumber(summary.paymentsToConfirm)} href="/panel/accounting?tab=payments" tone={summary.paymentsToConfirm ? "warning" : "neutral"} />
      </div>
      <FilterTabs
        active={tab}
        tabs={[
          { key: "orders", label: "سفارش‌ها و مانده", href: "/panel/accounting" },
          { key: "payments", label: "پرداخت‌ها", href: "/panel/accounting?tab=payments", count: summary.paymentsToConfirm || undefined },
          { key: "invoices", label: "فاکتورها", href: "/panel/accounting?tab=invoices" },
        ]}
      />
      {tab === "orders" && <Orders ctx={ctx} filter={filter} q={sp.q} />}
      {tab === "payments" && <Payments ctx={ctx} />}
      {tab === "invoices" && <Invoices ctx={ctx} />}
    </div>
  );
}

async function Orders({ ctx, filter, q }: { ctx: Parameters<typeof accountingOrders>[0]; filter: AccountingFilter; q?: string }) {
  const rows = await accountingOrders(ctx, { filter, q });
  const link = (f: string) => `/panel/accounting?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="کد سفارش، CUS-…، نام یا شرکت" />
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-[13px] font-bold">
          {[
            ["open", "باز"],
            ["unpaid", "دارای مانده"],
            ["unpriced", "بدون قیمت"],
            ["all", "همه"],
          ].map(([k, l]) => (
            <Link key={k} href={link(k!)} className={`rounded-md px-3 py-1.5 ${filter === k ? "bg-surface shadow-soft" : "text-muted"}`}>{l}</Link>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="موردی نیست" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <Table>
            <THead>
              <TR>
                <TH>سفارش</TH>
                <TH>مشتری</TH>
                <TH>وضعیت</TH>
                <TH className="text-end">مبلغ</TH>
                <TH className="text-end">پرداخت‌شده</TH>
                <TH className="text-end">مانده</TH>
                <TH>پرداخت</TH>
                <TH>فاکتور</TH>
                <TH>گزارش کار</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/panel/orders/${r.code}?tab=finance`} className="hover:underline"><OrderCode code={r.code} /></Link> <TypeChip type={r.productionType} className="h-5 text-[11px]" />
                    <span className="block max-w-56 truncate text-[12px] text-muted">{r.title}</span>
                  </TD>
                  <TD>
                    <Link href={`/panel/customers/CUS-${r.customerCode}`} className="block text-[13px] font-bold hover:underline">{r.companyName || r.customerName}</Link>
                    <span className="text-[11.5px] text-muted"><CustomerCode code={r.customerCode} /> • {CUSTOMER_TYPE[r.customerType]}</span>
                  </TD>
                  <TD><Status map={ORDER_STATUS} value={r.status} /></TD>
                  <TD className="text-end">{r.pricedAt ? <Money rial={r.total} /> : <Badge tone="warning">تعیین نشده</Badge>}</TD>
                  <TD className="text-end"><Money rial={r.paid} /></TD>
                  <TD className="text-end">{r.pricedAt ? <Money rial={Math.max(0, r.balance)} strong className={r.balance > 0 ? "text-danger" : ""} /> : "—"}</TD>
                  <TD>{r.pricedAt ? <Status map={PAYMENT_STATUS} value={r.paymentStatus} /> : "—"}</TD>
                  <TD>{r.invoiceCount > 0 ? <Badge tone="success">{formatNumber(r.invoiceCount)} فاکتور</Badge> : <span className="text-[12px] text-muted">—</span>}</TD>
                  <TD><Link href={`/panel/order-report/${r.code}`} className="text-[12.5px] font-bold text-accent-ink hover:underline">PDF</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </>
  );
}

async function Payments({ ctx }: { ctx: Parameters<typeof paymentLedger>[0] }) {
  const pending = await paymentLedger(ctx, { status: ["AWAITING_APPROVAL"] });
  const recent = await paymentLedger(ctx, { limit: 60 });
  return (
    <div className="space-y-5">
      {pending.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-warning/40 bg-surface shadow-card">
          <h2 className="border-b border-line bg-warning-soft/50 px-5 py-3 text-[15px] font-bold">منتظر تأیید ({formatNumber(pending.length)})</h2>
          <ul className="divide-y divide-line">
            {pending.map(({ payment: p, orderCode, customerName }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13.5px]">
                <Link href={`/panel/orders/${orderCode}?tab=finance`} className="hover:underline"><OrderCode code={orderCode} /></Link>
                <span>{customerName}</span>
                <span className="font-bold"><Money rial={p.amount} /></span>
                <span className="text-muted">{PAYMENT_METHOD[p.method]}{p.reference ? ` • ${p.reference}` : ""}</span>
                {p.receiptFileId && <a href={withBase(`/api/v1/files/${p.receiptFileId}?inline=1`)} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">رسید</a>}
                {can(ctx, "payment.record") && (
                  <span className="ms-auto flex gap-2">
                    <ActionButton path={`payments/${p.id}/approve`} success="پرداخت تأیید شد." size="sm">تأیید</ActionButton>
                    <ReasonAction path={`payments/${p.id}/reject`} title="رد پرداخت" success="پرداخت رد شد." danger confirmLabel="رد">رد</ReasonAction>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <Table>
          <THead>
            <TR><TH>تاریخ</TH><TH>سفارش</TH><TH>مشتری</TH><TH>روش</TH><TH className="text-end">مبلغ</TH><TH>وضعیت</TH><TH>ثبت‌کننده</TH></TR>
          </THead>
          <TBody>
            {recent.map(({ payment: p, orderCode, customerName, createdByName }) => (
              <TR key={p.id}>
                <TD><DateText value={p.createdAt} withTime className="text-[12.5px]" /></TD>
                <TD><Link href={`/panel/orders/${orderCode}?tab=finance`} className="hover:underline"><OrderCode code={orderCode} /></Link></TD>
                <TD>{customerName}</TD>
                <TD>{p.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[p.method]}</TD>
                <TD className="text-end"><Money rial={p.kind === "REFUND" ? -p.amount : p.amount} /></TD>
                <TD><Status map={PAYMENT_RECORD_STATUS} value={p.status} /></TD>
                <TD className="text-[12.5px] text-muted">{createdByName ?? (p.method === "ONLINE" ? "درگاه" : "—")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

async function Invoices({ ctx }: { ctx: Parameters<typeof invoiceList>[0] }) {
  const rows = await invoiceList(ctx);
  if (rows.length === 0) return <EmptyState title="هنوز فاکتوری صادر نشده" description="از صفحه هر سفارش (بخش مالی) فاکتور رسمی یا غیررسمی صادر کنید." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <Table>
        <THead>
          <TR><TH>شماره</TH><TH>نوع</TH><TH>سفارش</TH><TH>مشتری</TH><TH className="text-end">مبلغ</TH><TH>تاریخ</TH><TH /></TR>
        </THead>
        <TBody>
          {rows.map(({ invoice: i, orderCode, customerName, customerCode }) => (
            <TR key={i.id} className={i.status === "VOID" ? "opacity-55" : undefined}>
              <TD className="font-bold tabular">{formatNumber(i.number)}</TD>
              <TD>{INVOICE_TYPE[i.type]} {i.status === "VOID" && <Badge tone="neutral">باطل</Badge>}</TD>
              <TD><OrderCode code={orderCode} /></TD>
              <TD>{customerName} <CustomerCode code={customerCode} className="text-[11.5px] text-muted" /></TD>
              <TD className="text-end"><Money rial={i.total} /></TD>
              <TD><DateText value={i.issuedAt} /></TD>
              <TD><Link href={`/panel/invoices/${i.id}`} className="font-bold text-accent-ink hover:underline">مشاهده / PDF</Link></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
