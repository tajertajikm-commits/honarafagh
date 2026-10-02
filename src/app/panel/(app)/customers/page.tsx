import Link from "next/link";
import type { Metadata } from "next";
import { CustomerCode, DateText, EmptyState, Money } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/panel/page";
import { Pagination } from "@/components/panel/pagination";
import { SearchBox } from "@/components/panel/search-box";
import { requireStaffPage } from "@/server/http/session";
import { listCustomers } from "@/server/modules/people/service";
import { CUSTOMER_TYPE } from "@/lib/labels";
import { formatNumber, formatPhone } from "@/lib/persian";

export const metadata: Metadata = { title: "مشتریان" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const ctx = await requireStaffPage({ permission: "customer.view" });
  const sp = await searchParams;
  const r = await listCustomers(ctx, { q: sp.q, page: Number(sp.page) || 1 });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="مشتریان" description="جستجو با کد مشتری (CUS-1042)، نام، شرکت یا موبایل." />
      <div className="mb-4"><SearchBox placeholder="CUS-1042، نام، شرکت یا موبایل…" /></div>
      {r.rows.length === 0 ? (
        <EmptyState title="مشتری‌ای پیدا نشد" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <Table>
            <THead>
              <TR><TH>کد</TH><TH>مشتری</TH><TH>نوع</TH><TH>موبایل</TH><TH className="text-end">سفارش‌ها</TH><TH className="text-end">مانده</TH><TH>آخرین سفارش</TH></TR>
            </THead>
            <TBody>
              {r.rows.map(({ c, orderCount, balance, lastOrderAt }) => (
                <TR key={c.id}>
                  <TD><Link href={`/panel/customers/CUS-${c.code}`} className="font-bold hover:underline"><CustomerCode code={c.code} /></Link></TD>
                  <TD><Link href={`/panel/customers/CUS-${c.code}`} className="font-bold hover:underline">{c.companyName || c.fullName}</Link>{c.companyName && <span className="block text-[12px] text-muted">{c.fullName}</span>}</TD>
                  <TD><Badge tone={c.type === "COMPANY" ? "violet" : "neutral"}>{CUSTOMER_TYPE[c.type]}</Badge></TD>
                  <TD><bdi dir="ltr" className="text-[13px]">{formatPhone(c.phone)}</bdi></TD>
                  <TD className="text-end tabular">{formatNumber(orderCount)}</TD>
                  <TD className="text-end">{balance > 0 ? <Money rial={balance} className="text-danger" /> : "—"}</TD>
                  <TD><DateText value={lastOrderAt} relative className="text-[12.5px] text-muted" /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      <Pagination page={r.page} pageSize={r.pageSize} total={r.total} href={(p) => `/panel/customers?page=${p}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} />
    </div>
  );
}
