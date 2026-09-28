"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDuration, toEnDigits, toFaDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

type Condition = { type: "ALWAYS" } | { type: "IF_OPERATION"; stepType: string } | { type: "IF_FLAG"; flag: string } | { type: "IF_NOT_FLAG"; flag: string } | { type: "ANY" | "ALL"; of: Condition[] };
type Gate = { kind: "FILE_APPROVAL" } | { kind: "MATERIAL"; purposes: ("PAPER" | "PLATE" | "OPERATION")[] } | { kind: "PAYMENT" } | null;
export interface StepDef {
  key: string;
  name: string;
  stepType: string;
  dependsOn: string[];
  condition: Condition;
  gate: Gate;
  machineType: string | null;
  defaultMinutes: number;
  minLagMinutes: number;
  isQc: boolean;
  reworkTargets: string[];
  milestone: string;
  checklist: string[];
}

const MILESTONE: Record<string, string> = { FILE: "فایل", MATERIALS: "تأمین مواد", PRODUCTION: "چاپ", FINISHING: "تکمیلی", QC: "کنترل کیفیت", PACKAGING: "بسته‌بندی" };
const GATE: Record<string, string> = { FILE_APPROVAL: "تأیید فایل", MATERIAL: "آماده‌بودن مواد", PAYMENT: "پیش‌پرداخت" };
const PURPOSE: Record<string, string> = { PAPER: "کاغذ", PLATE: "زینک", OPERATION: "ملزومات" };

export function conditionText(c: Condition, stepName: (code: string) => string): string {
  switch (c.type) {
    case "ALWAYS": return "همیشه";
    case "IF_OPERATION": return `اگر ${stepName(c.stepType)} انتخاب شده باشد`;
    case "IF_FLAG": return `اگر ${c.flag}`;
    case "IF_NOT_FLAG": return `اگر نه ${c.flag}`;
    case "ANY": return c.of.map((x) => conditionText(x, stepName)).join(" یا ");
    case "ALL": return c.of.map((x) => conditionText(x, stepName)).join(" و ");
  }
}

/** Longest-path levels: steps in the same column can run in parallel. */
function levels(steps: StepDef[]) {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const memo = new Map<string, number>();
  const visit = (k: string, seen: Set<string>): number => {
    if (memo.has(k)) return memo.get(k)!;
    if (seen.has(k)) return 0; // cycle: the server rejects it, keep the view alive
    seen.add(k);
    const s = byKey.get(k);
    const l = s && s.dependsOn.length ? 1 + Math.max(...s.dependsOn.filter((d) => byKey.has(d)).map((d) => visit(d, seen)), -1) : 0;
    memo.set(k, l);
    return l;
  };
  const cols: StepDef[][] = [];
  for (const s of steps) {
    const l = visit(s.key, new Set());
    (cols[l] ??= []).push(s);
  }
  return cols.filter(Boolean);
}

