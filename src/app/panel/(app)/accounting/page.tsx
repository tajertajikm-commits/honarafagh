import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, CircleDollarSign, Clock, RotateCcw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, EmptyState, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarList } from "@/components/panel/charts";
import { MoneyDialogButton, PaymentDecision } from "@/components/panel/finance-actions";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_RECORD_STATUS } from "@/lib/labels";
import { formatNumber, formatPhone, formatToman } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { financeSummary, paymentLedger, receivables, refundsDue } from "@/server/modules/finance/queries";

export const metadata: Metadata = { title: "مالی" };

const TABS = [
  { key: "approvals", label: "در انتظار تأیید" },
  { key: "receivables", label: "مطالبات" },
  { key: "refunds", label: "بازپرداخت‌ها" },
  { key: "cheques", label: "چک‌ها" },
  { key: "ledger", label: "دفتر دریافت و پرداخت" },
] as const;

const daysSince = (d: Date | null, now = new Date()) => (d ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : 0);

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ workspace: "accounting", permission: "payment.view" });
  const perms = ctx.actor.permissions;
  const summary = await financeSummary(ctx);
  const recv = await receivables(ctx);
  const refunds = await refundsDue(ctx);
  const approvals = await paymentLedger(ctx, { status: ["AWAITING_APPROVAL"], limit: 200 });
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? (approvals.length ? "approvals" : "receivables");
  const cheques = tab === "cheques" ? await paymentLedger(ctx, { method: "CHEQUE", limit: 200 }) : [];
  const ledger = tab === "ledger" ? await paymentLedger(ctx, { limit: 150 }) : [];
  const readyBlocked = recv.filter((r) => r.status === "READY");
  const counts: Record<string, number> = { approvals: approvals.length, receivables: recv.length, refunds: refunds.length };

  const paymentRows = (rows: typeof approvals, withDecision: boolean) => (
    <Table>
      <THead><tr><TH>شماره</TH><TH>سفارش</TH><TH>مشتری</TH><TH>روش</TH><TH className="text-end">مبلغ</TH><TH>مرجع</TH><TH>زمان</TH><TH>وضعیت</TH><TH /></tr></THead>
      <TBody>
        {rows.map(({ payment: p, orderNumber, customerName, createdBy }) => (
          <TR key={p.id}>
            <TD className="tabular text-muted">{formatNumber(p.number).replace(/٬/g, "")}</TD>
            <TD><Link href={`/panel/orders/${p.orderId}`} className="hover:text-accent-ink"><OrderNo n={orderNumber} /></Link></TD>
            <TD>{customerName}</TD>
            <TD>{p.kind === "REFUND" ? <Badge tone="warning">بازپرداخت • {PAYMENT_METHOD[p.method]}</Badge> : PAYMENT_METHOD[p.method]}</TD>
            <TD className="text-end"><Money rial={p.amount} strong /></TD>
            <TD className="text-[12.5px]">
              {p.reference || p.providerRefId ? <Code>{p.reference ?? p.providerRefId}</Code> : "—"}
              {p.chequeDueDate && <span className="block text-muted">سررسید <DateText value={p.chequeDueDate} /></span>}
              {p.receiptFileId && <a className="block font-bold text-accent-ink" href={`/api/v1/files/${p.receiptFileId}?inline=1`} target="_blank" rel="noreferrer">مشاهده رسید</a>}
            </TD>
            <TD className="text-[12.5px] text-muted"><DateText value={p.createdAt} withTime />{createdBy && <span className="block">{createdBy}</span>}</TD>
            <TD><Status map={PAYMENT_RECORD_STATUS} value={p.status} />{p.rejectionReason && <span className="block max-w-[160px] truncate text-[11.5px] text-danger" title={p.rejectionReason}>{p.rejectionReason}</span>}</TD>
            <TD className="text-end">{withDecision && p.status === "AWAITING_APPROVAL" && perms.has("payment.approve") && <PaymentDecision paymentId={p.id} />}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <>
      <PageHeader title="مالی" description="تأیید پرداخت‌ها، پیگیری مطالبات و تسویه، بازپرداخت و دفتر دریافت‌ها" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="دریافت امروز" value={<Money rial={summary.today} />} sub={<>۳۰ روز اخیر: <Money rial={summary.last30} /></>} icon={<CircleDollarSign />} />
        <Stat label="در انتظار تأیید" value={formatNumber(summary.pendingCount)} sub={<Money rial={summary.pendingAmount} />} tone={summary.pendingCount ? "accent" : "neutral"} icon={<Clock />} href="/panel/accounting?tab=approvals" />
        <Stat label="مانده مطالبات" value={<Money rial={summary.outstanding} />} sub={`${formatNumber(summary.outstandingCount)} سفارش • ${formatNumber(readyBlocked.length)} آماده تحویل`} tone={readyBlocked.length ? "warning" : "neutral"} icon={<Wallet />} href="/panel/accounting?tab=receivables" />
        <Stat label="بازپرداخت معوق" value={formatNumber(refunds.length)} sub={<>بازپرداخت ۳۰ روز: <Money rial={summary.refunds30} /></>} tone={refunds.length ? "danger" : "neutral"} icon={<RotateCcw />} href="/panel/accounting?tab=refunds" />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <FilterTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/panel/accounting?tab=${t.key}`, count: counts[t.key] }))} />
          <Card className="overflow-hidden">
            {tab === "approvals" && (approvals.length === 0 ? <EmptyState icon={<BadgeCheck />} title="پرداختی در انتظار تأیید نیست" /> : paymentRows(approvals, true))}

            {tab === "receivables" && (
              recv.length === 0 ? <EmptyState icon={<BadgeCheck />} title="همه سفارش‌ها تسویه شده‌اند" /> : (
                <Table>
                  <THead><tr><TH>سفارش</TH><TH>مشتری</TH><TH>وضعیت</TH><TH className="text-end">مبلغ کل</TH><TH className="text-end">پرداخت‌شده</TH><TH className="text-end">مانده</TH><TH>سن</TH><TH /></tr></THead>
                  <TBody>
                    {recv.map((r) => (
                      <TR key={r.id}>
                        <TD><Link href={`/panel/orders/${r.id}`} className="hover:text-accent-ink"><OrderNo n={r.number} /></Link></TD>
                        <TD><span className="font-bold">{r.customerName}</span><span className="block text-[11.5px] text-muted">{r.companyName ?? <Code>{formatPhone(r.customerPhone)}</Code>}</span></TD>
                        <TD><Status map={ORDER_STATUS} value={r.status} />{r.status === "READY" && <span className="block text-[11.5px] text-warning">تحویل منوط به تسویه</span>}</TD>
                        <TD className="text-end text-muted"><Money rial={r.total} unit={false} /></TD>
                        <TD className="text-end"><Money rial={r.paid} unit={false} />{r.pendingApproval > 0 && <span className="block text-[11.5px] text-info">+{formatToman(r.pendingApproval, { unit: false })} در انتظار</span>}</TD>
                        <TD className="text-end"><Money rial={r.balance} strong /></TD>
                        <TD className={daysSince(r.placedAt) > 30 ? "font-bold text-danger" : "text-muted"}>{formatNumber(daysSince(r.placedAt))} روز</TD>
                        <TD className="text-end">{perms.has("payment.create") && <MoneyDialogButton size="xs" orderId={r.id} mode="pay" defaultAmount={r.balance} label="تسویه" />}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )
            )}

            {tab === "refunds" && (
              refunds.length === 0 ? <EmptyState icon={<BadgeCheck />} title="بازپرداخت معوقی وجود ندارد" description="سفارش‌های لغوشده یا کاهش‌یافته که بیش از مبلغشان پرداخت شده، اینجا نمایش داده می‌شوند." /> : (
                <Table>
                  <THead><tr><TH>سفارش</TH><TH>مشتری</TH><TH>وضعیت</TH><TH className="text-end">مبلغ سفارش</TH><TH className="text-end">پرداخت‌شده</TH><TH className="text-end">قابل بازپرداخت</TH><TH /></tr></THead>
                  <TBody>
                    {refunds.map((r) => (
                      <TR key={r.id}>
                        <TD><Link href={`/panel/orders/${r.id}`} className="hover:text-accent-ink"><OrderNo n={r.number} /></Link></TD>
                        <TD>{r.customerName}</TD>
                        <TD><Status map={ORDER_STATUS} value={r.status} /></TD>
                        <TD className="text-end text-muted"><Money rial={r.status === "CANCELLED" ? 0 : r.total} unit={false} /></TD>
                        <TD className="text-end"><Money rial={r.paid} unit={false} /></TD>
                        <TD className="text-end text-danger"><Money rial={r.excess} strong /></TD>
                        <TD className="text-end">{perms.has("payment.refund") && <MoneyDialogButton size="xs" orderId={r.id} mode="refund" defaultAmount={r.excess} maxAmount={r.paid} />}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )
            )}

            {tab === "cheques" && (cheques.length === 0 ? <EmptyState title="چکی ثبت نشده است" /> : paymentRows(cheques, true))}
            {tab === "ledger" && paymentRows(ledger, false)}
          </Card>
        </div>
        <aside className="grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <Card>
            <CardHeader title="دریافت به تفکیک روش" description="۳۰ روز اخیر، پرداخت‌های قطعی" />
            <CardBody className="pt-0">
              <BarList data={summary.byMethod.sort((a, b) => b.amount - a.amount).map((m) => ({ label: PAYMENT_METHOD[m.method] ?? m.method, value: m.amount, display: formatToman(m.amount) }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="آماده تحویل با مانده" description="تا تسویه یا مجوز مدیر، تحویل انجام نمی‌شود" />
            <CardBody className="space-y-2 pt-0">
              {readyBlocked.length === 0 ? <p className="text-[13px] text-muted">موردی نیست.</p> : readyBlocked.map((r) => (
                <Link key={r.id} href={`/panel/orders/${r.id}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[12.5px] hover:border-line-strong">
                  <span><OrderNo n={r.number} /> • {r.customerName}</span>
                  <Money rial={r.balance} strong />
                </Link>
              ))}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
