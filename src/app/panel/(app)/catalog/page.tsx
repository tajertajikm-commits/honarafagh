import Link from "next/link";
import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Code, Money } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton } from "@/components/panel/actions";
import { PageHeader } from "@/components/panel/page";
import { METHOD } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { productCategories, productMethods, products } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { startingPrice } from "@/server/modules/catalog/storefront";

export const metadata: Metadata = { title: "محصولات" };

export default async function CatalogPage() {
  const ctx = await requireStaffPage({ permission: "catalog.manage" });
  const rows = await ctx.db
    .select({
      p: products,
      category: productCategories.name,
      groups: sql<number>`(select count(*) from product_option_groups g where g.product_id = ${products.id})::int`,
      orders30: sql<number>`(select count(*) from order_items i join orders o on o.id = i.order_id where i.product_id = ${products.id} and o.created_at > now() - interval '30 days' and o.status <> 'CANCELLED')::int`,
    })
    .from(products)
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
    .orderBy(asc(products.sortOrder), asc(products.name));
  const methods = await ctx.db.select().from(productMethods);
  const prices = new Map<string, number | null>();
  for (const r of rows) prices.set(r.p.id, r.p.isActive ? ((await startingPrice(ctx.db, r.p).catch(() => null))?.subtotal ?? null) : null);
  return (
    <>
      <PageHeader
        title="محصولات"
        description="تعریف محصول، گزینه‌ها و روش‌های تولید. قیمت از قوانین نسخه‌دار قیمت‌گذاری محاسبه می‌شود."
        actions={<Button asChild size="sm"><Link href="/panel/catalog/new"><Plus /> محصول جدید</Link></Button>}
      />
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><TH>محصول</TH><TH>دسته</TH><TH>روش‌ها</TH><TH className="text-end">گروه گزینه</TH><TH className="text-end">شروع قیمت</TH><TH className="text-end">سفارش ۳۰ روز</TH><TH>وضعیت</TH><TH /></tr></THead>
          <TBody>
            {rows.map(({ p, category, groups, orders30 }) => (
              <TR key={p.id} className={p.isActive ? undefined : "opacity-60"}>
                <TD><Link href={`/panel/catalog/${p.id}`} className="font-bold hover:text-accent-ink">{p.name}</Link><span className="block text-[11.5px] text-muted"><Code>/p/{p.slug}</Code></span></TD>
                <TD className="text-muted">{category ?? "—"}</TD>
                <TD><div className="flex flex-wrap gap-1">{methods.filter((m) => m.productId === p.id).map((m) => <Badge key={m.methodCode} tone={m.methodCode === "OFFSET" ? "accent" : "info"}>{METHOD[m.methodCode] ?? m.methodCode} {m.maxQuantity ? `تا ${formatNumber(m.maxQuantity)}` : m.minQuantity > 1 ? `از ${formatNumber(m.minQuantity)}` : ""}</Badge>)}</div></TD>
                <TD className="text-end tabular">{formatNumber(groups)}</TD>
                <TD className="text-end">{prices.get(p.id) ? <Money rial={prices.get(p.id)!} /> : "—"}</TD>
                <TD className="text-end tabular">{formatNumber(orders30)}</TD>
                <TD>{p.isActive ? <Badge tone="success" dot>فعال</Badge> : <Badge dot>غیرفعال</Badge>}{p.isFeatured && <Badge tone="violet" className="ms-1">ویژه</Badge>}</TD>
                <TD className="text-end"><ActionButton size="xs" variant="ghost" path={`catalog/products/${p.id}/active`} body={{ isActive: !p.isActive }} success={p.isActive ? "محصول از فروشگاه خارج شد." : "محصول فعال شد."}>{p.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}</ActionButton></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
