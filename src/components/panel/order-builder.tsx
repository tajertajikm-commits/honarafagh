"use client";

import { Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, newIdempotencyKey } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { METHOD } from "@/lib/labels";
import { formatNumber, formatPercent, formatPhone, toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface BuilderGroup {
  key: string;
  label: string;
  type: string;
  required: boolean;
  config: { min?: number; max?: number; default?: number; effect?: string; unit?: string } | null;
  values: { key: string; label: string; isDefault: boolean; customTrim?: boolean }[];
}
export interface BuilderProduct { id: string; name: string; unitLabel: string; minQuantity: number; maxQuantity: number | null; quantityPresets: number[]; groups: BuilderGroup[] }
export interface CustomerPick { id: string; fullName: string; companyName: string | null; phone: string; discountPct?: number; balance?: number }

type Sel = Record<string, string | number | boolean>;
interface Price { subtotal: number; unitPrice: number; leadDays: number; method: string; customerDiscountPct: number; costTotal?: number; marginPct?: number; warnings: string[] }
interface Line { uid: string; productId: string; quantity: string; selections: Sel; custom: boolean; title: string; manualPrice: string; workflowCode: string; override: string; price: Price | null; error: string | null; loading: boolean }

const clean = (s: string) => toEnDigits(s).replace(/[^\d]/g, "");
const toRial = (toman: string) => Number(clean(toman) || 0) * 10;
let uidSeq = 0;
const uid = () => `l${++uidSeq}`;

function defaults(groups: BuilderGroup[]): Sel {
  const s: Sel = {};
  for (const g of groups) {
    if (g.type === "SELECT") {
      const d = g.values.find((v) => v.isDefault) ?? (g.required ? g.values[0] : undefined);
      if (d) s[g.key] = d.key;
    } else if (g.type === "NUMBER" && g.config?.default != null) s[g.key] = g.config.default;
    else if (g.type === "TOGGLE") s[g.key] = false;
  }
  return s;
}

export function OrderBuilder({ mode, products, deliveryMethods, workflows, perms, initialCustomer, inquiryId, initialLine, defaultValidDays }: {
  mode: "order" | "quote";
  products: BuilderProduct[];
  deliveryMethods: { id: string; name: string; kind: string; baseFee: number }[];
  workflows: { code: string; name: string }[];
  perms: string[];
  initialCustomer?: CustomerPick | null;
  inquiryId?: string | null;
  initialLine?: { productId: string | null; quantity: number | null; selections: Sel | null; title?: string } | null;
  defaultValidDays: number;
}) {
  const router = useRouter();
  const { toast } = useApiAction();
  const canOverride = perms.includes("order.price.override");
  const [customer, setCustomer] = useState<CustomerPick | null>(initialCustomer ?? null);
  const [urgency, setUrgency] = useState<"STANDARD" | "EXPRESS" | "RUSH">("STANDARD");
  const [priority, setPriority] = useState("NORMAL");
  const [deliveryMethodId, setDeliveryMethodId] = useState(deliveryMethods.find((m) => m.kind === "PICKUP")?.id ?? "");
  const [addr, setAddr] = useState({ province: "تهران", city: "تهران", line: "", postalCode: "", recipientName: "", recipientPhone: "" });
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [discount, setDiscount] = useState("");
  const [confirmNow, setConfirmNow] = useState(true);
  const [validDays, setValidDays] = useState(String(defaultValidDays));
  const [saving, setSaving] = useState(false);
  const key = useRef(newIdempotencyKey());

  const newLine = (productId?: string | null, quantity?: number | null, selections?: Sel | null): Line => {
    const p = products.find((x) => x.id === productId) ?? null;
    return { uid: uid(), productId: p?.id ?? "", quantity: String(quantity ?? p?.quantityPresets[0] ?? p?.minQuantity ?? ""), selections: { ...(p ? defaults(p.groups) : {}), ...(selections ?? {}) }, custom: false, title: "", manualPrice: "", workflowCode: workflows[0]?.code ?? "", override: "", price: null, error: null, loading: false };
  };
  const [lines, setLines] = useState<Line[]>(() => [initialLine ? { ...newLine(initialLine.productId, initialLine.quantity, initialLine.selections), title: initialLine.title ?? "" } : newLine()]);
  const patch = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === id ? { ...l, ...p } : l)));

  // Live pricing per product line (debounced; latest request per line wins).
  const reqIds = useRef<Record<string, number>>({});
  const priceKey = lines.map((l) => `${l.uid}|${l.productId}|${l.quantity}|${JSON.stringify(l.selections)}|${l.custom}`).join(";") + `|${urgency}|${customer?.id ?? ""}`;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const l of lines) {
      if (l.custom || !l.productId || !Number(l.quantity)) continue;
      const id = (reqIds.current[l.uid] = (reqIds.current[l.uid] ?? 0) + 1);
      patch(l.uid, { loading: true });
      timers.push(
        setTimeout(async () => {
          try {
            const price = await api<Price>("pricing/staff-quote", { body: { productId: l.productId, quantity: Number(l.quantity), selections: l.selections, urgency, customerId: customer?.id ?? null } });
            if (reqIds.current[l.uid] === id) patch(l.uid, { price, error: null, loading: false });
          } catch (e) {
            if (reqIds.current[l.uid] === id) patch(l.uid, { price: null, error: e instanceof ApiError ? e.message : "محاسبه قیمت ممکن نشد.", loading: false });
          }
        }, 350),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const lineSubtotal = (l: Line) => (l.custom ? toRial(l.manualPrice) : l.override ? toRial(l.override) : (l.price?.subtotal ?? 0));
  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const method = deliveryMethods.find((m) => m.id === deliveryMethodId);
  const shipping = mode === "order" ? (method?.baseFee ?? 0) : 0;
  const discountRial = toRial(discount);
  const vat = Math.round(((Math.max(0, subtotal - discountRial) + shipping) * 10) / 100);
  const total = Math.max(0, subtotal - discountRial) + shipping + vat;
  const ready = !!customer && lines.length > 0 && lines.every((l) => (l.custom ? l.title.trim().length >= 2 && toRial(l.manualPrice) > 0 && Number(l.quantity) > 0 && (mode === "quote" || l.workflowCode) : l.productId && Number(l.quantity) > 0 && l.price && !l.error));
  const needsAddress = mode === "order" && method && method.kind !== "PICKUP";

  const submit = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      if (mode === "order") {
        const o = await api<{ id: string }>("orders", {
          body: {
            customerId: customer.id,
            items: lines.map((l) => (l.custom ? { quantity: Number(l.quantity), title: l.title, lineSubtotal: toRial(l.manualPrice), workflowTemplateCode: l.workflowCode, note: undefined } : { productId: l.productId, quantity: Number(l.quantity), selections: l.selections, urgency, lineSubtotal: l.override ? toRial(l.override) : undefined, title: l.title || undefined })),
            priority,
            discount: discountRial || undefined,
            deliveryMethodId: deliveryMethodId || null,
            address: needsAddress ? { ...addr, postalCode: addr.postalCode || null, recipientPhone: clean(addr.recipientPhone) } : null,
            customerNote: customerNote || null,
            internalNote: internalNote || null,
            source: "SALES",
            confirm: confirmNow,
            idempotencyKey: key.current,
          },
        });
        toast.success("سفارش ثبت شد.");
        router.push(`/panel/orders/${o.id}`);
      } else {
        const q = await api<{ id: string }>("quotes", {
          body: {
            customerId: customer.id,
            inquiryId: inquiryId ?? null,
            urgency,
            validDays: Number(clean(validDays)) || defaultValidDays,
            items: lines.map((l) => (l.custom ? { quantity: Number(l.quantity), title: l.title, lineSubtotal: toRial(l.manualPrice) } : { productId: l.productId, quantity: Number(l.quantity), selections: l.selections, lineSubtotal: l.override ? toRial(l.override) : undefined, title: l.title || undefined })),
            discountAmount: discountRial || undefined,
            customerNote: customerNote || null,
            internalNote: internalNote || null,
          },
        });
        toast.success("پیش‌فاکتور ساخته شد.");
        router.push(`/panel/sales/quotes/${q.id}`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "ثبت ممکن نشد.");
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <CustomerPicker value={customer} onChange={setCustomer} canCreate={perms.includes("customer.manage")} />

        {lines.map((l, i) => (
          <LineEditor key={l.uid} index={i} line={l} products={products} workflows={workflows} mode={mode} canOverride={canOverride} onChange={(p) => patch(l.uid, p)} onRemove={lines.length > 1 ? () => setLines((ls) => ls.filter((x) => x.uid !== l.uid)) : undefined} newDefaults={(pid) => newLine(pid)} />
        ))}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus /> قلم محصول</Button>
          {(mode === "quote" || canOverride) && <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { ...newLine(), custom: true }])}><Plus /> قلم سفارشی (خارج از کاتالوگ)</Button>}
        </div>

        <Card>
          <CardHeader title={mode === "order" ? "تحویل و توضیحات" : "شرایط پیش‌فاکتور"} />
          <CardBody className="grid gap-4 pt-0 sm:grid-cols-2">
            <Field label="فوریت">
              <Select value={urgency} onChange={(e) => setUrgency(e.target.value as typeof urgency)}>
                <option value="STANDARD">عادی</option><option value="EXPRESS">فوری</option><option value="RUSH">خیلی فوری</option>
              </Select>
            </Field>
            {mode === "order" ? (
              <Field label="اولویت تولید">
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="LOW">کم</option><option value="NORMAL">عادی</option><option value="HIGH">بالا</option>{perms.includes("order.priority.change") && <option value="URGENT">فوری</option>}
                </Select>
              </Field>
            ) : (
              <Field label="اعتبار (روز)"><Input ltr inputMode="numeric" value={validDays} onChange={(e) => setValidDays(clean(e.target.value))} /></Field>
            )}
            {mode === "order" && (
              <Field label="روش تحویل" className="sm:col-span-2">
                <Select value={deliveryMethodId} onChange={(e) => setDeliveryMethodId(e.target.value)}>
                  {deliveryMethods.map((m) => <option key={m.id} value={m.id}>{m.name}{m.baseFee ? ` — ${formatNumber(m.baseFee / 10)} تومان` : ""}</option>)}
                </Select>
              </Field>
            )}
            {needsAddress && (
              <>
                <Field label="استان"><Input value={addr.province} onChange={(e) => setAddr({ ...addr, province: e.target.value })} /></Field>
                <Field label="شهر"><Input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} /></Field>
                <Field label="نشانی" className="sm:col-span-2"><Input value={addr.line} onChange={(e) => setAddr({ ...addr, line: e.target.value })} /></Field>
                <Field label="تحویل‌گیرنده"><Input value={addr.recipientName} onChange={(e) => setAddr({ ...addr, recipientName: e.target.value })} placeholder={customer?.fullName} /></Field>
                <Field label="موبایل تحویل‌گیرنده"><Input ltr inputMode="tel" value={addr.recipientPhone} onChange={(e) => setAddr({ ...addr, recipientPhone: e.target.value })} placeholder={customer?.phone} /></Field>
              </>
            )}
            <Field label="یادداشت برای مشتری" className="sm:col-span-2"><Textarea value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} /></Field>
            <Field label="یادداشت داخلی" hint="فقط کارکنان می‌بینند." className="sm:col-span-2"><Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} /></Field>
          </CardBody>
        </Card>
      </div>

      <aside className="xl:sticky xl:top-20 xl:h-fit">
        <Card>
          <CardHeader title="جمع" />
          <CardBody className="space-y-2 pt-0 text-[13.5px]">
            {lines.map((l, i) => (
              <div key={l.uid} className="flex justify-between gap-2">
                <span className="truncate text-muted">{i + 1}. {l.custom ? l.title || "قلم سفارشی" : (products.find((p) => p.id === l.productId)?.name ?? "—")}</span>
                {l.loading ? <Spinner className="size-4" /> : <Money rial={lineSubtotal(l)} />}
              </div>
            ))}
            {canOverride && (
              <Field label="تخفیف کل (تومان)" className="pt-2"><Input ltr inputMode="numeric" value={discount} onChange={(e) => setDiscount(clean(e.target.value))} /></Field>
            )}
            <div className="space-y-1.5 border-t border-line pt-3">
              <div className="flex justify-between"><span className="text-muted">جمع اقلام</span><Money rial={subtotal} /></div>
              {discountRial > 0 && <div className="flex justify-between text-success"><span>تخفیف</span><span>−<Money rial={discountRial} /></span></div>}
              {shipping > 0 && <div className="flex justify-between"><span className="text-muted">هزینه ارسال</span><Money rial={shipping} /></div>}
              <div className="flex justify-between"><span className="text-muted">مالیات بر ارزش افزوده</span><Money rial={vat} /></div>
              <div className="flex justify-between text-[16px] font-bold"><span>مبلغ کل</span><Money rial={total} strong /></div>
            </div>
            {mode === "order" && (
              <label className="flex items-start gap-2 pt-2 text-[13px]">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--color-ink)]" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} />
                <span>تأیید فوری و ارسال به برنامه تولید<span className="block text-[12px] text-muted">رزرو مواد و زمان‌بندی بلافاصله انجام می‌شود.</span></span>
              </label>
            )}
            <Button className="mt-2 w-full" size="lg" disabled={!ready} loading={saving} onClick={submit}>{mode === "order" ? "ثبت سفارش" : "ساخت پیش‌فاکتور"}</Button>
            {!customer && <p className="text-center text-[12px] text-muted">ابتدا مشتری را انتخاب کنید.</p>}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}

