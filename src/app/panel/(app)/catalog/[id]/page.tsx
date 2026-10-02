import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/panel/page";
import { ProductEditor, type ProductDef } from "@/components/panel/product-editor";
import { productCategories, pricingRuleSets } from "@/server/db/schema";
import { isAppError } from "@/server/core/errors";
import { requireStaffPage } from "@/server/http/session";
import { productDefinitionFor } from "@/server/modules/catalog/admin";

export const metadata: Metadata = { title: "ویرایش محصول" };

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStaffPage({ permission: "catalog.manage" });
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const categories = await ctx.db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories).orderBy(asc(productCategories.sortOrder));
  const ruleSets = await ctx.db.select({ id: pricingRuleSets.id, name: pricingRuleSets.name }).from(pricingRuleSets).orderBy(asc(pricingRuleSets.name));
  let initial: ProductDef;
  if (isNew) {
    initial = {
      slug: "",
      name: "",
      subtitle: null,
      description: null,
      categoryId: categories[0]?.id ?? null,
      pricingRuleSetId: ruleSets[0]?.id ?? "",
      spec: { defaultTrim: { w: 85, h: 50 }, components: [{ key: "main", name: "بدنه", leaf: "TRIM", leaves: { mode: "FIXED", count: 1 }, bleedMm: 3, defaults: { colorsFront: 4, colorsBack: 0 } }], baseOperations: [{ code: "CUTTING" }], methodSelection: "CHEAPEST" },
      unitLabel: "عدد",
      minQuantity: 100,
      maxQuantity: null,
      quantityStep: 100,
      quantityPresets: [100, 500, 1000],
      requiresArtwork: true,
      offersDesignService: false,
      isActive: false,
      isFeatured: false,
      highlights: [],
      imageUrl: null,
      methods: [{ methodCode: "DIGITAL", minQuantity: 1, maxQuantity: null }],
      groups: [],
    };
  } else {
    try {
      initial = (await productDefinitionFor(ctx, id)) as ProductDef;
    } catch (err) {
      if (isAppError(err) && err.code === "NOT_FOUND") notFound();
      throw err;
    }
  }
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/catalog", label: "محصولات" }]}
        title={isNew ? "محصول جدید" : initial.name}
        description={isNew ? "محصول جدید غیرفعال ساخته می‌شود تا پس از آزمون قیمت در شبیه‌ساز، فعال شود." : "تغییرات روی سفارش‌های ثبت‌شده اثری ندارد؛ آن‌ها قیمت و مشخصات خود را نگه می‌دارند."}
        actions={!isNew && <><Button asChild size="sm" variant="secondary"><Link href={`/panel/pricing?product=${id}`}>آزمون قیمت</Link></Button><Button asChild size="sm" variant="secondary"><Link href={`/p/${initial.slug}`} target="_blank">مشاهده در فروشگاه</Link></Button></>}
      />
      <ProductEditor productId={isNew ? null : id} initial={initial} categories={categories} ruleSets={ruleSets} />
    </>
  );
}
