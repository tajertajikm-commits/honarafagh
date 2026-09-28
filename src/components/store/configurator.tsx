"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Money, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useDebouncedFetch } from "@/lib/use-debounced-fetch";
import { METHOD } from "@/lib/labels";
import { formatNumber, toEnDigits, toFaDigits } from "@/lib/persian";

interface Value {
  key: string;
  label: string;
  description: string | null;
  isDefault: boolean;
  customTrim: boolean;
}
interface Group {
  key: string;
  label: string;
  helpText: string | null;
  type: "SELECT" | "NUMBER" | "TOGGLE";
  required: boolean;
  config: { min?: number; max?: number; step?: number; default?: number; unit?: string; effect?: string } | null;
  values: Value[];
}
export interface ConfiguratorProduct {
  id: string;
  name: string;
  unitLabel: string;
  minQuantity: number;
  maxQuantity: number | null;
  quantityStep: number;
  quantityPresets: number[];
  offersDesignService: boolean;
  groups: Group[];
}
interface Price {
  subtotal: number;
  vatPct: number;
  vatAmount: number;
  total: number;
  unitPrice: number;
  discountAmount: number;
  urgencyAmount: number;
  leadDays: number;
  method: string;
  summary: { group: string; value: string }[];
}

const URGENCY = [
  { key: "STANDARD", label: "عادی", hint: "زمان استاندارد" },
  { key: "EXPRESS", label: "فوری", hint: "حدود ۴۰٪ سریع‌تر" },
  { key: "RUSH", label: "خیلی فوری", hint: "در اولویت تولید" },
] as const;

function initialSelections(groups: Group[]) {
  const s: Record<string, string | number | boolean> = {};
  for (const g of groups) {
    if (g.type === "SELECT") {
      const d = g.values.find((v) => v.isDefault) ?? (g.required ? g.values[0] : undefined);
      if (d) s[g.key] = d.key;
    } else if (g.type === "NUMBER" && g.config?.default != null) s[g.key] = g.config.default;
    else if (g.type === "TOGGLE") s[g.key] = false;
  }
  return s;
}

