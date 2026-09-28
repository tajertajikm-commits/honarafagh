"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { METHOD, UNIT } from "@/lib/labels";
import { formatNumber, formatPercent, toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";
import type { BuilderProduct } from "./order-builder";

type Rules = {
  methods: Record<string, Record<string, unknown>>;
  operations: Record<string, Record<string, unknown> & { name: string; basis: string }>;
  flagFees: Record<string, { name: string; flat: number; perUnit: number }>;
  markup: { tiers: { minQty: number; pct: number }[] };
  urgency: Record<string, { multiplier: number; leadDaysFactor: number; label: string }>;
  minimumOrderPrice: number;
  roundTo: number;
  vatPct: number;
  materialCosts: Record<string, number>;
};

const FIELD_LABEL: Record<string, string> = {
  makeReadyCostPerPlate: "هزینه آماده‌سازی هر زینک", runCostPer1000PerColor: "هزینه چاپ هر ۱۰۰۰ برگ در هر رنگ", minRunThousands: "حداقل تیراژ چاپ (هزار)",
  makeReadyWasteSheetsPerColor: "ضایعات راه‌اندازی هر رنگ (برگ)", runningWastePct: "ضایعات حین چاپ (٪)", leadDays: "زمان آماده‌سازی (روز)",
  throughputSheetsPerHour: "سرعت (برگ در ساعت)", makeReadyMinutesPerPlate: "دقیقه راه‌اندازی هر زینک", plateMakingMinutesPerPlate: "دقیقه تهیه هر زینک",
  clickCostColor: "هزینه کلیک رنگی", clickCostBlack: "هزینه کلیک تک‌رنگ", setupCost: "هزینه راه‌اندازی", wastePct: "ضایعات (٪)", minWasteSheets: "حداقل ضایعات (برگ)",
  throughputSidesPerHour: "سرعت (رو در ساعت)", setupMinutes: "دقیقه راه‌اندازی", rate: "نرخ", ratePerLeaf: "نرخ اضافه هر برگ", minCharge: "حداقل هزینه",
};
const BASIS: Record<string, string> = { JOB: "هر کار", UNIT: "هر عدد", THOUSAND_UNITS: "هر ۱۰۰۰ عدد", SHEET: "هر برگ چاپ", SHEET_SIDE: "هر رو", LEAF: "هر برگ محصول", M2: "هر مترمربع" };
const MONEY_KEYS = new Set(["makeReadyCostPerPlate", "runCostPer1000PerColor", "clickCostColor", "clickCostBlack", "setupCost", "rate", "ratePerLeaf", "minCharge"]);

const num = (s: string) => Number(toEnDigits(s).replace(/[^\d.]/g, "") || 0);

function NumInput({ value, onChange, disabled, money, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; money?: boolean; label: string }) {
  // Money is edited in toman, stored in rial.
  const shown = money ? value / 10 : value;
  return <Input ltr aria-label={label} inputMode="decimal" disabled={disabled} value={String(shown)} onChange={(e) => onChange(money ? Math.round(num(e.target.value) * 10) : num(e.target.value))} className="h-9" />;
}

export interface VersionView { id: string; ruleSetId: string; version: number; status: string; notes: string | null; data: Rules }
export interface MaterialInfo { sku: string; name: string; unit: string; standardCost: number }

export function PricingAdmin({ version, publishedId, perms, materials, products, initialProductId }: { version: VersionView; publishedId: string | null; perms: string[]; materials: MaterialInfo[]; products: BuilderProduct[]; initialProductId?: string }) {
  const router = useRouter();
  const { run, pending, toast } = useApiAction();
  const draft = version.status === "DRAFT";
  const canEdit = draft && perms.includes("pricing.edit");
  const [rules, setRules] = useState<Rules>(version.data);
  const [notes, setNotes] = useState(version.notes ?? "");
  const [json, setJson] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const up = (r: Rules) => { setRules(r); setDirty(true); };

  const save = async () => {
    setIssues([]);
    let data: unknown = rules;
    if (json !== null) {
      try { data = JSON.parse(json); } catch { toast.error("JSON نامعتبر است."); return; }
    }
    try {
      await api(`pricing/versions/${version.id}`, { method: "PUT", body: { data, notes: notes || undefined } });
      toast.success("پیش‌نویس ذخیره شد.");
      setDirty(false);
      setJson(null);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setIssues(e.details as never);
      toast.error(e instanceof ApiError ? e.message : "ذخیره ممکن نشد.");
    }
  };

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {!draft && perms.includes("pricing.edit") && <Button size="sm" loading={pending} onClick={() => run(() => api<{ id: string }>(`pricing/versions/${version.id}/draft`, { body: { notes: `بر اساس نسخه ${version.version}` } }), "پیش‌نویس ساخته شد.", (r) => router.push(`/panel/pricing?version=${(r as { id: string }).id}`))}>ساخت پیش‌نویس از این نسخه</Button>}
          {canEdit && <Button size="sm" disabled={!dirty && json === null} onClick={save}>ذخیره پیش‌نویس</Button>}
          {draft && perms.includes("pricing.publish") && <Button size="sm" variant="accent" loading={pending} disabled={dirty} onClick={() => { if (window.confirm("این نسخه منتشر شود؟ قیمت همه محصولات این مجموعه از این لحظه با آن محاسبه می‌شود. سفارش‌ها و پیش‌فاکتورهای قبلی تغییری نمی‌کنند.")) void run(() => api(`pricing/versions/${version.id}/publish`, { method: "POST" }), "نسخه منتشر شد."); }}>انتشار</Button>}
          {canEdit && <Button size="sm" variant="danger-ghost" loading={pending} onClick={() => { if (window.confirm("پیش‌نویس حذف شود؟")) void run(() => api(`pricing/versions/${version.id}/discard`, { method: "POST" }), "پیش‌نویس حذف شد.", () => router.push("/panel/pricing")); }}>حذف پیش‌نویس</Button>}
          {dirty && <span className="text-[12.5px] text-warning">تغییرات ذخیره نشده</span>}
          {!draft && <span className="text-[12.5px] text-muted">نسخه‌های منتشرشده و بایگانی تغییرناپذیرند؛ برای تغییر، پیش‌نویس بسازید.</span>}
        </div>
        {issues.length > 0 && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[12.5px] text-danger" dir="ltr">{issues.slice(0, 10).map((i, k) => <div key={k}><code>{i.path}</code>: {i.message}</div>)}</div>}
        {canEdit && <Field label="یادداشت نسخه"><Input value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="مثلاً: افزایش قیمت کاغذ گلاسه مهر ۱۴۰۵" /></Field>}

        {json !== null ? (
          <Card>
            <CardHeader title="ویرایش پیشرفته (JSON)" actions={<Button size="xs" variant="ghost" onClick={() => setJson(null)}>بازگشت به فرم</Button>} />
            <CardBody className="pt-0"><Textarea dir="ltr" rows={28} spellCheck={false} className="font-mono text-left text-[12px] leading-5" value={json} onChange={(e) => setJson(e.target.value)} /></CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader title="سود، فوریت و گردکردن" actions={canEdit && <Button size="xs" variant="ghost" onClick={() => setJson(JSON.stringify(rules, null, 2))}>JSON</Button>} />
              <CardBody className="grid gap-6 pt-0">
                <div className="max-w-xl">
                  <p className="mb-2 text-[13px] font-bold text-ink-2">پلکان سود (بر اساس تیراژ)</p>
                  <div className="space-y-2">
                    {rules.markup.tiers.map((t, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_32px] items-center gap-2 text-[12.5px]">
                        <label className="flex items-center gap-2">از <NumInput label="از تیراژ" value={t.minQty} disabled={!canEdit} onChange={(n) => up({ ...rules, markup: { tiers: rules.markup.tiers.map((x, j) => (j === i ? { ...x, minQty: n } : x)) } })} /></label>
                        <label className="flex items-center gap-2">سود ٪ <NumInput label="درصد سود" value={t.pct} disabled={!canEdit} onChange={(n) => up({ ...rules, markup: { tiers: rules.markup.tiers.map((x, j) => (j === i ? { ...x, pct: n } : x)) } })} /></label>
                        {canEdit && <Button size="icon-sm" variant="ghost" aria-label="حذف پله" disabled={rules.markup.tiers.length === 1} onClick={() => up({ ...rules, markup: { tiers: rules.markup.tiers.filter((_, j) => j !== i) } })}><Trash2 /></Button>}
                      </div>
                    ))}
                    {canEdit && <Button size="xs" variant="ghost" onClick={() => up({ ...rules, markup: { tiers: [...rules.markup.tiers, { minQty: (rules.markup.tiers.at(-1)?.minQty ?? 0) * 2 || 1000, pct: rules.markup.tiers.at(-1)?.pct ?? 30 }] } })}><Plus /> پله</Button>}
                  </div>
                </div>
                <div className="space-y-3">
                  {Object.entries(rules.urgency).map(([k, u]) => (
                    <div key={k} className="grid max-w-xl grid-cols-[90px_1fr_1fr] items-center gap-3 text-[12.5px]">
                      <span className="font-bold">{u.label}</span>
                      <label className="flex items-center gap-2 whitespace-nowrap">ضریب قیمت <NumInput label={`ضریب ${u.label}`} value={u.multiplier} disabled={!canEdit} onChange={(n) => up({ ...rules, urgency: { ...rules.urgency, [k]: { ...u, multiplier: n } } })} /></label>
                      <label className="flex items-center gap-2 whitespace-nowrap">ضریب زمان <NumInput label={`ضریب زمان ${u.label}`} value={u.leadDaysFactor} disabled={!canEdit} onChange={(n) => up({ ...rules, urgency: { ...rules.urgency, [k]: { ...u, leadDaysFactor: n } } })} /></label>
                    </div>
                  ))}
                  <div className="grid max-w-xl gap-3 pt-2 sm:grid-cols-3">
                    <Field label="حداقل مبلغ سفارش (تومان)"><NumInput label="حداقل مبلغ" money value={rules.minimumOrderPrice} disabled={!canEdit} onChange={(n) => up({ ...rules, minimumOrderPrice: n })} /></Field>
                    <Field label="گردکردن به (تومان)"><NumInput label="گردکردن" money value={rules.roundTo} disabled={!canEdit} onChange={(n) => up({ ...rules, roundTo: Math.max(10, n) })} /></Field>
                    <Field label="مالیات (٪)"><NumInput label="مالیات" value={rules.vatPct} disabled={!canEdit} onChange={(n) => up({ ...rules, vatPct: n })} /></Field>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="روش‌های چاپ" description="مبالغ به تومان." />
              <CardBody className="grid gap-6 pt-0">
                {Object.entries(rules.methods).map(([code, m]) => (
                  <div key={code}>
                    <p className="mb-2 font-bold">{METHOD[code] ?? code}</p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(m).filter(([, v]) => typeof v === "number").map(([k, v]) => (
                        <Field key={k} label={FIELD_LABEL[k] ?? k}><NumInput label={FIELD_LABEL[k] ?? k} money={MONEY_KEYS.has(k)} value={v as number} disabled={!canEdit} onChange={(n) => up({ ...rules, methods: { ...rules.methods, [code]: { ...m, [k]: n } } })} /></Field>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="عملیات تکمیلی و خدمات" description="هزینه راه‌اندازی، نرخ بر اساس مبنا و حداقل هزینه (تومان)." />
              <Table>
                <THead><tr><TH>عملیات</TH><TH>مبنا</TH><TH>راه‌اندازی</TH><TH>نرخ</TH><TH>حداقل</TH></tr></THead>
                <TBody>
                  {Object.entries(rules.operations).map(([code, o]) => (
                    <TR key={code}>
                      <TD><span className="font-bold">{o.name}</span> <bdi dir="ltr" className="text-[11px] text-subtle">{code}</bdi></TD>
                      <TD className="text-[12.5px] text-muted">{BASIS[o.basis] ?? o.basis}</TD>
                      {(["setupCost", "rate", "minCharge"] as const).map((k) => (
                        <TD key={k} className="w-32"><NumInput label={`${o.name} ${FIELD_LABEL[k] ?? k}`} money value={Number(o[k] ?? 0)} disabled={!canEdit} onChange={(n) => up({ ...rules, operations: { ...rules.operations, [code]: { ...o, [k]: n } } })} /></TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="بهای مواد" description="خالی = بهای استاندارد کارت کالا. تغییر قیمت کاغذ اینجا اعمال می‌شود (تومان به ازای هر واحد)." />
              <Table>
                <THead><tr><TH>کالا</TH><TH>واحد</TH><TH className="text-end">بهای استاندارد</TH><TH>بهای این نسخه</TH></tr></THead>
                <TBody>
                  {materials.map((m) => {
                    const override = rules.materialCosts[m.sku];
                    return (
                      <TR key={m.sku}>
                        <TD><span className="font-bold">{m.name}</span> <bdi dir="ltr" className="text-[11px] text-subtle">{m.sku}</bdi></TD>
                        <TD className="text-muted">{UNIT[m.unit] ?? m.unit}</TD>
                        <TD className="text-end text-muted"><Money rial={m.standardCost} unit={false} /></TD>
                        <TD className="w-40">
                          <Input ltr aria-label={`بهای ${m.name}`} inputMode="numeric" className={cn("h-9", override != null && "border-accent")} disabled={!canEdit} placeholder="—" value={override != null ? String(override / 10) : ""} onChange={(e) => {
                            const mc = { ...rules.materialCosts };
                            if (e.target.value.trim() === "") delete mc[m.sku];
                            else mc[m.sku] = Math.round(num(e.target.value) * 10);
                            up({ ...rules, materialCosts: mc });
                          }} />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          </>
        )}
      </div>
      <aside className="2xl:sticky 2xl:top-20 2xl:h-fit">
        <Simulator versionId={version.id} publishedId={publishedId} isDraft={draft} dirty={dirty} products={products} initialProductId={initialProductId} />
      </aside>
    </div>
  );
}

function defaultSelections(product: BuilderProduct | undefined) {
  const s: Record<string, string | number | boolean> = {};
  for (const g of product?.groups ?? []) {
    if (g.type === "SELECT") {
      const d = g.values.find((v) => v.isDefault) ?? g.values[0];
      if (d) s[g.key] = d.key;
    } else if (g.type === "NUMBER" && g.config?.default != null) s[g.key] = g.config.default;
    else if (g.type === "TOGGLE") s[g.key] = false;
  }
  return s;
}

interface Breakdown { subtotal: number; total: number; costTotal: number; profit: number; marginPct: number; unitPrice: number; leadDays: number; method: string; markupPct: number; lines: { code: string; label: string; category: string; quantity: number; unit: string; amount: number }[]; impositions: { name: string; ups: number; pressSheets: number; stockSheets: number; forms: number; wasteSheets: number }[]; alternatives: { method: string; costTotal: number; subtotal: number }[]; warnings: string[] }

function Simulator({ versionId, publishedId, isDraft, dirty, products, initialProductId }: { versionId: string; publishedId: string | null; isDraft: boolean; dirty: boolean; products: BuilderProduct[]; initialProductId?: string }) {
  const [productId, setProductId] = useState(initialProductId && products.some((p) => p.id === initialProductId) ? initialProductId : (products[0]?.id ?? ""));
  const product = products.find((p) => p.id === productId);
  const [qty, setQty] = useState(String(product?.quantityPresets[1] ?? product?.minQuantity ?? 100));
  const [urgency, setUrgency] = useState("STANDARD");
  const [result, setResult] = useState<{ current?: Breakdown; published?: Breakdown; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(() => defaultSelections(product));

  const runSim = async () => {
    if (!product) return;
    setLoading(true);
    const body = (v: string) => ({ versionId: v, productId, quantity: Number(toEnDigits(qty)) || product.minQuantity, selections: sel, urgency });
    try {
      const current = await api<Breakdown>("pricing/simulate", { body: body(versionId) });
      const published = isDraft && publishedId ? await api<Breakdown>("pricing/simulate", { body: body(publishedId) }) : undefined;
      setResult({ current, published });
    } catch (e) {
      setResult({ error: e instanceof ApiError ? e.message : "محاسبه ممکن نشد." });
    } finally {
      setLoading(false);
    }
  };

  const c = result?.current;
  const p = result?.published;
  const delta = c && p ? ((c.subtotal - p.subtotal) / Math.max(1, p.subtotal)) * 100 : null;
  return (
    <Card>
      <CardHeader title="شبیه‌ساز قیمت" description={isDraft ? "مقایسه پیش‌نویس (ذخیره‌شده) با نسخه منتشرشده" : "محاسبه با این نسخه"} />
      <CardBody className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-2">
          <Field label="محصول" className="col-span-2"><Select value={productId} onChange={(e) => { setProductId(e.target.value); const np = products.find((x) => x.id === e.target.value); setQty(String(np?.quantityPresets[1] ?? np?.minQuantity ?? 100)); setSel(defaultSelections(np)); setResult(null); }}>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="تیراژ"><Input ltr inputMode="numeric" value={qty} onChange={(e) => setQty(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
          <Field label="فوریت"><Select value={urgency} onChange={(e) => setUrgency(e.target.value)}><option value="STANDARD">عادی</option><option value="EXPRESS">فوری</option><option value="RUSH">خیلی فوری</option></Select></Field>
          {(product?.groups ?? []).filter((g) => g.type === "SELECT").map((g) => (
            <Field key={g.key} label={g.label}><Select value={String(sel[g.key] ?? "")} onChange={(e) => setSel({ ...sel, [g.key]: e.target.value })}>{!g.required && <option value="">—</option>}{g.values.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</Select></Field>
          ))}
        </div>
        <Button className="w-full" loading={loading} onClick={runSim}>محاسبه</Button>
        {dirty && <p className="text-[12px] text-warning">شبیه‌سازی با آخرین نسخه ذخیره‌شده انجام می‌شود.</p>}
        {result?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{result.error}</p>}
        {c && (
          <div className="space-y-3 text-[13px]">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-baseline justify-between"><span className="text-muted">قیمت فروش (بدون مالیات)</span><Money rial={c.subtotal} strong className="text-[17px]" /></div>
              {p && <div className="mt-1 flex justify-between text-[12.5px]"><span className="text-muted">نسخه منتشرشده</span><span><Money rial={p.subtotal} /> {delta != null && <Badge tone={delta > 0 ? "warning" : delta < 0 ? "success" : "neutral"} className="ms-1" >{delta > 0 ? "+" : ""}{formatPercent(delta)}</Badge>}</span></div>}
              <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                <div><span className="block text-muted">بهای تمام‌شده</span><Money rial={c.costTotal} unit={false} /></div>
                <div><span className="block text-muted">سود</span><Money rial={c.profit} unit={false} /> <span className="text-muted">({formatPercent(c.marginPct)})</span></div>
                <div><span className="block text-muted">روش • زمان</span>{METHOD[c.method] ?? c.method} • {formatNumber(c.leadDays)} روز</div>
              </div>
            </div>
            {c.alternatives.length > 1 && (
              <table className="w-full text-[12px]"><caption className="mb-1 text-start font-bold text-muted">مقایسه روش‌ها</caption><thead><tr className="text-muted"><th className="text-start font-medium">روش</th><th className="text-end font-medium">بهای تمام‌شده</th><th className="text-end font-medium">فروش</th></tr></thead><tbody>{c.alternatives.map((a) => <tr key={a.method} className={cn(a.method === c.method && "font-bold")}><td>{METHOD[a.method] ?? a.method}{a.method === c.method && " ✓"}</td><td className="text-end"><Money rial={a.costTotal} unit={false} /></td><td className="text-end"><Money rial={a.subtotal} unit={false} /></td></tr>)}</tbody></table>
            )}
            {c.impositions.map((im, i) => <p key={i} className="text-[12px] text-muted">{im.name}: {formatNumber(im.ups)} عدد در فرم • {formatNumber(im.pressSheets)} برگ چاپ (ضایعات {formatNumber(im.wasteSheets)}) • {formatNumber(im.stockSheets)} برگ کامل</p>)}
            <div>
              <p className="mb-1 text-[12px] font-bold text-muted">ریز هزینه</p>
              <ul className="divide-y divide-line text-[12px]">
                {c.lines.map((l, i) => <li key={i} className="flex justify-between gap-2 py-1"><span className="truncate">{l.label} <span className="text-subtle">• {formatNumber(l.quantity, { decimals: true })} {UNIT[l.unit] ?? l.unit}</span></span><Money rial={l.amount} unit={false} /></li>)}
              </ul>
            </div>
            {c.warnings.length > 0 && <ul className="text-[12px] text-warning">{c.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
