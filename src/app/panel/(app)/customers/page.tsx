import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Code, DateText, EmptyState, Money } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CustomerFormButton } from "@/components/panel/customer-form";
import { PageHeader } from "@/components/panel/page";
import { Pagination } from "@/components/panel/pagination";
import { SearchBox } from "@/components/panel/search-box";
import { formatNumber, formatPercent, formatPhone } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { listCustomers } from "@/server/modules/people/service";

export const metadata: Metadata = { title: "مشتریان" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "customer.view" });
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total, pageSize } = await listCustomers(ctx, { q: sp.q, page, pageSize: 25 });
  return (
    <>
      <PageHeader title="مشتریان" description={`${formatNumber(total)} مشتری`} actions={ctx.actor.permissions.has("customer.manage") && <CustomerFormButton />} />
      <div className="mb-4 flex justify-end"><SearchBox placeholder="نام، شرکت یا موبایل" /></div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={<Users />} title="مشتری‌ای پیدا نشد" /> : (
          <Table>
            <THead><tr><TH>مشتری</TH><TH>موبایل</TH><TH className="text-end">سفارش</TH><TH className="text-end">خرید کل</TH><TH className="text-end">مانده</TH><TH>تخفیف ثابت</TH><TH>آخرین سفارش</TH></tr></THead>
            <TBody>
              {rows.map(({ c, orderCount, revenue, balance, lastOrderAt }) => (
                <TR key={c.id}>
                  <TD><Link href={`/panel/customers/${c.id}`} className="font-bold hover:text-accent-ink">{c.fullName}</Link>{c.companyName && <span className="block text-[12px] text-muted">{c.companyName}</span>}</TD>
                  <TD><Code>{formatPhone(c.phone)}</Code></TD>
                  <TD className="text-end tabular">{formatNumber(orderCount)}</TD>
                  <TD className="text-end"><Money rial={revenue} /></TD>
                  <TD className={`text-end ${balance > 0 ? "text-danger" : "text-muted"}`}>{balance > 0 ? <Money rial={balance} /> : "—"}</TD>
                  <TD className="text-muted">{c.discountPct ? formatPercent(c.discountPct) : "—"}</TD>
                  <TD className="text-muted"><DateText value={lastOrderAt} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => `/panel/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`} />
      </Card>
    </>
  );
}
