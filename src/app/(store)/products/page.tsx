import Link from "next/link";
import type { Metadata } from "next";
import { ProductCard } from "@/components/store/product-card";
import { cn } from "@/lib/cn";
import { storefrontCtx } from "@/server/http/session";
import { listCategories, listProducts } from "@/server/modules/catalog/queries";
import { startingPrice } from "@/server/modules/catalog/storefront";

export const metadata: Metadata = { title: "محصولات" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const ctx = await storefrontCtx();
  const categories = await listCategories(ctx.db);
  const active = categories.find((x) => x.slug === c) ?? null;
  const products = await listProducts(ctx.db, { categoryId: active?.id });
  const cards = [];
  for (const p of products) cards.push({ slug: p.slug, name: p.name, subtitle: p.subtitle, image: p.image?.url ?? null, unitLabel: p.unitLabel, from: await startingPrice(ctx.db, p) });

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="text-[30px] font-bold">{active ? active.name : "همه محصولات"}</h1>
      <p className="mt-2 max-w-2xl text-[14.5px] leading-7 text-muted">{active?.description ?? "محصول را انتخاب کنید، مشخصات را تنظیم کنید و قیمت دقیق را همان لحظه ببینید."}</p>
      <nav className="scrollbar-thin -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="دسته‌بندی">
        <CategoryChip href="/products" active={!active}>همه</CategoryChip>
        {categories.map((cat) => (
          <CategoryChip key={cat.id} href={`/products?c=${cat.slug}`} active={active?.id === cat.id}>
            {cat.name}
          </CategoryChip>
        ))}
      </nav>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((p, i) => (
          <ProductCard key={p.slug} p={p} priority={i < 3} />
        ))}
      </div>
      {cards.length === 0 && <p className="py-20 text-center text-muted">محصولی در این دسته نیست.</p>}
    </div>
  );
}

function CategoryChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-[13.5px] font-bold transition-colors", active ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
      {children}
    </Link>
  );
}
