import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateText, EmptyState, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterTabs, PageHeader } from "@/components/panel/page";
import { Pagination } from "@/components/panel/pagination";
import { SearchBox } from "@/components/panel/search-box";
import { DELIVERY_STATUS, FILE_STATUS, ORDER_STATUS, PAYMENT_STATUS, PRIORITY, PRODUCTION_STATUS } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { listOrders } from "@/server/modules/orders/queries";

export const metadata: Metadata = { title: "سفارش‌ها" };

const TABS = [
  { key: "open", label: "باز", status: ["PENDING_REVIEW", "CONFIRMED", "IN_PROGRESS", "ON_HOLD", "READY"] },
  { key: "PENDING_REVIEW", label: "در انتظار بررسی", status: ["PENDING_REVIEW"] },
  { key: "IN_PROGRESS", label: "در تولید", status: ["CONFIRMED", "IN_PROGRESS"] },
  { key: "READY", label: "آماده تحویل", status: ["READY"] },
  { key: "ON_HOLD", label: "متوقف", status: ["ON_HOLD"] },
  { key: "late", label: "دارای تأخیر", status: [] },
  { key: "COMPLETED", label: "تکمیل شده", status: ["COMPLETED"] },
  { key: "CANCELLED", label: "لغو شده", status: ["CANCELLED"] },
  { key: "all", label: "همه", status: [] },
] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; late?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "order.view" });
  const tabKey = sp.late ? "late" : (TABS.find((t) => t.key === sp.status)?.key ?? "open");
  const tab = TABS.find((t) => t.key === tabKey)!;
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total, pageSize } = await listOrders(ctx, { q: sp.q, status: tab.status.length ? [...tab.status] : undefined, late: tabKey === "late", page, pageSize: 25 });
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, ...extra })) if (v) p.set(k, v);
    return `/panel/orders?${p.toString()}`;
  };
  return (
    <>
      <PageHeader title="سفارش‌ها" description={`${formatNumber(total)} سفارش`} actions={ctx.actor.permissions.has("order.create") && <Button asChild size="sm"><Link href="/panel/sales/new"><Plus /> ثبت سفارش دستی</Link></Button>} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterTabs active={tabKey} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.key === "late" ? qs({ late: "1" }) : qs({ status: t.key === "open" ? undefined : t.key }) }))} />
        <SearchBox placeholder="شماره سفارش، نام یا موبایل مشتری" />
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt />} title="سفارشی پیدا نشد" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>سفارش</TH>
                <TH>مشتری</TH>
                <TH>اقلام</TH>
                <TH>وضعیت</TH>
                <TH>پرداخت</TH>
                <TH>فایل</TH>
                <TH>تولید</TH>
                <TH>ارسال</TH>
                <TH className="text-end">مبلغ</TH>
                <TH>موعد</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map(({ order: o, customerName, companyName, items }) => {
                const late = o.dueDate && o.dueDate < new Date() && !["READY", "COMPLETED", "CANCELLED"].includes(o.status);
                return (
                  <TR key={o.id} className="cursor-pointer">
                    <TD>
                      <Link href={`/panel/orders/${o.id}`} className="font-bold hover:text-accent-ink"><OrderNo n={o.number} /></Link>
                      {o.priority !== "NORMAL" && <Status map={PRIORITY} value={o.priority} className="ms-2" />}
                    </TD>
                    <TD><span className="font-bold">{customerName}</span>{companyName && <span className="block text-[12px] text-muted">{companyName}</span>}</TD>
                    <TD className="max-w-[220px]"><span className="line-clamp-2 text-[12.5px] text-ink-2">{items.map((i) => `${i.title} (${formatNumber(i.quantity)})`).join("، ")}</span></TD>
                    <TD><Status map={ORDER_STATUS} value={o.status} /></TD>
                    <TD><Status map={PAYMENT_STATUS} value={o.paymentStatus} /></TD>
                    <TD><Status map={FILE_STATUS} value={o.fileStatus} /></TD>
                    <TD><Status map={PRODUCTION_STATUS} value={o.productionStatus} /></TD>
                    <TD><Status map={DELIVERY_STATUS} value={o.deliveryStatus} /></TD>
                    <TD className="text-end"><Money rial={o.total} /></TD>
                    <TD className={late ? "font-bold text-danger" : "text-muted"}><DateText value={o.dueDate} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => qs({ status: sp.status, late: sp.late, page: String(p) })} />
      </Card>
    </>
  );
}
