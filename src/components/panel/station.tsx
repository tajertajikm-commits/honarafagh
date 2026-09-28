"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Pause, Play, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DateText, EmptyState } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ISSUE_TYPE, METHOD, PRIORITY, TASK_STATUS, UNIT } from "@/lib/labels";
import { formatDuration, formatNumber, formatTime, toEnDigits, toFaDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface StationQueueItem {
  id: string;
  name: string;
  status: string;
  stepColor: string | null;
  orderNumber: number;
  orderPriority: string;
  customerName: string;
  itemTitle: string;
  itemQuantity: number;
  itemUnit: string;
  dueDate: string | null;
  estimatedMinutes: number;
  isQc: boolean;
  earliestStartAt: string | null;
  mine: boolean;
}

export interface StationDetail {
  id: string;
  name: string;
  status: string;
  isQc: boolean;
  attempt: number;
  reworkReason: string | null;
  blockedReason: string | null;
  orderId: string;
  orderNumber: number;
  customerName: string;
  itemTitle: string;
  quantityPlanned: number;
  unit: string;
  machineTypeCode: string | null;
  machineId: string | null;
  machineName: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
  runningSince: string | null;
  earliestStartAt: string | null;
  checklist: string[];
  reworkTargets: { key: string; name: string }[];
  spec: { summary: { group: string; value: string }[]; method: string; impositions: { component: string; name: string; ups: number; forms: number; runSheets: number; wasteSheets: number; pressSheets: number; stockSheets: number; plates: number; colorsFront: number; colorsBack: number }[] } | null;
  requirements: { id: string; name: string; sku: string; unit: string; issued: number; consumed: number; wasted: number; returned: number; required: number }[];
  machineCandidates: { id: string; name: string; code: string; status: string }[];
  defectTypes: { code: string; name: string }[];
  printFile: { id: string; name: string; versionNo: number } | null;
  events: { id: string; type: string; note: string | null; actor: string | null; createdAt: string }[];
}

export function Station({ queue, detail, basePath, emptyTitle = "کاری در صف شما نیست" }: { queue: StationQueueItem[]; detail: StationDetail | null; basePath: string; emptyTitle?: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
      <Card className="overflow-hidden lg:sticky lg:top-20">
        <CardHeader title="صف کار" description={`${formatNumber(queue.length)} کار`} />
        {queue.length === 0 ? (
          <EmptyState title={emptyTitle} description="کارهای جدید با آماده‌شدن پیش‌نیازها اینجا ظاهر می‌شوند." />
        ) : (
          <ul className="scrollbar-thin max-h-[70vh] overflow-y-auto border-t border-line">
            {queue.map((q) => (
              <li key={q.id}>
                <Link href={`${basePath}?task=${q.id}`} className={cn("block border-b border-line px-5 py-3.5 transition-colors last:border-0 hover:bg-surface-2/60", detail?.id === q.id && "bg-surface-2")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13.5px] font-bold">
                      <span className="size-2 rounded-full" style={{ background: q.stepColor ?? "var(--color-subtle)" }} />
                      {q.name}
                    </span>
                    <Status map={TASK_STATUS} value={q.status} />
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-2">سفارش {toFaDigits(q.orderNumber)} · {q.itemTitle} · {formatNumber(q.itemQuantity)} {q.itemUnit}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                    {q.orderPriority !== "NORMAL" && <Status map={PRIORITY} value={q.orderPriority} />}
                    {q.dueDate && <span>موعد <DateText value={q.dueDate} /></span>}
                    <span>{formatDuration(q.estimatedMinutes)}</span>
                    {q.mine && <Badge tone="info">سپرده به من</Badge>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {detail ? <TaskView key={detail.id + detail.status} d={detail} /> : <div />}
    </div>
  );
}

function useElapsed(since: string | null, base: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return base;
  return base + Math.max(0, (now - new Date(since).getTime()) / 60_000);
}

function TaskView({ d }: { d: StationDetail }) {
  const { run, pending } = useApiAction();
  const [machineId, setMachineId] = useState(d.machineId ?? d.machineCandidates.find((m) => m.status === "ACTIVE")?.id ?? "");
  const [dialog, setDialog] = useState<null | "complete" | "issue" | "qc">(null);
  const elapsed = useElapsed(d.status === "IN_PROGRESS" ? d.runningSince : null, d.actualMinutes);
  const waiting = d.earliestStartAt && new Date(d.earliestStartAt) > new Date();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const progress = d.estimatedMinutes ? Math.min(1, elapsed / d.estimatedMinutes) : 0;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="brand-spectrum-rtl h-1" />
        <CardBody className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted">
                <Link href={`/panel/orders/${d.orderId}`} className="font-bold hover:text-accent-ink">سفارش {toFaDigits(d.orderNumber)}</Link> · {d.customerName}
              </p>
              <h2 className="mt-1 text-[26px] font-bold leading-tight">{d.name}</h2>
              <p className="mt-1 text-[15px] text-ink-2">{d.itemTitle} · <b className="tabular">{formatNumber(d.quantityPlanned)}</b> {d.unit}{d.attempt > 1 && <Badge tone="danger" className="ms-2">دوباره‌کاری — اجرای {toFaDigits(d.attempt)}</Badge>}</p>
              {d.reworkReason && d.attempt > 1 && <p className="mt-1 text-[13px] text-danger">علت: {d.reworkReason}</p>}
            </div>
            <div className="text-end">
              <Status map={TASK_STATUS} value={d.status} />
              <p className="mt-2 flex items-center justify-end gap-1.5 text-[13px] text-muted"><Timer className="size-4" /> <span className="tabular text-[20px] font-bold text-ink">{formatDuration(elapsed) === "—" ? "۰ دقیقه" : formatDuration(elapsed)}</span></p>
              <p className="text-[12px] text-muted">از {formatDuration(d.estimatedMinutes)} برآورد</p>
            </div>
          </div>
          {d.status === "IN_PROGRESS" && d.estimatedMinutes > 0 && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className={cn("h-full rounded-full transition-[width]", progress >= 1 ? "bg-danger" : "bg-[var(--color-series)]")} style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          {d.status === "BLOCKED" && <p className="mt-4 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger"><AlertTriangle className="size-5" /> متوقف به دلیل مشکل: {d.blockedReason} — منتظر رسیدگی سرپرست</p>}
          {waiting && d.status === "READY" && <p className="mt-4 flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-[14px] text-warning"><Clock className="size-5" /> این مرحله پس از زمان انتظار (خشک‌شدن مرکب) از ساعت {formatTime(d.earliestStartAt)} قابل شروع است.</p>}

          {/* Primary actions: large targets for tablets */}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            {d.status === "READY" && d.machineTypeCode && d.machineCandidates.length > 0 && (
              <Field label="ماشین" className="min-w-[220px]">
                <Select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="h-12">
                  {d.machineCandidates.map((m) => <option key={m.id} value={m.id} disabled={m.status !== "ACTIVE"}>{m.name}{m.status !== "ACTIVE" ? " (غیرفعال)" : ""}</option>)}
                </Select>
              </Field>
            )}
            {d.status === "READY" && !d.isQc && <Button size="lg" className="h-14 min-w-44 text-[16px]" loading={pending} disabled={!!waiting} onClick={() => run(() => api(`production/tasks/${d.id}/start`, { body: { machineId: machineId || null } }), "کار شروع شد.")}><Play /> شروع کار</Button>}
            {d.status === "PAUSED" && <Button size="lg" className="h-14 min-w-44 text-[16px]" loading={pending} onClick={() => run(() => api(`production/tasks/${d.id}/resume`, { method: "POST" }), "کار ادامه یافت.")}><Play /> ادامه کار</Button>}
            {d.status === "IN_PROGRESS" && !d.isQc && <Button size="lg" variant="accent" className="h-14 min-w-44 text-[16px]" onClick={() => setDialog("complete")}><CheckCircle2 /> پایان کار</Button>}
            {d.isQc && ["READY", "IN_PROGRESS", "PAUSED"].includes(d.status) && <Button size="lg" variant="accent" className="h-14 min-w-44 text-[16px]" onClick={() => setDialog("qc")}><CheckCircle2 /> ثبت نتیجه بازرسی</Button>}
            {d.status === "IN_PROGRESS" && <Button size="lg" variant="secondary" className="h-14" loading={pending} onClick={() => run(() => api(`production/tasks/${d.id}/pause`, { body: {} }), "کار متوقف شد.")}><Pause /> توقف موقت</Button>}
            {["READY", "IN_PROGRESS", "PAUSED"].includes(d.status) && <Button size="lg" variant="danger-ghost" className="h-14" onClick={() => setDialog("issue")}><AlertTriangle /> گزارش مشکل</Button>}
          </div>
          {d.machineName && d.status !== "READY" && <p className="mt-3 text-[13px] text-muted">ماشین: <b className="text-ink">{d.machineName}</b></p>}
        </CardBody>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="مشخصات کار" icon={<FileText />} />
          <CardBody className="space-y-3 pt-0">
            {d.printFile ? (
              <a href={`/api/v1/files/${d.printFile.id}`} className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-[13.5px]">
                <Download className="size-5 text-success" />
                <span className="flex-1"><b>فایل نهایی چاپ</b> — نسخه {toFaDigits(d.printFile.versionNo)}<span className="block truncate text-[12px] text-muted" dir="auto">{d.printFile.name}</span></span>
              </a>
            ) : <p className="rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-warning">فایل تأییدشده برای چاپ هنوز ثبت نشده است.</p>}
            {d.spec && (
              <>
                <ul className="space-y-1.5 text-[13px]">
                  <li className="flex justify-between"><span className="text-muted">روش</span><b>چاپ {METHOD[d.spec.method]}</b></li>
                  {d.spec.summary.map((s) => <li key={s.group} className="flex justify-between gap-3"><span className="text-muted">{s.group}</span><b className="text-end">{toFaDigits(s.value)}</b></li>)}
                </ul>
                <div className="space-y-2">
                  {d.spec.impositions.map((im) => (
                    <div key={im.component} className="rounded-xl bg-surface-2/60 px-4 py-3 text-[13px]">
                      <p className="font-bold">{im.name} — {toFaDigits(im.colorsFront)}/{toFaDigits(im.colorsBack)} رنگ</p>
                      <p className="mt-1 text-ink-2">{toFaDigits(im.ups)} عدد در هر برگ · {toFaDigits(im.forms)} فرم · <b>{formatNumber(im.runSheets)}</b> برگ چاپ + {formatNumber(im.wasteSheets)} برگ ضایعات مجاز{im.plates ? ` · ${toFaDigits(im.plates)} زینک` : ""}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardBody>
        </Card>
        <div className="space-y-5">
          {d.requirements.length > 0 && (
            <Card>
              <CardHeader title="مواد این مرحله" description="مقدار حواله‌شده از انبار به سالن" />
              <CardBody className="space-y-2 pt-0">
                {d.requirements.map((r) => {
                  const left = r.issued - r.consumed - r.wasted - r.returned;
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5 text-[13px]">
                      <span><b>{r.name}</b><span className="block text-[11.5px] text-muted">نیاز {formatNumber(r.required)} {UNIT[r.unit]}</span></span>
                      <span className="text-end">
                        <span className={cn("block font-bold tabular", r.issued < r.required && "text-warning")}>{formatNumber(r.issued)} حواله</span>
                        <span className="text-[11.5px] text-muted">{formatNumber(left)} در دست</span>
                      </span>
                    </div>
                  );
                })}
                {d.requirements.some((r) => r.issued < r.required) && <p className="text-[12px] text-warning">بخشی از مواد هنوز از انبار حواله نشده است.</p>}
              </CardBody>
            </Card>
          )}
          {d.checklist.length > 0 && !d.isQc && (
            <Card>
              <CardHeader title="چک‌لیست" />
              <CardBody className="space-y-1.5 pt-0">
                {d.checklist.map((c) => (
                  <label key={c} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-[14px] hover:bg-surface-2">
                    <input type="checkbox" className="size-5 accent-[var(--color-ink)]" checked={!!checked[c]} onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })} />
                    {c}
                  </label>
                ))}
              </CardBody>
            </Card>
          )}
          {d.events.length > 0 && (
            <Card>
              <CardHeader title="سابقه" />
              <CardBody className="space-y-1.5 pt-0 text-[12.5px]">
                {d.events.slice(0, 8).map((e) => (
                  <p key={e.id} className="text-muted"><span className="text-ink-2">{EVENT[e.type] ?? e.type}</span>{e.note ? ` — ${e.note}` : ""} · {e.actor ?? "سیستم"} · <DateText value={e.createdAt} relative /></p>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <CompleteDialog d={d} open={dialog === "complete"} onClose={() => setDialog(null)} />
      <IssueDialog taskId={d.id} open={dialog === "issue"} onClose={() => setDialog(null)} />
      {d.isQc && <InspectionDialog d={d} open={dialog === "qc"} onClose={() => setDialog(null)} />}
    </div>
  );
}

const EVENT: Record<string, string> = { CREATED: "ایجاد", READY: "آماده شد", STARTED: "شروع", PAUSED: "توقف موقت", RESUMED: "ادامه", COMPLETED: "پایان", BLOCKED: "مسدود", UNBLOCKED: "رفع انسداد", ISSUE: "گزارش مشکل", ASSIGNED: "تخصیص", REOPENED: "بازگشایی", SKIPPED: "رد شد", CANCELLED: "لغو", GATE_PASSED: "شرط برقرار شد", GATE_OVERRIDDEN: "عبور اجباری", QC_PASSED: "تأیید کیفیت", QC_FAILED: "رد کیفیت" };

function CompleteDialog({ d, open, onClose }: { d: StationDetail; open: boolean; onClose: () => void }) {
  const { run, pending } = useApiAction();
  const [qty, setQty] = useState(String(d.quantityPlanned));
  const [notes, setNotes] = useState("");
  const [use, setUse] = useState<Record<string, { consumed: string; wasted: string }>>(() =>
    Object.fromEntries(d.requirements.map((r) => { const left = Math.max(0, r.issued - r.consumed - r.wasted - r.returned); return [r.id, { consumed: String(left), wasted: "0" }]; })),
  );
  const invalid = useMemo(() => d.requirements.some((r) => {
    const left = r.issued - r.consumed - r.wasted - r.returned;
    const u = use[r.id];
    return u && Number(toEnDigits(u.consumed) || 0) + Number(toEnDigits(u.wasted) || 0) > left + 1e-6;
  }), [d.requirements, use]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`پایان «${d.name}»`}
        description="تعداد تولیدشده و مصرف مواد را ثبت کنید؛ ضایعات به همین مرحله و این ماده منتسب می‌شود."
        footer={<Button variant="accent" loading={pending} disabled={invalid} onClick={async () => {
          const consumption = d.requirements.map((r) => ({ requirementId: r.id, consumed: Number(toEnDigits(use[r.id]?.consumed ?? "0") || 0), wasted: Number(toEnDigits(use[r.id]?.wasted ?? "0") || 0) })).filter((c) => c.consumed + c.wasted > 0);
          if (await run(() => api(`production/tasks/${d.id}/complete`, { body: { quantityCompleted: Number(toEnDigits(qty) || 0), consumption, notes: notes || undefined } }), "مرحله ثبت شد و کار به مرحله بعد رفت.")) onClose();
        }}>ثبت پایان کار</Button>}
      >
        <div className="space-y-4">
          <Field label={`تعداد تولیدشده (${d.unit})`} hint={`برنامه: ${formatNumber(d.quantityPlanned)}`}><Input ltr inputMode="numeric" value={qty} onChange={(e) => setQty(toEnDigits(e.target.value).replace(/\D/g, ""))} className="h-12 text-[17px]" /></Field>
          {d.requirements.map((r) => {
            const left = r.issued - r.consumed - r.wasted - r.returned;
            return (
              <div key={r.id} className="rounded-xl border border-line p-3">
                <p className="text-[13px] font-bold">{r.name} <span className="font-medium text-muted">· {formatNumber(left)} {UNIT[r.unit]} در دست</span></p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label="مصرف"><Input ltr inputMode="decimal" value={use[r.id]?.consumed ?? ""} onChange={(e) => setUse({ ...use, [r.id]: { ...use[r.id]!, consumed: toEnDigits(e.target.value).replace(/[^\d.]/g, "") } })} /></Field>
                  <Field label="ضایعات"><Input ltr inputMode="decimal" value={use[r.id]?.wasted ?? ""} onChange={(e) => setUse({ ...use, [r.id]: { ...use[r.id]!, wasted: toEnDigits(e.target.value).replace(/[^\d.]/g, "") } })} /></Field>
                </div>
              </div>
            );
          })}
          {invalid && <p className="text-[12.5px] text-danger">مجموع مصرف و ضایعات از مقدار حواله‌شده بیشتر است؛ ابتدا حواله تکمیلی بگیرید.</p>}
          <Field label="یادداشت (اختیاری)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IssueDialog({ taskId, open, onClose }: { taskId: string; open: boolean; onClose: () => void }) {
  const { run, pending } = useApiAction();
  const [type, setType] = useState("MACHINE_BREAKDOWN");
  const [description, setDescription] = useState("");
  const [block, setBlock] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="گزارش مشکل" description="سرپرست و مدیر فوراً مطلع می‌شوند." footer={<Button variant="danger" loading={pending} disabled={description.trim().length < 3} onClick={async () => { if (await run(() => api(`production/tasks/${taskId}/issues`, { body: { type, description, block } }), "مشکل گزارش شد.")) { onClose(); setDescription(""); } }}>ثبت گزارش</Button>}>
        <div className="space-y-4">
          <Field label="نوع مشکل"><Select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(ISSUE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="شرح"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} autoFocus /></Field>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" className="size-4" checked={block} onChange={(e) => setBlock(e.target.checked)} /> کار تا رفع مشکل متوقف شود</label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InspectionDialog({ d, open, onClose }: { d: StationDetail; open: boolean; onClose: () => void }) {
  const { run, pending } = useApiAction();
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(d.checklist.map((c) => [c, true])));
  const [qtyChecked, setQtyChecked] = useState(String(Math.min(d.quantityPlanned, 100)));
  const [rejected, setRejected] = useState("0");
  const [target, setTarget] = useState(d.reworkTargets[0]?.key ?? "");
  const [reworkQty, setReworkQty] = useState("");
  const [defect, setDefect] = useState(d.defectTypes[0]?.code ?? "OTHER");
  const [severity, setSeverity] = useState("MAJOR");
  const [notes, setNotes] = useState("");
  const allPass = d.checklist.every((c) => checked[c]) && Number(rejected || 0) === 0;
  const submit = (result: "PASSED" | "FAILED") => run(() => api(`production/tasks/${d.id}/inspection`, {
    body: {
      result,
      quantityChecked: Number(toEnDigits(qtyChecked) || 0),
      quantityRejected: Number(toEnDigits(rejected) || 0),
      checklist: d.checklist.map((c) => ({ item: c, passed: !!checked[c] })),
      defects: result === "FAILED" || Number(rejected || 0) > 0 ? [{ defectCode: defect, severity, quantity: Number(toEnDigits(rejected) || 0) }] : [],
      reworkTargetStepKey: result === "FAILED" ? target : null,
      reworkQuantity: result === "FAILED" && reworkQty ? Number(toEnDigits(reworkQty)) : null,
      notes: notes || undefined,
    },
  }), result === "PASSED" ? "کیفیت تأیید شد." : "رد شد و کار به دوباره‌کاری رفت.").then((ok) => ok && onClose());
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={`بازرسی «${d.name}»`} description={`${d.itemTitle} · ${formatNumber(d.quantityPlanned)} ${d.unit}`} footer={
        <>
          <Button variant="danger" loading={pending} disabled={!target} onClick={() => submit("FAILED")}>رد و ارسال به دوباره‌کاری</Button>
          <Button variant="accent" loading={pending} onClick={() => submit("PASSED")}>{allPass ? "تأیید کیفیت" : "تأیید با وجود ایراد جزئی"}</Button>
        </>
      }>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[13px] font-bold text-ink-2">چک‌لیست</p>
            {d.checklist.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-[14px] hover:bg-surface-2">
                <input type="checkbox" className="size-5 accent-[var(--color-success)]" checked={!!checked[c]} onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })} />
                <span className={cn(!checked[c] && "text-danger")}>{c}</span>
              </label>
            ))}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="تعداد بازرسی‌شده"><Input ltr inputMode="numeric" value={qtyChecked} onChange={(e) => setQtyChecked(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
              <Field label="تعداد مردودی"><Input ltr inputMode="numeric" value={rejected} onChange={(e) => setRejected(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="نوع ایراد"><Select value={defect} onChange={(e) => setDefect(e.target.value)}>{d.defectTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select></Field>
              <Field label="شدت"><Select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="MINOR">جزئی</option><option value="MAJOR">عمده</option><option value="CRITICAL">بحرانی</option></Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="بازگشت به مرحله"><Select value={target} onChange={(e) => setTarget(e.target.value)}>{d.reworkTargets.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</Select></Field>
              <Field label="تعداد دوباره‌کاری" hint="خالی = تعداد مردودی"><Input ltr inputMode="numeric" value={reworkQty} onChange={(e) => setReworkQty(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
            </div>
            <Field label="یادداشت"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
