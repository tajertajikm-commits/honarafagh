import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Inbox, Plus, Receipt, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Code, DateText, EmptyState, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, ReasonAction } from "@/components/panel/actions";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { INQUIRY_STATUS, QUOTE_STATUS } from "@/lib/labels";
import { formatNumber, formatPhone, toFaDigits } from "@/lib/persian";
import { daysAgo, daysAhead } from "@/lib/time";
import { requireStaffPage } from "@/server/http/session";
import { listInquiries, listQuotes } from "@/server/modules/quotes/queries";

export const metadata: Metadata = { title: "فروش" };

const TABS = [
  { key: "inquiries", label: "استعلام‌های باز" },
  { key: "quotes", label: "پیش‌فاکتورهای جاری" },
  { key: "history", label: "سوابق پیش‌فاکتور" },
] as const;

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ workspace: "sales", permission: "quote.view" });
  const perms = ctx.actor.permissions;
  const canManage = perms.has("quote.manage");
  const inquiries = await listInquiries(ctx, { status: ["NEW", "IN_REVIEW"] });
  const current = await listQuotes(ctx, { status: ["DRAFT", "SENT"] });
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? (inquiries.length ? "inquiries" : "quotes");
  const history = tab === "history" ? await listQuotes(ctx, { status: ["ACCEPTED", "CONVERTED", "REJECTED", "EXPIRED", "CANCELLED"] }) : [];
  const recentAll = await listQuotes(ctx);
  const monthAgo = daysAgo(30);
  const soon = daysAhead(2);
  const last30 = recentAll.filter((q) => q.quote.createdAt > monthAgo);
  const decided = last30.filter((q) => ["CONVERTED", "ACCEPTED", "REJECTED", "EXPIRED"].includes(q.quote.status));
  const won = decided.filter((q) => ["CONVERTED", "ACCEPTED"].includes(q.quote.status));
  const counts: Record<string, number> = { inquiries: inquiries.length, quotes: current.length };

  const quoteTable = (rows: typeof current) => (
    <Table>
      <THead><tr><TH>شماره</TH><TH>مشتری</TH><TH>وضعیت</TH><TH className="text-end">مبلغ</TH><TH>اعتبار تا</TH><TH>صادرکننده</TH><TH /></tr></THead>
      <TBody>
        {rows.map(({ quote: q, customerName, companyName, createdBy, orderNumber }) => {
          const expiring = q.status === "SENT" && q.validUntil < soon;
          return (
            <TR key={q.id}>
              <TD><Link href={`/panel/sales/quotes/${q.id}`} className="font-bold tabular hover:text-accent-ink">{toFaDigits(q.number)}</Link></TD>
              <TD><span className="font-bold">{customerName}</span>{companyName && <span className="block text-[12px] text-muted">{companyName}</span>}</TD>
              <TD><Status map={QUOTE_STATUS} value={q.status} />{orderNumber && <span className="ms-2 text-[12px]">→ <OrderNo n={orderNumber} /></span>}</TD>
              <TD className="text-end"><Money rial={q.total} /></TD>
              <TD className={expiring ? "font-bold text-warning" : "text-muted"}><DateText value={q.validUntil} /></TD>
              <TD className="text-[12.5px] text-muted">{createdBy ?? "—"}</TD>
              <TD className="text-end">{canManage && q.status === "DRAFT" && <ActionButton size="xs" path={`quotes/${q.id}/send`} success="پیش‌فاکتور برای مشتری ارسال شد.">ارسال برای مشتری</ActionButton>}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );

  return (
    <>
      <PageHeader
        title="فروش"
        description="استعلام قیمت مشتریان، صدور و پیگیری پیش‌فاکتور و ثبت سفارش تلفنی یا حضوری"
        actions={
          <>
            {canManage && <Button asChild size="sm" variant="secondary"><Link href="/panel/sales/new?mode=quote"><FileText /> پیش‌فاکتور جدید</Link></Button>}
            {perms.has("order.create") && <Button asChild size="sm"><Link href="/panel/sales/new"><Plus /> ثبت سفارش دستی</Link></Button>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="استعلام جدید" value={formatNumber(inquiries.filter((i) => i.inquiry.status === "NEW").length)} tone={inquiries.some((i) => i.inquiry.status === "NEW") ? "accent" : "neutral"} icon={<Inbox />} href="/panel/sales?tab=inquiries" />
        <Stat label="پیش‌فاکتور منتظر پاسخ" value={formatNumber(current.filter((q) => q.quote.status === "SENT").length)} sub={<>ارزش: <Money rial={current.filter((q) => q.quote.status === "SENT").reduce((s, q) => s + q.quote.total, 0)} /></>} icon={<FileText />} href="/panel/sales?tab=quotes" />
        <Stat label="نرخ تبدیل ۳۰ روز" value={decided.length ? `${formatNumber(Math.round((won.length / decided.length) * 100))}٪` : "—"} sub={`${formatNumber(won.length)} از ${formatNumber(decided.length)} پیش‌فاکتور تعیین‌تکلیف‌شده`} icon={<TrendingUp />} />
        <Stat label="فروش از پیش‌فاکتور ۳۰ روز" value={<Money rial={won.reduce((s, q) => s + q.quote.total, 0)} />} icon={<Receipt />} />
      </div>
      <FilterTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/panel/sales?tab=${t.key}`, count: counts[t.key] }))} />
      <Card className="overflow-hidden">
        {tab === "inquiries" && (
          inquiries.length === 0 ? <EmptyState icon={<Inbox />} title="استعلام بازی نیست" /> : (
            <ul className="divide-y divide-line">
              {inquiries.map(({ inquiry: i, customerName, companyName, customerPhone, productName, assignee }) => (
                <li key={i.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-muted">{toFaDigits(i.number)}</span>
                    <span className="font-bold">{i.title}</span>
                    <Status map={INQUIRY_STATUS} value={i.status} />
                    <span className="ms-auto text-[12.5px] text-muted"><DateText value={i.createdAt} relative />{assignee && ` • ${assignee}`}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted">{customerName}{companyName && ` • ${companyName}`} • <Code>{formatPhone(customerPhone)}</Code>{productName && ` • ${productName}`}{i.quantity && ` • تیراژ ${formatNumber(i.quantity)}`}{i.deadline && <> • مهلت <DateText value={i.deadline} /></>}</p>
                  <p className="mt-2 max-w-3xl whitespace-pre-line text-[13.5px] leading-7 text-ink-2">{i.description}</p>
                  {canManage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="xs"><Link href={`/panel/sales/new?mode=quote&inquiry=${i.id}`}>صدور پیش‌فاکتور</Link></Button>
                      {i.status === "NEW" && <ActionButton size="xs" variant="secondary" path={`inquiries/${i.id}/status`} body={{ status: "IN_REVIEW" }} success="استعلام به شما سپرده شد.">برداشتن برای بررسی</ActionButton>}
                      <ReasonAction size="xs" variant="ghost" path={`inquiries/${i.id}/status`} extraBody={{ status: "REJECTED" }} title="رد استعلام" description="دلیل برای سوابق فروش ثبت می‌شود." success="استعلام رد شد.">رد</ReasonAction>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "quotes" && (current.length === 0 ? <EmptyState icon={<FileText />} title="پیش‌فاکتور جاری وجود ندارد" /> : quoteTable(current))}
        {tab === "history" && (history.length === 0 ? <EmptyState title="سابقه‌ای نیست" /> : quoteTable(history))}
      </Card>
    </>
  );
}
