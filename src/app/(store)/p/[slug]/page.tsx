import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { Configurator } from "@/components/store/configurator";
import { storefrontCtx } from "@/server/http/session";
import { loadProductDetail } from "@/server/modules/catalog/queries";
import { isAppError } from "@/server/core/errors";

async function load(slug: string) {
  const ctx = await storefrontCtx();
  try {
    return { ctx, detail: await loadProductDetail(ctx.db, { slug }) };
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { detail } = await load(slug);
  return { title: detail.product.name, description: detail.product.subtitle ?? undefined };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, detail } = await load(slug);
  const p = detail.product;
  const image = detail.images[0]?.url ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <nav className="flex items-center gap-1 text-[13px] text-muted" aria-label="مسیر">
        <Link href="/products" className="hover:text-ink">محصولات</Link>
        <ChevronLeft className="size-3.5" />
        {detail.category && (
          <>
            <Link href={`/products?c=${detail.category.slug}`} className="hover:text-ink">{detail.category.name}</Link>
            <ChevronLeft className="size-3.5" />
          </>
        )}
        <span className="text-ink-2">{p.name}</span>
      </nav>

      <div className="mt-6">
        <div>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {image && (
              <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface sm:w-64">
                <Image src={image} alt={p.name} fill sizes="256px" className="object-contain p-3" priority />
              </div>
            )}
            <div>
              <h1 className="text-[28px] font-bold">{p.name}</h1>
              {p.subtitle && <p className="mt-1 text-[15px] text-muted">{p.subtitle}</p>}
              <ul className="mt-4 space-y-1.5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-[13.5px] text-ink-2">
                    <Check className="size-4 text-success" /> {h}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {p.description && <p className="mt-6 max-w-2xl text-[14.5px] leading-8 text-ink-2">{p.description}</p>}
        </div>
      </div>

      <Configurator
        loggedIn={ctx.actor.kind === "customer"}
        product={{
          id: p.id,
          name: p.name,
          unitLabel: p.unitLabel,
          minQuantity: p.minQuantity,
          maxQuantity: p.maxQuantity,
          quantityStep: p.quantityStep,
          quantityPresets: p.quantityPresets,
          offersDesignService: p.offersDesignService,
          groups: detail.groups.map((g) => ({
            key: g.key,
            label: g.label,
            helpText: g.helpText,
            type: g.type,
            required: g.required,
            config: g.config ?? null,
            values: g.values.map((v) => ({ key: v.key, label: v.label, description: v.description, isDefault: v.isDefault, customTrim: !!v.effects.customTrim })),
          })),
        }}
      />
    </div>
  );
}
