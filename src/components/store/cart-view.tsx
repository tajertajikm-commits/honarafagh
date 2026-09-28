"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Paperclip, ShoppingBag, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Money } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { URGENCY } from "@/lib/labels";
import { formatNumber, toFaDigits } from "@/lib/persian";

export interface CartSummary {
  lines: {
    id: string;
    product: { id: string; name: string; slug: string; unitLabel: string };
    quantity: number;
    urgency: string;
    artworkCount: number;
    needsDesign: boolean;
    subtotal: number | null;
    summary: { group: string; value: string }[];
    leadDays: number | null;
    priceChanged: boolean;
    error: string | null;
  }[];
  subtotal: number;
  vatPct: number;
  count: number;
}

export function CartView({ initial, loggedIn }: { initial: CartSummary; loggedIn: boolean }) {
  const [cart, setCart] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const vat = Math.round((cart.subtotal * cart.vatPct) / 100);

  const remove = (id: string) =>
    start(async () => {
      try {
        setCart(await api<CartSummary>(`cart/items/${id}`, { method: "DELETE" }));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "خطا");
      }
    });

  if (cart.lines.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-surface">
        <EmptyState icon={<ShoppingBag />} title="سبد خرید خالی است" description="محصول موردنظر را پیکربندی کنید و به سبد اضافه کنید." action={<Button asChild><Link href="/products">مشاهده محصولات</Link></Button>} />
      </div>
    );
  }

  const blocked = cart.lines.some((l) => l.error);
  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <ul className="space-y-3">
        {cart.lines.map((l) => (
          <li key={l.id} className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link href={`/p/${l.product.slug}`} className="text-[16px] font-bold hover:text-accent-ink">{l.product.name}</Link>
                <p className="mt-0.5 text-[13px] text-muted">
                  {formatNumber(l.quantity)} {l.product.unitLabel} • {URGENCY[l.urgency]}
                  {l.leadDays ? ` • حدود ${formatNumber(l.leadDays)} روز کاری` : ""}
                </p>
              </div>
              <div className="text-left">
                {l.subtotal != null ? <Money rial={l.subtotal} strong className="text-[16px]" /> : <span className="text-muted">—</span>}
              </div>
            </div>
            {l.summary.length > 0 && (
              <p className="mt-3 text-[12.5px] leading-6 text-muted">{l.summary.map((s) => `${s.group}: ${toFaDigits(s.value)}`).join(" • ")}</p>
            )}
            {l.priceChanged && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                <AlertTriangle className="size-4" /> قیمت این قلم از زمان افزودن به سبد به‌روز شده است.
              </p>
            )}
            {l.error && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
                <AlertTriangle className="size-4" /> {l.error}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                <Paperclip className="size-3.5" />
                {l.needsDesign ? "طراحی توسط هنر آفاق" : l.artworkCount ? `${formatNumber(l.artworkCount)} فایل پیوست` : "فایل پس از ثبت سفارش"}
              </span>
              <Button variant="danger-ghost" size="sm" onClick={() => remove(l.id)} disabled={pending}>
                <Trash2 /> حذف
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <aside className="rounded-2xl border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <dl className="space-y-2.5 text-[14px]">
          <div className="flex justify-between"><dt className="text-muted">جمع اقلام</dt><dd><Money rial={cart.subtotal} /></dd></div>
          <div className="flex justify-between"><dt className="text-muted">مالیات بر ارزش افزوده ({formatNumber(cart.vatPct)}٪)</dt><dd><Money rial={vat} /></dd></div>
          <div className="flex justify-between border-t border-line pt-3 text-[16px] font-bold"><dt>جمع کل</dt><dd><Money rial={cart.subtotal + vat} /></dd></div>
        </dl>
        <p className="mt-2 text-[12px] text-muted">هزینه ارسال در مرحله بعد محاسبه می‌شود.</p>
        <Button asChild size="lg" className="mt-5 w-full" disabled={blocked}>
          <Link href={loggedIn ? "/checkout" : "/login?next=/checkout"} aria-disabled={blocked}>
            ادامه و ثبت سفارش <ArrowLeft />
          </Link>
        </Button>
      </aside>
    </div>
  );
}
