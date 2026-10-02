"use client";

import { useRouter } from "next/navigation";
import { Check, CreditCard, MapPin, Store, Truck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, newIdempotencyKey } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatNumber, normalizePhone, toEnDigits } from "@/lib/persian";
import type { CartSummary } from "./cart-view";

interface Method { id: string; name: string; description: string | null; method: "COURIER" | "POST" | "EXTERNAL" | "CUSTOMER_COURIER" | "PICKUP"; fee: number }
interface Addr { id: string; title: string; line: string; recipientName: string; isDefault: boolean }

export function CheckoutForm({ cart, methods, addresses, customer }: { cart: CartSummary; methods: Method[]; addresses: Addr[]; customer: { name: string; phone: string } }) {
  const router = useRouter();
  const toast = useToast();
  const key = useRef(newIdempotencyKey());
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [addressId, setAddressId] = useState<string | "new">(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "new");
  const [addr, setAddr] = useState({ province: "تهران", city: "تهران", line: "", postalCode: "", recipientName: customer.name, recipientPhone: customer.phone });
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"NOW" | "LATER">("NOW");
  const [loading, setLoading] = useState(false);
  const [expected, setExpected] = useState<number | null>(null);

  const method = methods.find((m) => m.id === methodId);
  const needsAddress = method?.method !== "PICKUP" && method?.method !== "CUSTOMER_COURIER";
  const totals = useMemo(() => {
    const shipping = method?.fee ?? 0;
    const vat = Math.round(((cart.subtotal + shipping) * cart.vatPct) / 100);
    return { shipping, vat, total: cart.subtotal + shipping + vat };
  }, [cart, method]);

  async function submit() {
    if (needsAddress && addressId === "new") {
      if (addr.line.trim().length < 5) return toast.error("آدرس کامل را وارد کنید.");
      if (!normalizePhone(addr.recipientPhone)) return toast.error("شماره تحویل‌گیرنده معتبر نیست.");
      if (addr.postalCode && !/^\d{10}$/.test(addr.postalCode)) return toast.error("کد پستی باید ۱۰ رقم باشد.");
    }
    setLoading(true);
    try {
      const r = await api<{ orders: { id: string; code: string }[]; redirectUrl: string | null }>("checkout", {
        body: {
          deliveryMethodId: methodId,
          addressId: needsAddress && addressId !== "new" ? addressId : null,
          address: needsAddress && addressId === "new" ? { ...addr, recipientPhone: normalizePhone(addr.recipientPhone), postalCode: addr.postalCode || null } : null,
          note: note || null,
          expectedTotal: expected ?? totals.total,
          idempotencyKey: key.current,
          payment,
        },
      });
      if (r.redirectUrl) window.location.href = r.redirectUrl;
      else {
        router.push(r.orders.length === 1 ? `/account/orders/${r.orders[0]!.id}?placed=1` : "/account?placed=1");
        router.refresh();
      }
    } catch (e) {
      if (e instanceof ApiError && (e.details as { priceChanged?: boolean; total?: number } | undefined)?.priceChanged) {
        setExpected((e.details as { total: number }).total);
        toast.error(`${e.message} مبلغ جدید: ${formatNumber(Math.round((e.details as { total: number }).total / 10))} تومان`);
      } else toast.error(e instanceof ApiError ? e.message : "ثبت سفارش ممکن نشد.");
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Section icon={<Truck />} title="روش تحویل">
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((m) => (
              <Choice key={m.id} active={methodId === m.id} onClick={() => setMethodId(m.id)} title={m.name} description={m.description} extra={m.fee ? <Money rial={m.fee} className="text-[12.5px]" /> : <span className="text-[12.5px] text-success">رایگان</span>} icon={m.method === "PICKUP" ? <Store /> : <Truck />} />
            ))}
          </div>
        </Section>

        {needsAddress && (
          <Section icon={<MapPin />} title="آدرس تحویل">
            <div className="grid gap-2">
              {addresses.map((a) => (
                <Choice key={a.id} active={addressId === a.id} onClick={() => setAddressId(a.id)} title={a.title} description={`${a.line} — ${a.recipientName}`} />
              ))}
              <Choice active={addressId === "new"} onClick={() => setAddressId("new")} title="آدرس جدید" description="وارد کردن آدرس دیگر" />
            </div>
            {addressId === "new" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="استان"><Input value={addr.province} onChange={(e) => setAddr({ ...addr, province: e.target.value })} /></Field>
                <Field label="شهر"><Input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} /></Field>
                <Field label="نشانی کامل" className="sm:col-span-2"><Textarea value={addr.line} onChange={(e) => setAddr({ ...addr, line: e.target.value })} placeholder="خیابان، کوچه، پلاک، واحد" /></Field>
                <Field label="نام تحویل‌گیرنده"><Input value={addr.recipientName} onChange={(e) => setAddr({ ...addr, recipientName: e.target.value })} /></Field>
                <Field label="موبایل تحویل‌گیرنده"><Input ltr inputMode="tel" value={addr.recipientPhone} onChange={(e) => setAddr({ ...addr, recipientPhone: toEnDigits(e.target.value) })} /></Field>
                <Field label="کد پستی (اختیاری)"><Input ltr inputMode="numeric" value={addr.postalCode} onChange={(e) => setAddr({ ...addr, postalCode: toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 10) })} /></Field>
              </div>
            )}
          </Section>
        )}

        <Section icon={<CreditCard />} title="پرداخت">
          <div className="grid gap-2">
            <Choice active={payment === "NOW"} onClick={() => setPayment("NOW")} title="پرداخت آنلاین" extra={<Money rial={totals.total} className="text-[12.5px]" />} />
            <Choice active={payment === "LATER"} onClick={() => setPayment("LATER")} title="پرداخت بعدی (کارت به کارت یا حضوری)" description="رسید را از صفحه سفارش ثبت کنید؛ حسابداری تأیید می‌کند." />
          </div>
        </Section>

        <Section title="توضیحات سفارش (اختیاری)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="نکته‌ای که باید بدانیم…" />
        </Section>
      </div>

      <aside className="rounded-2xl border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
        <ul className="space-y-2 border-b border-line pb-4 text-[13.5px]">
          {cart.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span className="text-ink-2">{l.product.name} <span className="text-muted">× {formatNumber(l.quantity)}</span></span>
              <Money rial={l.subtotal} />
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-muted">هزینه ارسال</dt><dd><Money rial={totals.shipping} /></dd></div>
          <div className="flex justify-between"><dt className="text-muted">مالیات بر ارزش افزوده</dt><dd><Money rial={totals.vat} /></dd></div>
          <div className="flex justify-between border-t border-line pt-3 text-[17px] font-bold"><dt>مبلغ قابل پرداخت</dt><dd><Money rial={expected ?? totals.total} /></dd></div>
        </dl>
        <Button size="lg" className="mt-5 w-full" onClick={submit} loading={loading}>
          {payment === "LATER" ? "ثبت سفارش" : "ثبت و پرداخت"}
        </Button>
        <p className="mt-3 text-center text-[12px] leading-6 text-muted">قیمت پس از ثبت سفارش ثابت می‌ماند و تغییر نرخ‌ها روی آن اثری ندارد.</p>
      </aside>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold [&_svg]:size-4 [&_svg]:text-muted">{icon}{title}</h2>
      {children}
    </section>
  );
}

function Choice({ active, onClick, title, description, extra, icon }: { active: boolean; onClick: () => void; title: string; description?: string | null; extra?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-start transition-[border,box-shadow]", active ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong")}>
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", active ? "border-ink bg-ink text-surface" : "border-line-strong")}>{active && <Check className="size-3" />}</span>
      {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">{title}</span>
        {description && <span className="block truncate text-[12.5px] text-muted">{description}</span>}
      </span>
      {extra}
    </button>
  );
}
