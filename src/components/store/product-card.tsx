import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Money } from "@/components/ui/misc";
import { formatNumber } from "@/lib/persian";

export interface ProductCardData {
  slug: string;
  name: string;
  subtitle: string | null;
  image: string | null;
  unitLabel: string;
  from: { quantity: number; subtotal: number } | null;
}

export function ProductCard({ p, priority }: { p: ProductCardData; priority?: boolean }) {
  return (
    <Link href={`/p/${p.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-float">
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-b from-surface-2 to-surface">
        {p.image && <Image src={p.image} alt={p.name} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={priority} className="object-contain p-4 transition-transform duration-500 group-hover:scale-[1.03]" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-line p-5">
        <h3 className="text-[16px] font-bold">{p.name}</h3>
        {p.subtitle && <p className="text-[13.5px] text-muted">{p.subtitle}</p>}
        <div className="mt-auto flex items-end justify-between pt-4">
          {p.from ? (
            <div className="text-[12.5px] text-muted">
              از <Money rial={p.from.subtotal} className="text-[15px] font-bold text-ink" />
              <span className="block text-[11.5px]">برای {formatNumber(p.from.quantity)} {p.unitLabel}</span>
            </div>
          ) : (
            <span className="text-[13px] text-muted">قیمت لحظه‌ای</span>
          )}
          <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink transition-colors group-hover:bg-ink group-hover:text-surface">
            <ArrowLeft className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
