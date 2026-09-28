import Link from "next/link";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { DateText } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/panel/page";
import { PricingAdmin } from "@/components/panel/pricing-admin";
import { cn } from "@/lib/cn";
import { formatNumber, toFaDigits } from "@/lib/persian";
import { materials } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { builderProducts } from "@/server/modules/catalog/queries";
import { getRuleVersion, listRuleSets } from "@/server/modules/pricing/service";

export const metadata: Metadata = { title: "قیمت‌گذاری" };

const STATUS: Record<string, [string, "success" | "warning" | "neutral"]> = { PUBLISHED: ["منتشرشده", "success"], DRAFT: ["پیش‌نویس", "warning"], ARCHIVED: ["بایگانی", "neutral"] };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ version?: string; product?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "pricing.view" });
  const sets = await listRuleSets(ctx);
  const all = sets.flatMap((s) => s.versions);
  const chosenId = (sp.version && all.some((v) => v.id === sp.version) ? sp.version : undefined) ?? all.find((v) => v.status === "DRAFT")?.id ?? all.find((v) => v.status === "PUBLISHED")?.id;
  const version = chosenId ? await getRuleVersion(ctx, chosenId) : null;
  const set = sets.find((s) => s.id === version?.ruleSetId);
  const publishedId = set?.versions.find((v) => v.status === "PUBLISHED")?.id ?? null;
  const mats = await ctx.db.select({ sku: materials.sku, name: materials.name, unit: materials.unit, standardCost: materials.standardCost }).from(materials).where(eq(materials.isActive, true)).orderBy(asc(materials.categoryCode), asc(materials.name));
  const products = await builderProducts(ctx.db);
  return (
    <>
      <PageHeader title="قیمت‌گذاری" description="قوانین قیمت نسخه‌دار است: پیش‌نویس ← آزمون در شبیه‌ساز ← انتشار. هر سفارش و پیش‌فاکتور، نسخه و ریز محاسبه زمان ثبت خود را نگه می‌دارد." />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          {sets.map((s) => (
            <div key={s.id} className="border-b border-line last:border-b-0">
              <p className="px-4 pt-3 text-[13px] font-bold">{s.name}<span className="ms-1 text-[11.5px] font-medium text-muted">• {formatNumber(s.productCount)} محصول</span></p>
              <ul className="py-2">
                {s.versions.map((v) => (
                  <li key={v.id}>
                    <Link href={`/panel/pricing?version=${v.id}`} className={cn("flex items-center justify-between gap-2 px-4 py-1.5 text-[12.5px]", v.id === chosenId ? "bg-surface-2 font-bold" : "hover:bg-surface-2/60")}>
                      <span>نسخه {toFaDigits(v.version)} <span className="block text-[11px] font-medium text-muted"><DateText value={v.publishedAt ?? v.createdAt} /></span></span>
                      <Badge tone={STATUS[v.status]?.[1] ?? "neutral"}>{STATUS[v.status]?.[0] ?? v.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
        {version ? (
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-bold">{set?.name} • نسخه {toFaDigits(version.version)}</h2>
              <Badge tone={STATUS[version.status]?.[1] ?? "neutral"}>{STATUS[version.status]?.[0]}</Badge>
              {version.notes && <span className="text-[13px] text-muted">— {version.notes}</span>}
            </div>
            <PricingAdmin
              key={version.id}
              version={{ id: version.id, ruleSetId: version.ruleSetId, version: version.version, status: version.status, notes: version.notes, data: version.data as never }}
              publishedId={publishedId}
              perms={[...ctx.actor.permissions]}
              materials={mats}
              products={products}
              initialProductId={sp.product}
            />
          </div>
        ) : <Card className="p-8 text-center text-muted">نسخه‌ای تعریف نشده است.</Card>}
      </div>
    </>
  );
}
