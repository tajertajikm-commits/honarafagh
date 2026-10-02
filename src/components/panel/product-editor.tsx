"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

type Json = Record<string, unknown>;
export interface ValueDef { key: string; label: string; description: string | null; effects: Json; isDefault: boolean; isActive: boolean }
export interface GroupDef { key: string; label: string; helpText: string | null; type: "SELECT" | "NUMBER" | "TOGGLE"; required: boolean; config: Json | null; isActive: boolean; values: ValueDef[] }
export interface ProductDef {
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  categoryId: string | null;
  pricingRuleSetId: string;
  spec: Json;
  unitLabel: string;
  minQuantity: number;
  maxQuantity: number | null;
  quantityStep: number;
  quantityPresets: number[];
  requiresArtwork: boolean;
  offersDesignService: boolean;
  isActive: boolean;
  isFeatured: boolean;
  highlights: string[];
  imageUrl: string | null;
  methods: { methodCode: "DIGITAL" | "OFFSET"; minQuantity: number; maxQuantity: number | null }[];
  groups: GroupDef[];
}

const int = (s: string) => Number(toEnDigits(s).replace(/\D/g, "") || 0);
const pretty = (v: unknown) => JSON.stringify(v ?? {}, null, 2);

/** JSON field with local parse state; only valid JSON is pushed up. */
function JsonField({ label, hint, value, onChange, rows = 6 }: { label: string; hint?: string; value: unknown; onChange: (v: Json) => void; rows?: number }) {
  const [text, setText] = useState(pretty(value));
  const [err, setErr] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint} error={err}>
      <Textarea
        dir="ltr"
        rows={rows}
        spellCheck={false}
        className="font-mono text-left text-[12px] leading-5"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const v = JSON.parse(e.target.value || "{}");
            if (typeof v !== "object" || Array.isArray(v) || v === null) throw new Error();
            setErr(null);
            onChange(v);
          } catch {
            setErr("JSON نامعتبر است.");
          }
        }}
      />
    </Field>
  );
}