function CustomerPicker({ value, onChange, canCreate }: { value: CustomerPick | null; onChange: (c: CustomerPick | null) => void; canCreate: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nc, setNc] = useState({ phone: "", fullName: "", companyName: "" });
  const { run, pending } = useApiAction();
  useEffect(() => {
    if (value || q.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ rows: CustomerPick[] }>(`customers?q=${encodeURIComponent(q)}`, { method: "GET", signal: ctrl.signal });
        setResults(r.rows);
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, value]);

  if (value) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 py-4">
          <div className="grid size-10 place-items-center rounded-full bg-surface-2 font-bold">{value.fullName.slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{value.fullName}{value.companyName && <span className="font-medium text-muted"> · {value.companyName}</span>}</p>
            <p className="text-[12.5px] text-muted"><bdi dir="ltr">{formatPhone(value.phone)}</bdi>{value.discountPct ? ` · تخفیف ثابت ${formatPercent(value.discountPct)}` : ""}{value.balance && value.balance > 0 ? <> · مانده حساب <Money rial={value.balance} className="text-danger" /></> : null}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>تغییر مشتری</Button>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="مشتری" actions={canCreate && <Button size="xs" variant="ghost" onClick={() => setCreating(!creating)}><UserPlus /> مشتری جدید</Button>} />
      <CardBody className="pt-0">
        {creating ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="موبایل"><Input ltr inputMode="tel" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
            <Field label="نام و نام خانوادگی"><Input value={nc.fullName} onChange={(e) => setNc({ ...nc, fullName: e.target.value })} /></Field>
            <Field label="شرکت (اختیاری)"><Input value={nc.companyName} onChange={(e) => setNc({ ...nc, companyName: e.target.value })} /></Field>
            <div className="sm:col-span-3">
              <Button size="sm" loading={pending} disabled={nc.fullName.trim().length < 2 || clean(nc.phone).length < 10} onClick={() => run(() => api<CustomerPick>("customers", { body: { phone: nc.phone, fullName: nc.fullName, companyName: nc.companyName || null, type: nc.companyName ? "COMPANY" : "INDIVIDUAL" } }), "مشتری ثبت شد.", (c) => { onChange(c as CustomerPick); setCreating(false); })}>ثبت و انتخاب</Button>
            </div>
          </div>
        ) : (
          <>
            <label className="relative block">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، شرکت یا شماره موبایل" aria-label="جستجوی مشتری" className="ps-9" autoFocus />
            </label>
            {loading && <p className="mt-2 text-[12.5px] text-muted">در حال جستجو…</p>}
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                {results.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[13px] hover:bg-surface-2">
                      <span><b>{c.fullName}</b>{c.companyName && <span className="text-muted"> · {c.companyName}</span>}</span>
                      <bdi dir="ltr" className="text-muted">{formatPhone(c.phone)}</bdi>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loading && q.trim().length >= 2 && results.length === 0 && <p className="mt-2 text-[12.5px] text-muted">مشتری‌ای پیدا نشد.{canCreate && " از «مشتری جدید» ثبت کنید."}</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function LineEditor({ index, line: l, products, workflows, mode, canOverride, onChange, onRemove, newDefaults }: {
  index: number;
  line: Line;
  products: BuilderProduct[];
  workflows: { code: string; name: string }[];
  mode: "order" | "quote";
  canOverride: boolean;
  onChange: (p: Partial<Line>) => void;
  onRemove?: () => void;
  newDefaults: (productId: string) => Line;
}) {
  const product = products.find((p) => p.id === l.productId);
  const customTrim = useMemo(() => !!product?.groups.some((g) => g.type === "SELECT" && g.values.some((v) => v.customTrim && l.selections[g.key] === v.key)), [product, l.selections]);
  const groups = (product?.groups ?? []).filter((g) => !(g.type === "NUMBER" && (g.config?.effect === "TRIM_W" || g.config?.effect === "TRIM_H") && !customTrim));
  return (
    <Card>
      <CardHeader
        title={<>قلم {formatNumber(index + 1)}{l.custom && <Badge tone="violet" className="ms-2">سفارشی</Badge>}</>}
        actions={onRemove && <Button size="icon-sm" variant="ghost" aria-label="حذف قلم" onClick={onRemove}><Trash2 /></Button>}
      />
      <CardBody className="pt-0">
        {l.custom ? (
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="عنوان" className="sm:col-span-2"><Input value={l.title} onChange={(e) => onChange({ title: e.target.value })} /></Field>
            <Field label="تعداد"><Input ltr inputMode="numeric" value={l.quantity} onChange={(e) => onChange({ quantity: clean(e.target.value) })} /></Field>
            <Field label="مبلغ کل ردیف (تومان)"><Input ltr inputMode="numeric" value={l.manualPrice} onChange={(e) => onChange({ manualPrice: clean(e.target.value) })} /></Field>
            {mode === "order" && (
              <Field label="گردش‌کار تولید" className="sm:col-span-2">
                <Select value={l.workflowCode} onChange={(e) => onChange({ workflowCode: e.target.value })}>{workflows.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}</Select>
              </Field>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="محصول" className="sm:col-span-2">
                <Select value={l.productId} onChange={(e) => { const d = newDefaults(e.target.value); onChange({ productId: d.productId, selections: d.selections, quantity: d.quantity, price: null, error: null }); }}>
                  <option value="">انتخاب محصول</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label={`تعداد${product ? ` (${product.unitLabel})` : ""}`} hint={product ? `حداقل ${formatNumber(product.minQuantity)}` : undefined}>
                <Input ltr inputMode="numeric" value={l.quantity} onChange={(e) => onChange({ quantity: clean(e.target.value) })} list={product ? `qty-${l.uid}` : undefined} />
                {product && <datalist id={`qty-${l.uid}`}>{product.quantityPresets.map((q) => <option key={q} value={q} />)}</datalist>}
              </Field>
            </div>
            {product && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {groups.map((g) => (
                  <Field key={g.key} label={g.label}>
                    {g.type === "SELECT" ? (
                      <Select value={String(l.selections[g.key] ?? "")} onChange={(e) => onChange({ selections: { ...l.selections, [g.key]: e.target.value } })}>
                        {!g.required && <option value="">— ندارد —</option>}
                        {g.values.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                      </Select>
                    ) : g.type === "TOGGLE" ? (
                      <Select value={l.selections[g.key] ? "1" : "0"} onChange={(e) => onChange({ selections: { ...l.selections, [g.key]: e.target.value === "1" } })}>
                        <option value="0">خیر</option><option value="1">بله</option>
                      </Select>
                    ) : (
                      <Input ltr inputMode="numeric" value={String(l.selections[g.key] ?? "")} onChange={(e) => onChange({ selections: { ...l.selections, [g.key]: Number(clean(e.target.value) || 0) } })} />
                    )}
                  </Field>
                ))}
              </div>
            )}
            <div className={cn("mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-3 py-2.5 text-[13px]", l.error ? "bg-danger-soft text-danger" : "bg-surface-2")}>
              {l.error ? l.error : !l.price ? <span className="text-muted">{l.loading ? "در حال محاسبه قیمت…" : "محصول و تعداد را وارد کنید."}</span> : (
                <>
                  <span>قیمت: <Money rial={l.price.subtotal} strong /></span>
                  <span className="text-muted">واحد <Money rial={l.price.unitPrice} /></span>
                  <span className="text-muted">{METHOD[l.price.method] ?? l.price.method} · {formatNumber(l.price.leadDays)} روز کاری</span>
                  {l.price.customerDiscountPct > 0 && <span className="text-success">تخفیف مشتری {formatPercent(l.price.customerDiscountPct)}</span>}
                  {l.price.costTotal != null && <span className="text-muted">بهای تمام‌شده <Money rial={l.price.costTotal} /> · حاشیه {formatPercent(l.price.marginPct ?? 0)}</span>}
                  {l.loading && <Spinner className="size-4" />}
                </>
              )}
            </div>
            {canOverride && l.price && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field label="قیمت توافقی ردیف (تومان)" hint="خالی = قیمت محاسبه‌شده؛ تغییر در ممیزی ثبت می‌شود."><Input ltr inputMode="numeric" value={l.override} onChange={(e) => onChange({ override: clean(e.target.value) })} /></Field>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
