import Link from "next/link";
import type { Metadata } from "next";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Code, EmptyState, Money, Num } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { SearchBox } from "@/components/panel/search-box";
import { ReceiveStockButton } from "@/components/panel/inventory-actions";
import { UNIT } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { listCategoriesAndLocations, listStock } from "@/server/modules/inventory/queries";

export const metadata: Metadata = { title: "موجودی کالا" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; low?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "inventory.view" });
  const { categories, locations } = await listCategoriesAndLocations(ctx);
  const all = await listStock(ctx, { q: sp.q });
  const rows = all.filter((r) => (!sp.cat || r.categoryCode === sp.cat) && (!sp.low || r.low));
  const value = all.reduce((s, r) => s + r.onHand * r.standardCost, 0);
  const reservedValue = all.reduce((s, r) => s + r.reserved * r.standardCost, 0);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, cat: sp.cat, low: sp.low, ...extra })) if (v) p.set(k, v);
    return `/panel/inventory?${p.toString()}`;
  };
  const tabs = [
    { key: "all", label: "همه", href: qs({ cat: undefined, low: undefined }), count: all.length },
    { key: "low", label: "نیازمند سفارش", href: qs({ cat: undefined, low: "1" }), count: all.filter((r) => r.low).length },
    ...categories.map((c) => ({ key: c.code, label: c.name, href: qs({ cat: c.code, low: undefined }), count: all.filter((r) => r.categoryCode === c.code).length })),
  ];
  return (
    <>
      <PageHeader
        title="موجودی کالا"
        description="موجودی فیزیکی، رزروشده برای سفارش‌ها و موجودی آزاد؛ هر تغییر فقط از طریق دفتر تراکنش انبار انجام می‌شود."
        actions={ctx.actor.permissions.has("inventory.receive") && <ReceiveStockButton materials={all.map((r) => ({ id: r.id, sku: r.sku, name: r.name, unit: r.unit }))} locations={locations} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ارزش موجودی" value={<Money rial={value} />} sub="بر اساس بهای استاندارد" />
        <Stat label="ارزش رزروشده" value={<Money rial={reservedValue} />} sub="متعهد به سفارش‌های باز" />
        <Stat label="نیازمند سفارش" value={formatNumber(all.filter((r) => r.low).length)} tone={all.some((r) => r.low) ? "warning" : "neutral"} href={qs({ low: "1", cat: undefined })} />
        <Stat label="دارای کمبود سفارش" value={formatNumber(all.filter((r) => r.shortage > 0).length)} tone={all.some((r) => r.shortage > 0) ? "danger" : "neutral"} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterTabs active={sp.low ? "low" : (sp.cat ?? "all")} tabs={tabs} />
        <SearchBox placeholder="نام یا کد کالا" />
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={<Package />} title="کالایی پیدا نشد" /> : (
          <Table>
            <THead>
              <tr>
                <TH>کالا</TH><TH>گروه</TH><TH className="text-end">موجودی</TH><TH className="text-end">رزرو</TH><TH className="text-end">آزاد</TH><TH className="text-end">در راه</TH><TH className="text-end">نقطه سفارش</TH><TH className="text-end">بهای واحد</TH><TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/panel/inventory/${r.id}`} className="font-bold hover:text-accent-ink">{r.name}</Link><span className="block text-[11.5px] text-muted"><Code>{r.sku}</Code></span></TD>
                  <TD className="text-muted">{r.categoryName}</TD>
                  <TD className="text-end"><Num value={r.onHand} decimals /> <span className="text-[11px] text-muted">{UNIT[r.unit]}</span></TD>
                  <TD className="text-end text-muted"><Num value={r.reserved} decimals /></TD>
                  <TD className={`text-end font-bold ${r.available <= r.reorderPoint ? "text-warning" : ""}`}><Num value={r.available} decimals /></TD>
                  <TD className="text-end text-info">{r.onOrder ? <Num value={r.onOrder} decimals /> : "—"}</TD>
                  <TD className="text-end text-muted"><Num value={r.reorderPoint} /></TD>
                  <TD className="text-end"><Money rial={r.standardCost} unit={false} /></TD>
                  <TD className="text-end">{r.shortage > 0 ? <Badge tone="danger">کمبود {formatNumber(r.shortage, { decimals: true })}</Badge> : r.low ? <Badge tone="warning">سفارش مجدد</Badge> : null}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