function move<T>(arr: T[], i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

const METHODS = [{ code: "DIGITAL" as const, name: "دیجیتال" }, { code: "OFFSET" as const, name: "افست" }];

export function ProductEditor({ productId, initial, categories, ruleSets }: {
  productId: string | null;
  initial: ProductDef;
  categories: { id: string; name: string }[];
  ruleSets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useApiAction();
  const [d, setD] = useState<ProductDef>(initial);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const set = (p: Partial<ProductDef>) => setD((x) => ({ ...x, ...p }));
  const setGroup = (gi: number, p: Partial<GroupDef>) => set({ groups: d.groups.map((g, i) => (i === gi ? { ...g, ...p } : g)) });
  const setValue = (gi: number, vi: number, p: Partial<ValueDef>) => setGroup(gi, { values: d.groups[gi]!.values.map((v, i) => (i === vi ? { ...v, ...p } : v)) });

  const save = async () => {
    setSaving(true);
    setIssues([]);
    try {
      const r = await api<{ id: string }>(productId ? `catalog/products/${productId}` : "catalog/products", { method: productId ? "PUT" : "POST", body: d });
      toast.success("محصول ذخیره شد. سفارش‌های قبلی با قیمت ثبت‌شده خود باقی می‌مانند.");
      if (!productId) router.push(`/panel/catalog/${r.id}`);
      else router.refresh();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setIssues(e.details as { path: string; message: string }[]);
      toast.error(e instanceof ApiError ? e.message : "ذخیره ممکن نشد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {issues.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <p className="font-bold">موارد نامعتبر:</p>
          <ul className="mt-1 list-inside list-disc" dir="ltr">{issues.slice(0, 12).map((i, k) => <li key={k}><code>{i.path}</code>: {i.message}</li>)}</ul>
        </div>
      )}

      <Card>
        <CardHeader title="اطلاعات پایه" />
        <CardBody className="grid gap-4 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="نام"><Input value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="نامک (آدرس)" hint="حروف کوچک لاتین و خط تیره"><Input ltr value={d.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></Field>
          <Field label="زیرعنوان"><Input value={d.subtitle ?? ""} onChange={(e) => set({ subtitle: e.target.value || null })} /></Field>
          <Field label="دسته"><Select value={d.categoryId ?? ""} onChange={(e) => set({ categoryId: e.target.value || null })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="مجموعه قوانین قیمت"><Select value={d.pricingRuleSetId} onChange={(e) => set({ pricingRuleSetId: e.target.value })}>{ruleSets.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="واحد"><Input value={d.unitLabel} onChange={(e) => set({ unitLabel: e.target.value })} /></Field>
          <Field label="حداقل تیراژ"><Input ltr inputMode="numeric" value={String(d.minQuantity)} onChange={(e) => set({ minQuantity: Math.max(1, int(e.target.value)) })} /></Field>
          <Field label="حداکثر تیراژ" hint="خالی = نامحدود"><Input ltr inputMode="numeric" value={d.maxQuantity == null ? "" : String(d.maxQuantity)} onChange={(e) => set({ maxQuantity: e.target.value ? int(e.target.value) : null })} /></Field>
          <Field label="گام تیراژ"><Input ltr inputMode="numeric" value={String(d.quantityStep)} onChange={(e) => set({ quantityStep: Math.max(1, int(e.target.value)) })} /></Field>
          <Field label="تیراژهای پیشنهادی" hint="با ویرگول جدا کنید" className="sm:col-span-2"><Input ltr value={d.quantityPresets.join(", ")} onChange={(e) => set({ quantityPresets: toEnDigits(e.target.value).split(/[,،\s]+/).map(Number).filter((n) => n > 0).slice(0, 8) })} /></Field>
          <Field label="تصویر" hint="مسیر داخلی مانند /catalog/x.svg یا https"><Input ltr value={d.imageUrl ?? ""} onChange={(e) => set({ imageUrl: e.target.value || null })} /></Field>
          <Field label="توضیحات" className="sm:col-span-2 lg:col-span-3"><Textarea value={d.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} /></Field>
          <Field label="نکات برجسته (هر خط یک مورد)" className="sm:col-span-2 lg:col-span-3"><Textarea className="min-h-[70px]" value={d.highlights.join("\n")} onChange={(e) => set({ highlights: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6) })} /></Field>
          <div className="flex flex-wrap gap-4 text-[13px] sm:col-span-2 lg:col-span-3">
            {([["isActive", "فعال در فروشگاه"], ["isFeatured", "ویژه در صفحه اول"], ["requiresArtwork", "نیازمند فایل چاپی"], ["offersDesignService", "ارائه خدمات طراحی"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={d[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<ProductDef>)} />{l}</label>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="روش‌های تولید" description="هر روش با بازه تیراژش. سیستم مقرون‌به‌صرفه‌ترین روش را انتخاب می‌کند؛ همان روش، نوع سفارش (دیجیتال یا افست) را تعیین می‌کند." actions={<Button size="xs" variant="ghost" onClick={() => set({ methods: [...d.methods, { methodCode: "DIGITAL" as const, minQuantity: 1, maxQuantity: null }] })}><Plus /> روش</Button>} />
        <CardBody className="space-y-2 pt-0">
          {d.methods.map((m, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_110px_110px_32px]">
              <Field label={i === 0 ? "روش" : undefined}><Select aria-label="روش" value={m.methodCode} onChange={(e) => set({ methods: d.methods.map((x, j) => (j === i ? { ...x, methodCode: e.target.value as "DIGITAL" | "OFFSET" } : x)) })}>{METHODS.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select></Field>
              <Field label={i === 0 ? "از تیراژ" : undefined}><Input ltr aria-label="از تیراژ" inputMode="numeric" value={String(m.minQuantity)} onChange={(e) => set({ methods: d.methods.map((x, j) => (j === i ? { ...x, minQuantity: Math.max(1, int(e.target.value)) } : x)) })} /></Field>
              <Field label={i === 0 ? "تا تیراژ" : undefined}><Input ltr aria-label="تا تیراژ" inputMode="numeric" value={m.maxQuantity == null ? "" : String(m.maxQuantity)} onChange={(e) => set({ methods: d.methods.map((x, j) => (j === i ? { ...x, maxQuantity: e.target.value ? int(e.target.value) : null } : x)) })} /></Field>
              <Button size="icon-sm" variant="ghost" aria-label="حذف روش" disabled={d.methods.length === 1} onClick={() => set({ methods: d.methods.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="گزینه‌های سفارش" description="هر گزینه می‌تواند جنس کاغذ، رنگ، عملیات تکمیلی، ابعاد، زمان و هزینه را تغییر دهد (اثرها به‌صورت JSON)." actions={<Button size="xs" variant="ghost" onClick={() => set({ groups: [...d.groups, { key: `opt_${d.groups.length + 1}`, label: "گزینه جدید", helpText: null, type: "SELECT", required: true, config: null, isActive: true, values: [{ key: "a", label: "گزینه الف", description: null, effects: {}, isDefault: true, isActive: true }] }] })}><Plus /> گروه</Button>} />
        <CardBody className="space-y-4 pt-0">
          {d.groups.map((g, gi) => (
            <div key={gi} className={cn("rounded-xl border border-line p-4", !g.isActive && "opacity-60")}>
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
                <Field label="عنوان"><Input value={g.label} onChange={(e) => setGroup(gi, { label: e.target.value })} /></Field>
                <Field label="کلید"><Input ltr value={g.key} onChange={(e) => setGroup(gi, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></Field>
                <Field label="نوع"><Select value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value as GroupDef["type"] })}><option value="SELECT">انتخابی</option><option value="NUMBER">عددی</option><option value="TOGGLE">بله/خیر</option></Select></Field>
                <div className="flex items-center gap-1 pb-1">
                  <Button size="icon-sm" variant="ghost" aria-label="بالا" onClick={() => set({ groups: move(d.groups, gi, -1) })}><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="پایین" onClick={() => set({ groups: move(d.groups, gi, 1) })}><ArrowDown /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="حذف گروه" onClick={() => set({ groups: d.groups.filter((_, j) => j !== gi) })}><Trash2 /></Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[12.5px]">
                <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={g.required} onChange={(e) => setGroup(gi, { required: e.target.checked })} />الزامی</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={g.isActive} onChange={(e) => setGroup(gi, { isActive: e.target.checked })} />فعال</label>
              </div>
              <Field label="راهنما" className="mt-3"><Input value={g.helpText ?? ""} onChange={(e) => setGroup(gi, { helpText: e.target.value || null })} /></Field>
              {g.type === "NUMBER" && <div className="mt-3"><JsonField label="پیکربندی عددی" hint='{"min":8,"max":200,"step":4,"default":48,"effect":"PAGES","component":"inner"}' value={g.config} rows={4} onChange={(v) => setGroup(gi, { config: v })} /></div>}
              {g.type === "SELECT" && (
                <div className="mt-4 space-y-2">
                  {g.values.map((v, vi) => (
                    <details key={vi} className="rounded-lg bg-surface-2 px-3 py-2">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px]">
                        <b>{v.label}</b> <bdi dir="ltr" className="text-[11.5px] text-muted">{v.key}</bdi>
                        {v.isDefault && <Badge tone="info">پیش‌فرض</Badge>}
                        {!v.isActive && <Badge>غیرفعال</Badge>}
                        {Object.keys(v.effects).length > 0 && <span className="text-[11.5px] text-muted">اثر: {Object.keys(v.effects).join("، ")}</span>}
                        <span className="ms-auto flex gap-1">
                          <Button size="icon-sm" variant="ghost" aria-label="بالا" onClick={(e) => { e.preventDefault(); setGroup(gi, { values: move(g.values, vi, -1) }); }}><ArrowUp /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label="حذف گزینه" onClick={(e) => { e.preventDefault(); setGroup(gi, { values: g.values.filter((_, j) => j !== vi) }); }}><Trash2 /></Button>
                        </span>
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label="عنوان"><Input value={v.label} onChange={(e) => setValue(gi, vi, { label: e.target.value })} /></Field>
                        <Field label="کلید"><Input ltr value={v.key} onChange={(e) => setValue(gi, vi, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} /></Field>
                        <Field label="توضیح" className="sm:col-span-2"><Input value={v.description ?? ""} onChange={(e) => setValue(gi, vi, { description: e.target.value || null })} /></Field>
                        <div className="flex gap-4 text-[12.5px] sm:col-span-2">
                          <label className="flex items-center gap-1.5"><input type="radio" name={`def-${gi}`} className="size-4 accent-[var(--color-ink)]" checked={v.isDefault} onChange={() => setGroup(gi, { values: g.values.map((x, j) => ({ ...x, isDefault: j === vi })) })} />پیش‌فرض</label>
                          <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={v.isActive} onChange={(e) => setValue(gi, vi, { isActive: e.target.checked })} />فعال</label>
                        </div>
                        <div className="sm:col-span-2"><JsonField label="اثرها" hint='مثلاً {"material":{"component":"body","sku":"P-GL300-70"}} یا {"operations":[{"code":"LAM_MATTE","sides":2}]}' value={v.effects} onChange={(x) => setValue(gi, vi, { effects: x })} /></div>
                      </div>
                    </details>
                  ))}
                  <Button size="xs" variant="ghost" onClick={() => setGroup(gi, { values: [...g.values, { key: `v${g.values.length + 1}`, label: "گزینه جدید", description: null, effects: {}, isDefault: g.values.length === 0, isActive: true }] })}><Plus /> گزینه</Button>
                </div>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="مشخصات فنی" description="بخش‌های محصول (بدنه، جلد، …)، ابعاد برش پیش‌فرض، عملیات پایه و شیوه انتخاب روش تولید." />
        <CardBody className="pt-0"><JsonField label="spec" value={d.spec} rows={14} onChange={(v) => set({ spec: v })} /></CardBody>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur">
          <span className="text-[12.5px] text-muted">قیمت سفارش‌های ثبت‌شده تغییر نمی‌کند.</span>
          <Button loading={saving} onClick={save}>{productId ? "ذخیره تغییرات" : "ایجاد محصول"}</Button>
        </div>
      </div>
    </div>
  );
}
