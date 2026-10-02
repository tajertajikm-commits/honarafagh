import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomerCode, DateText, EmptyState, Money, OrderCode } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterTabs, PageHeader } from "@/components/panel/page";
import { SearchBox } from "@/components/panel/search-box";
import { PriorityFlag, TypeChip } from "@/components/panel/chips";
import { can } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { listOrders, type OrderTab } from "@/server/modules/orders/queries";
import { ARTWORK_STATUS, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/labels";

export const metadata: Metadata = { title: "سفارش‌ها" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; type?: string }> }) {
  const ctx = await requireStaffPage();
  const sp = await searchParams;
  const tab = (["approval", "active", "ready", "closed", "all"].includes(sp.tab ?? "") ? sp.tab : "active") as OrderTab;
  const type = sp.type === "DIGITAL" || sp.type === "OFFSET" ? sp.type : undefined;
  const { rows, counts } = await listOrders(ctx, { tab, q: sp.q, type });
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { tab, q: sp.q, type, ...patch };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    return `/panel/orders?${p.toString()}`;
  };
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="سفارش‌ها"
        description="جستجو با کد سفارش (O-1042-0019)، کد مشتری (CUS-1042)، نام یا موبایل."
        actions={
          can(ctx, "order.create") ? (
            <Button asChild><Link href="/panel/orders/new"><Plus className="size-4" /> ثبت سفارش برای مشتری</Link></Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1"><SearchBox placeholder="کد سفارش، کد مشتری، نام یا موبایل…" /></div>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-[13px] font-bold">
          {[
            [undefined, "همه"],
            ["DIGITAL", "دیجیتال"],
            ["OFFSET", "افست"],
          ].map(([k, l]) => (
            <Link key={l} href={qs({ type: k })} className={`rounded-md px-3 py-1.5 ${type === k ? "bg-surface shadow-soft" : "text-muted"}`}>{l}</Link>
          ))}
        </div>
      </div>
      <FilterTabs
        active={tab}
        tabs={[
          { key: "approval", label: "منتظر تأیید", href: qs({ tab: "approval" }), count: counts.approval },
          { key: "active", label: "در تولید", href: qs({ tab: "active" }), count: counts.active },
          { key: "ready", label: "آماده و در حال ارسال", href: qs({ tab: "ready" }), count: counts.ready },
          { key: "closed", label: "بسته‌شده", href: qs({ tab: "closed" }), count: counts.closed },
          { key: "all", label: "همه", href: qs({ tab: "all" }), count: counts.all },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="سفارشی پیدا نشد" description={sp.q ? "عبارت دیگری را امتحان کنید." : undefined} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <Table>
            <THead>
              <TR>
                <TH>سفارش</TH>
                <TH>مشتری</TH>
                <TH>وضعیت</TH>
                <TH>فایل</TH>
                <TH>پرداخت</TH>
                <TH className="text-end">مبلغ</TH>
                <TH>ثبت</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ order: o, customerName, customerCode, companyName }) => (
                <TR key={o.id} className={o.isPriority ? "bg-danger-soft/30" : undefined}>
                  <TD>
                    <Link href={`/panel/orders/${o.code}`} className="block hover:underline">
                      <span className="flex items-center gap-1.5"><OrderCode code={o.code} /> <TypeChip type={o.productionType} className="h-5 text-[11px]" /> {o.isPriority && <PriorityFlag compact className="h-5" />}</span>
                      <span className="block max-w-72 truncate text-[12.5px] text-muted">{o.title}</span>
                    </Link>
                  </TD>
                  <TD>
                    <span className="block text-[13px] font-bold">{companyName || customerName}</span>
                    <CustomerCode code={customerCode} className="text-[11.5px] text-muted" />
                  </TD>
                  <TD><Status map={ORDER_STATUS} value={o.status} /></TD>
                  <TD><Status map={ARTWORK_STATUS} value={o.artworkStatus} /></TD>
                  <TD>{o.pricedAt ? <Status map={PAYMENT_STATUS} value={o.paymentStatus} /> : <Badge tone="warning">بدون قیمت</Badge>}</TD>
                  <TD className="text-end">{o.pricedAt ? <Money rial={o.total} /> : "—"}</TD>
                  <TD><DateText value={o.createdAt} relative className="text-[12.5px] text-muted" /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