export function Configurator({ product, loggedIn }: { product: ConfiguratorProduct; loggedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [quantity, setQuantity] = useState(product.quantityPresets[0] ?? product.minQuantity);
  const [qtyText, setQtyText] = useState(String(product.quantityPresets[0] ?? product.minQuantity));
  const [selections, setSelections] = useState(() => initialSelections(product.groups));
  const [urgency, setUrgency] = useState<(typeof URGENCY)[number]["key"]>("STANDARD");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [adding, startAdding] = useTransition();

  const customTrimActive = useMemo(
    () => product.groups.some((g) => g.type === "SELECT" && g.values.some((v) => v.customTrim && selections[g.key] === v.key)),
    [product.groups, selections],
  );
  const visibleGroups = product.groups.filter((g) => !(g.type === "NUMBER" && (g.config?.effect === "TRIM_W" || g.config?.effect === "TRIM_H") && !customTrimActive));
  const needsDesign = selections.design === "service";

  // Live price: debounced; a response only counts for the inputs it was computed from.
  const priceKey = JSON.stringify([product.id, quantity, selections, urgency]);
  const quote = useDebouncedFetch<Price>(priceKey, () => api<Price>("pricing/quote", { body: { productId: product.id, quantity, selections, urgency } }), 220);
  const price = quote.error ? null : quote.data;
  const priceError = quote.error;
  const loading = quote.loading;

  function commitQty(raw: string) {
    const n = Number(toEnDigits(raw).replace(/[^\d]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return;
    const step = product.quantityStep;
    let q = Math.max(product.minQuantity, Math.round(n / step) * step);
    if (product.maxQuantity) q = Math.min(product.maxQuantity, q);
    setQuantity(q);
    setQtyText(String(q));
  }

  function addToCart() {
    startAdding(async () => {
      try {
        await api("cart/items", { body: { productId: product.id, quantity, selections, urgency, artworkFileIds: files.map((f) => f.id) } });
        toast.success(`${product.name} به سبد خرید اضافه شد.`);
        router.push("/cart");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "افزودن به سبد ممکن نشد.");
      }
    });
  }

  return (
    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* Quantity */}
        <OptionSection title="تیراژ" help={`حداقل ${formatNumber(product.minQuantity)} ${product.unitLabel}، با گام ${formatNumber(product.quantityStep)}`}>
          <div className="flex flex-wrap items-center gap-2">
            {product.quantityPresets.map((q) => (
              <Chip key={q} active={quantity === q} onClick={() => { setQuantity(q); setQtyText(String(q)); }}>
                {formatNumber(q)}
              </Chip>
            ))}
            <div className="flex h-10 items-center rounded-lg border border-line-strong bg-surface shadow-soft focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/8">
              <button type="button" className="grid h-full w-9 place-items-center text-muted hover:text-ink" onClick={() => commitQty(String(quantity + product.quantityStep))} aria-label="افزایش">
                <Plus className="size-4" />
              </button>
              <input
                inputMode="numeric"
                aria-label="تیراژ دلخواه"
                className="h-full w-20 bg-transparent text-center text-[14px] font-bold tabular outline-none"
                value={toFaDigits(qtyText)}
                onChange={(e) => setQtyText(toEnDigits(e.target.value))}
                onBlur={(e) => commitQty(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitQty((e.target as HTMLInputElement).value)}
              />
              <button type="button" className="grid h-full w-9 place-items-center text-muted hover:text-ink" onClick={() => commitQty(String(Math.max(product.minQuantity, quantity - product.quantityStep)))} aria-label="کاهش">
                <Minus className="size-4" />
              </button>
            </div>
            <span className="text-[13px] text-muted">{product.unitLabel}</span>
          </div>
        </OptionSection>

        {visibleGroups.map((g) => (
          <OptionSection key={g.key} title={g.label} help={g.helpText}>
            {g.type === "SELECT" && (
              <div className={cn("grid gap-2", g.values.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                {g.values.map((v) => (
                  <RadioCard key={v.key} active={selections[g.key] === v.key} onClick={() => setSelections((s) => ({ ...s, [g.key]: v.key }))} title={v.label} description={v.description} />
                ))}
              </div>
            )}
            {g.type === "TOGGLE" && (
              <button
                type="button"
                role="switch"
                aria-checked={!!selections[g.key]}
                onClick={() => setSelections((s) => ({ ...s, [g.key]: !s[g.key] }))}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-start shadow-soft hover:border-line-strong"
              >
                <span className="text-[14px] font-bold">{g.values[0]?.label ?? g.label}</span>
                <span className={cn("relative h-6 w-11 rounded-full transition-colors", selections[g.key] ? "bg-ink" : "bg-surface-3")}>
                  <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[right]", selections[g.key] ? "right-[22px]" : "right-0.5")} />
                </span>
              </button>
            )}
            {g.type === "NUMBER" && <NumberInput group={g} value={Number(selections[g.key] ?? g.config?.default ?? g.config?.min ?? 0)} onChange={(n) => setSelections((s) => ({ ...s, [g.key]: n }))} />}
          </OptionSection>
        ))}

        <OptionSection title="زمان تحویل">
          <div className="grid gap-2 sm:grid-cols-3">
            {URGENCY.map((u) => (
              <RadioCard key={u.key} active={urgency === u.key} onClick={() => setUrgency(u.key)} title={u.label} description={u.hint} />
            ))}
          </div>
        </OptionSection>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-24">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="brand-spectrum-rtl h-1" />
          <div className="p-5">
            <p className="text-[13px] text-muted">
              {product.name} • {formatNumber(quantity)} {product.unitLabel}
            </p>
            <div className="mt-2 min-h-[64px]">
              {loading && !price ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-44" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ) : priceError ? (
                <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[13.5px] leading-6 text-danger">{priceError}</p>
              ) : price ? (
                <div className={cn("transition-opacity", loading && "opacity-50")}>
                  <Money rial={price.total} className="text-[30px] font-bold" />
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    هر {product.unitLabel} <Money rial={Math.round(price.subtotal / quantity)} className="text-[12.5px]" /> • شامل {formatNumber(price.vatPct)}٪ مالیات بر ارزش افزوده
                  </p>
                </div>
              ) : null}
            </div>

            {price && (
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[13.5px]">
                <Row label="مبلغ پیش از مالیات"><Money rial={price.subtotal} /></Row>
                {price.discountAmount > 0 && <Row label="تخفیف مشتری"><span className="text-success">−<Money rial={price.discountAmount} /></span></Row>}
                <Row label="مالیات بر ارزش افزوده"><Money rial={price.vatAmount} /></Row>
                <Row label="روش تولید"><span className="font-bold">چاپ {METHOD[price.method] ?? price.method}</span></Row>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
                  <CalendarClock className="size-4 shrink-0 text-muted" />
                  آماده‌سازی حدود <b className="tabular">{formatNumber(price.leadDays)}</b> روز کاری پس از تأیید فایل
                </div>
              </dl>
            )}

            <div className="mt-5 space-y-3">
              {!needsDesign && (
                loggedIn ? (
                  <FileDrop purpose="ARTWORK" files={files} onChange={setFiles} compact onError={toast.error} />
                ) : (
                  <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-[12.5px] leading-6 text-muted">
                    فایل طرح را می‌توانید پس از <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-bold text-accent-ink">ورود</Link> یا بعد از ثبت سفارش بارگذاری کنید.
                  </p>
                )
              )}
              {needsDesign && (
                <p className="flex items-start gap-2 rounded-lg bg-violet-soft px-3 py-2.5 text-[12.5px] leading-6 text-violet">
                  <Check className="mt-1 size-3.5 shrink-0" /> طراح ما پس از ثبت سفارش با شما هماهنگ می‌کند و نمونه را برای تأیید می‌فرستد.
                </p>
              )}
              <Button size="lg" className="w-full" onClick={addToCart} loading={adding} disabled={!price || loading}>
                <ShoppingBag /> افزودن به سبد خرید
              </Button>
            </div>
          </div>
        </div>
        {price && price.summary.length > 0 && (
          <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-[12.5px]">
            <p className="mb-2 font-bold text-ink-2">خلاصه مشخصات</p>
            <ul className="space-y-1 text-muted">
              {price.summary.map((s) => (
                <li key={s.group} className="flex justify-between gap-3">
                  <span>{s.group}</span>
                  <span className="text-ink-2">{toFaDigits(s.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function OptionSection({ title, help, children }: { title: string; help?: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {help && <p className="text-[12.5px] text-muted">{help}</p>}
      </div>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("h-10 min-w-16 rounded-lg border px-4 text-[14px] font-bold tabular transition-colors", active ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink-2 hover:border-ink")}>
      {children}
    </button>
  );
}

function RadioCard({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description?: string | null }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "relative flex min-h-[56px] flex-col justify-center rounded-xl border px-4 py-3 text-start transition-[border,box-shadow,background]",
        active ? "border-ink bg-surface shadow-[0_0_0_1px_var(--color-ink)]" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <span className="text-[14px] font-bold">{toFaDigits(title)}</span>
      {description && <span className="mt-0.5 text-[12px] leading-5 text-muted">{description}</span>}
      {active && (
        <span className="absolute left-3 top-3 grid size-5 place-items-center rounded-full bg-ink text-surface">
          <Check className="size-3" />
        </span>
      )}
    </button>
  );
}

function NumberInput({ group, value, onChange }: { group: Group; value: number; onChange: (n: number) => void }) {
  const c = group.config ?? {};
  const min = c.min ?? 0;
  const max = c.max ?? 100000;
  const step = c.step ?? 1;
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // Parent changed the value (reset / clamp): mirror it into the text box.
    setShown(value);
    setText(String(value));
  }
  const commit = (raw: string) => {
    const n = Number(toEnDigits(raw));
    if (!Number.isFinite(n)) return setText(String(value));
    const v = Math.min(max, Math.max(min, Math.round((n - min) / step) * step + min));
    onChange(v);
    setText(String(v));
  };
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 items-center rounded-lg border border-line-strong bg-surface shadow-soft focus-within:border-ink">
        <button type="button" className="grid h-full w-9 place-items-center text-muted hover:text-ink" onClick={() => commit(String(value + step))} aria-label="افزایش">
          <Plus className="size-4" />
        </button>
        <input inputMode="numeric" aria-label={group.label} className="h-full w-20 bg-transparent text-center font-bold tabular outline-none" value={toFaDigits(text)} onChange={(e) => setText(toEnDigits(e.target.value))} onBlur={(e) => commit(e.target.value)} />
        <button type="button" className="grid h-full w-9 place-items-center text-muted hover:text-ink" onClick={() => commit(String(value - step))} aria-label="کاهش">
          <Minus className="size-4" />
        </button>
      </div>
      <span className="text-[13px] text-muted">
        {c.unit} • بین {formatNumber(min)} تا {formatNumber(max)}
      </span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