export function WorkflowGraph({ steps, stepTypes, machineTypes }: { steps: StepDef[]; stepTypes: Record<string, string>; machineTypes: Record<string, string> }) {
  const cols = useMemo(() => levels(steps), [steps]);
  const name = (code: string) => stepTypes[code] ?? code;
  return (
    <div className="scrollbar-thin overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-3">
        {cols.map((col, i) => (
          <div key={i} className="flex w-56 flex-col gap-2">
            <p className="text-[11px] font-bold text-subtle">گام {toFaDigits(i + 1)}{col.length > 1 && ` • ${toFaDigits(col.length)} مسیر موازی`}</p>
            {col.map((s) => (
              <div key={s.key} className={cn("rounded-xl border bg-surface p-3 text-[12px] shadow-soft", s.gate ? "border-dashed border-line-strong" : s.isQc ? "border-violet/40" : "border-line")}>
                <p className="text-[13px] font-bold leading-6">{s.name}</p>
                <p className="text-muted">{name(s.stepType)}{s.machineType && ` • ${machineTypes[s.machineType] ?? s.machineType}`}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.gate && <Badge tone="info">دروازه: {GATE[s.gate.kind]}{s.gate.kind === "MATERIAL" && ` (${s.gate.purposes.map((p) => PURPOSE[p]).join("، ")})`}</Badge>}
                  {s.condition.type !== "ALWAYS" && <Badge tone="warning">{conditionText(s.condition, name)}</Badge>}
                  {s.isQc && <Badge tone="violet">QC ← {s.reworkTargets.length} مقصد</Badge>}
                  {s.minLagMinutes > 0 && <Badge>انتظار {formatDuration(s.minLagMinutes)}</Badge>}
                  {s.defaultMinutes > 0 && <Badge>{formatDuration(s.defaultMinutes)}</Badge>}
                </div>
                {s.dependsOn.length > 0 && <p className="mt-1.5 text-[11px] text-subtle">پس از: {s.dependsOn.map((d) => steps.find((x) => x.key === d)?.name ?? d).join("، ")}</p>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkflowEditor({ templateId, status, initialSteps, name, stepTypes, machineTypes, canEdit }: {
  templateId: string;
  status: string;
  initialSteps: StepDef[];
  name: string;
  stepTypes: { code: string; name: string; machineTypeCode: string | null }[];
  machineTypes: { code: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { run, pending, toast } = useApiAction();
  const draft = status === "DRAFT";
  const editable = draft && canEdit;
  const [steps, setSteps] = useState<StepDef[]>(initialSteps);
  const [issues, setIssues] = useState<{ step?: string; message: string }[]>([]);
  const [json, setJson] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const stName = Object.fromEntries(stepTypes.map((s) => [s.code, s.name]));
  const mtName = Object.fromEntries(machineTypes.map((m) => [m.code, m.name]));
  const up = (i: number, p: Partial<StepDef>) => { setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s))); setDirty(true); };

  const save = async () => {
    setIssues([]);
    let payload = steps;
    if (json !== null) {
      try { payload = JSON.parse(json); } catch { toast.error("JSON نامعتبر است."); return; }
    }
    try {
      await api(`workflows/${templateId}`, { method: "PUT", body: { steps: payload } });
      toast.success("پیش‌نویس گردش‌کار ذخیره شد.");
      if (json !== null) { setSteps(payload); setJson(null); }
      setDirty(false);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setIssues((e.details as { step?: string; message: string; path?: unknown }[]).map((d) => ({ step: d.step ?? (Array.isArray(d.path) ? d.path.join(".") : undefined), message: d.message })));
      toast.error(e instanceof ApiError ? e.message : "ذخیره ممکن نشد.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {!draft && canEdit && <Button size="sm" loading={pending} onClick={() => run(() => api<{ id: string }>(`workflows/${templateId}/draft`, { method: "POST" }), "پیش‌نویس ساخته شد.", (r) => router.push(`/panel/workflows?id=${(r as { id: string }).id}`))}>ساخت نسخه جدید (پیش‌نویس)</Button>}
        {editable && <Button size="sm" disabled={!dirty && json === null} onClick={save}>ذخیره</Button>}
        {editable && <Button size="sm" variant="accent" disabled={dirty} loading={pending} onClick={() => { if (window.confirm(`«${name}» با این مراحل فعال شود؟ کارهای در جریان با نسخه قبلی ادامه می‌دهند؛ فقط اقلام جدید از این نسخه استفاده می‌کنند.`)) void run(() => api(`workflows/${templateId}/activate`, { method: "POST" }), "نسخه جدید فعال شد."); }}>فعال‌سازی</Button>}
        {editable && <Button size="sm" variant="ghost" onClick={() => setJson(json === null ? JSON.stringify(steps, null, 2) : null)}>{json === null ? "JSON" : "بازگشت به فرم"}</Button>}
        {dirty && <span className="text-[12.5px] text-warning">تغییرات ذخیره نشده</span>}
      </div>
      {issues.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[12.5px] text-danger">
          {issues.slice(0, 12).map((i, k) => <p key={k}>{i.step && <bdi dir="ltr" className="font-bold">{i.step}: </bdi>}{i.message}</p>)}
        </div>
      )}
      <Card>
        <CardHeader title="نمودار مراحل" description="ستون‌ها به ترتیب اجرا (راست به چپ)؛ مراحل هم‌ستون موازی اجرا می‌شوند. مراحل شرطی فقط وقتی ساخته می‌شوند که گزینه مربوط انتخاب شده باشد." />
        <CardBody className="pt-0"><WorkflowGraph steps={steps} stepTypes={stName} machineTypes={mtName} /></CardBody>
      </Card>

      {json !== null ? (
        <Textarea dir="ltr" rows={30} spellCheck={false} className="font-mono text-left text-[12px] leading-5" value={json} onChange={(e) => setJson(e.target.value)} />
      ) : editable ? (
        <Card>
          <CardHeader title="مراحل" actions={<Button size="xs" variant="ghost" onClick={() => { setSteps([...steps, { key: `STEP_${steps.length + 1}`, name: "مرحله جدید", stepType: stepTypes[0]?.code ?? "", dependsOn: steps.length ? [steps[steps.length - 1]!.key] : [], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 30, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "PRODUCTION", checklist: [] }]); setDirty(true); }}><Plus /> مرحله</Button>} />
          <CardBody className="space-y-3 pt-0">
            {steps.map((s, i) => (
              <details key={i} className="rounded-xl border border-line px-4 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px]">
                  <b>{s.name}</b> <bdi dir="ltr" className="text-[11px] text-subtle">{s.key}</bdi>
                  <span className="text-muted">• {stName[s.stepType] ?? s.stepType}</span>
                  {s.dependsOn.length > 0 && <span className="text-[12px] text-muted">پس از {s.dependsOn.join("، ")}</span>}
                  <Button size="icon-sm" variant="ghost" aria-label="حذف مرحله" className="ms-auto" onClick={(e) => { e.preventDefault(); setSteps(steps.filter((_, j) => j !== i).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => d !== s.key), reworkTargets: x.reworkTargets.filter((d) => d !== s.key) }))); setDirty(true); }}><Trash2 /></Button>
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="عنوان"><Input value={s.name} onChange={(e) => up(i, { name: e.target.value })} /></Field>
                  <Field label="کلید"><Input ltr value={s.key} onChange={(e) => up(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} /></Field>
                  <Field label="نوع مرحله"><Select value={s.stepType} onChange={(e) => { const t = stepTypes.find((x) => x.code === e.target.value); up(i, { stepType: e.target.value, machineType: t?.machineTypeCode ?? s.machineType }); }}>{stepTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select></Field>
                  <Field label="نوع ماشین"><Select value={s.machineType ?? ""} onChange={(e) => up(i, { machineType: e.target.value || null })}><option value="">— بدون ماشین —</option>{machineTypes.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
                  <Field label="زمان پیش‌فرض (دقیقه)"><Input ltr inputMode="numeric" value={String(s.defaultMinutes)} onChange={(e) => up(i, { defaultMinutes: Number(toEnDigits(e.target.value).replace(/\D/g, "") || 0) })} /></Field>
                  <Field label="حداقل انتظار پس از پیش‌نیاز (دقیقه)" hint="مثلاً خشک‌شدن مرکب"><Input ltr inputMode="numeric" value={String(s.minLagMinutes)} onChange={(e) => up(i, { minLagMinutes: Number(toEnDigits(e.target.value).replace(/\D/g, "") || 0) })} /></Field>
                  <Field label="مرحله مشتری"><Select value={s.milestone} onChange={(e) => up(i, { milestone: e.target.value })}>{Object.entries(MILESTONE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <Field label="دروازه خودکار">
                    <Select value={s.gate?.kind ?? ""} onChange={(e) => up(i, { gate: e.target.value === "" ? null : e.target.value === "MATERIAL" ? { kind: "MATERIAL", purposes: ["PAPER"] } : ({ kind: e.target.value } as Gate), condition: e.target.value ? { type: "ALWAYS" } : s.condition })}>
                      <option value="">—</option>{Object.entries(GATE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  {s.gate?.kind === "MATERIAL" && (
                    <div className="flex items-center gap-3 text-[12.5px] sm:col-span-2">
                      {(["PAPER", "PLATE", "OPERATION"] as const).map((p) => <label key={p} className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={s.gate?.kind === "MATERIAL" && s.gate.purposes.includes(p)} onChange={(e) => { const cur = s.gate?.kind === "MATERIAL" ? s.gate.purposes : []; up(i, { gate: { kind: "MATERIAL", purposes: e.target.checked ? [...cur, p] : cur.filter((x) => x !== p) } }); }} />{PURPOSE[p]}</label>)}
                    </div>
                  )}
                  <Field label="پیش‌نیازها" className="sm:col-span-2">
                    <div className="flex flex-wrap gap-1.5">
                      {steps.filter((x) => x.key !== s.key).map((x) => {
                        const on = s.dependsOn.includes(x.key);
                        return <button key={x.key} type="button" aria-pressed={on} onClick={() => up(i, { dependsOn: on ? s.dependsOn.filter((d) => d !== x.key) : [...s.dependsOn, x.key] })} className={cn("rounded-md border px-2 py-1 text-[12px]", on ? "border-ink bg-ink text-surface" : "border-line-strong text-ink-2 hover:bg-surface-2")}>{x.name}</button>;
                      })}
                    </div>
                  </Field>
                  {!s.gate && (
                    <Field label="شرط ایجاد مرحله" className="sm:col-span-2">
                      <div className="flex gap-2">
                        <Select value={["ANY", "ALL"].includes(s.condition.type) ? "JSON" : s.condition.type} onChange={(e) => {
                          const t = e.target.value;
                          up(i, { condition: t === "ALWAYS" ? { type: "ALWAYS" } : t === "IF_OPERATION" ? { type: "IF_OPERATION", stepType: s.stepType } : t === "IF_FLAG" ? { type: "IF_FLAG", flag: "NEEDS_DESIGN" } : t === "IF_NOT_FLAG" ? { type: "IF_NOT_FLAG", flag: "NEEDS_DESIGN" } : s.condition });
                        }}>
                          <option value="ALWAYS">همیشه</option><option value="IF_OPERATION">اگر این عملیات انتخاب شده</option><option value="IF_FLAG">اگر پرچم</option><option value="IF_NOT_FLAG">اگر نه پرچم</option>{["ANY", "ALL"].includes(s.condition.type) && <option value="JSON">ترکیبی (از طریق JSON)</option>}
                        </Select>
                        {s.condition.type === "IF_OPERATION" && <Select aria-label="عملیات" value={s.condition.stepType} onChange={(e) => up(i, { condition: { type: "IF_OPERATION", stepType: e.target.value } })}>{stepTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select>}
                        {(s.condition.type === "IF_FLAG" || s.condition.type === "IF_NOT_FLAG") && <Input ltr aria-label="پرچم" value={s.condition.flag} onChange={(e) => up(i, { condition: { type: s.condition.type as "IF_FLAG", flag: e.target.value.toUpperCase().replace(/[^A-Z_]/g, "") } })} />}
                      </div>
                    </Field>
                  )}
                  <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={s.isQc} onChange={(e) => up(i, { isQc: e.target.checked, reworkTargets: e.target.checked ? s.reworkTargets : [] })} />مرحله کنترل کیفیت</label>
                  {s.isQc && (
                    <Field label="مقاصد دوباره‌کاری" className="sm:col-span-2 lg:col-span-3">
                      <div className="flex flex-wrap gap-1.5">
                        {steps.filter((x) => x.key !== s.key && !x.gate).map((x) => {
                          const on = s.reworkTargets.includes(x.key);
                          return <button key={x.key} type="button" aria-pressed={on} onClick={() => up(i, { reworkTargets: on ? s.reworkTargets.filter((d) => d !== x.key) : [...s.reworkTargets, x.key] })} className={cn("rounded-md border px-2 py-1 text-[12px]", on ? "border-violet bg-violet text-white" : "border-line-strong text-ink-2 hover:bg-surface-2")}>{x.name}</button>;
                        })}
                      </div>
                    </Field>
                  )}
                  <Field label="چک‌لیست (هر خط یک مورد)" className="sm:col-span-2 lg:col-span-4"><Textarea className="min-h-[60px]" value={s.checklist.join("\n")} onChange={(e) => up(i, { checklist: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field>
                </div>
              </details>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
