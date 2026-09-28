"use client";

import { DropdownMenu } from "radix-ui";
import { Clock, MoreHorizontal, RotateCcw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Status } from "@/components/ui/status";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { METHOD, TASK_STATUS } from "@/lib/labels";
import { formatDuration, formatNumber, formatTime, toFaDigits } from "@/lib/persian";
import { useApiAction } from "../actions";

export interface TaskView {
  id: string;
  jobId: string;
  stepKey: string;
  name: string;
  attempt: number;
  status: string;
  isGate: boolean;
  gateKind: string | null;
  isQc: boolean;
  machineTypeCode: string | null;
  machineId: string | null;
  machineName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
  quantityPlanned: number;
  quantityCompleted: number;
  earliestStartAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  reworkReason: string | null;
  dependsOn: string[];
}
export interface JobView { id: string; number: number; method: string; itemTitle: string; priority: number; status: string; tasks: TaskView[] }

const GATE_HINT: Record<string, string> = { FILE_APPROVAL: "منتظر تأیید فایل", MATERIAL: "منتظر رزرو مواد", PAYMENT: "منتظر پیش‌پرداخت" };

export function ProductionPanel({ jobs, perms, employees, machines }: { jobs: JobView[]; perms: string[]; employees: { id: string; name: string }[]; machines: { id: string; name: string; typeCode: string }[] }) {
  const can = (p: string) => perms.includes(p);
  const { run, pending } = useApiAction();
  const [dialog, setDialog] = useState<null | { kind: "assign" | "skip" | "cancel" | "reopen" | "priority"; task?: TaskView; job?: JobView }>(null);
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const [machine, setMachine] = useState("");
  const [prio, setPrio] = useState("50");
  const close = () => { setDialog(null); setReason(""); };

  if (jobs.length === 0) return <p className="py-6 text-center text-[13px] text-muted">گردش‌کار تولید پس از تأیید سفارش ایجاد می‌شود.</p>;

  return (
    <div className="space-y-5">
      {jobs.map((job) => {
        const latest = new Map<string, TaskView>();
        for (const t of job.tasks) if (!latest.has(t.stepKey) || latest.get(t.stepKey)!.attempt < t.attempt) latest.set(t.stepKey, t);
        const current = [...latest.values()];
        const history = job.tasks.filter((t) => latest.get(t.stepKey)!.id !== t.id);
        const done = current.filter((t) => ["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status)).length;
        return (
          <div key={job.id}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13.5px] font-bold">{job.itemTitle} <span className="font-medium text-muted">• کار {toFaDigits(job.number)} • چاپ {METHOD[job.method] ?? job.method} • {formatNumber(done)} از {formatNumber(current.length)} مرحله</span></p>
              {can("production.assign") && <Button size="xs" variant="ghost" onClick={() => { setPrio(String(job.priority)); setDialog({ kind: "priority", job }); }}>اولویت {toFaDigits(job.priority)}</Button>}
            </div>
            <ol className="overflow-hidden rounded-xl border border-line">
              {current.map((t) => {
                const waitingLag = t.status === "READY" && t.earliestStartAt && new Date(t.earliestStartAt) > new Date();
                return (
                  <li key={t.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 last:border-0", t.status === "BLOCKED" && "bg-danger-soft/50", t.status === "IN_PROGRESS" && "bg-accent-soft/40")}>
                    <div className="flex min-w-[210px] flex-1 items-center gap-2">
                      <span className={cn("size-2 shrink-0 rounded-full", t.status === "COMPLETED" ? "bg-success" : t.status === "IN_PROGRESS" ? "bg-accent pulse-dot" : t.status === "BLOCKED" ? "bg-danger" : t.status === "READY" ? "bg-info" : "bg-line-strong")} />
                      <span className={cn("text-[13px] font-bold", t.isGate && "font-medium text-ink-2")}>{t.name}</span>
                      {t.attempt > 1 && <Badge tone="danger">تکرار {toFaDigits(t.attempt)}</Badge>}
                      {t.isGate && <Badge>خودکار</Badge>}
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-3 text-[12px] text-muted sm:w-auto">
                      {t.isGate && t.status !== "COMPLETED" && t.status !== "SKIPPED" && t.gateKind && <span className="text-warning">{GATE_HINT[t.gateKind]}</span>}
                      {waitingLag && <span className="flex items-center gap-1 text-warning"><Clock className="size-3.5" /> قابل شروع از {formatTime(t.earliestStartAt)}</span>}
                      {!t.isGate && <span>{t.assigneeName ?? "بدون مسئول"}{t.machineName ? ` • ${t.machineName}` : ""}</span>}
                      {!t.isGate && <span className="tabular">{t.actualMinutes ? `${formatDuration(t.actualMinutes)} / ` : ""}{formatDuration(t.estimatedMinutes)}</span>}
                      {t.quantityPlanned !== job.tasks[0]?.quantityPlanned && t.attempt > 1 && <span>تعداد: {formatNumber(t.quantityPlanned)}</span>}
                      <Status map={TASK_STATUS} value={t.status} />
                      {(can("production.assign") || can("production.override")) && !["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status) || (can("production.override") && ["COMPLETED", "SKIPPED"].includes(t.status)) ? (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger className="grid size-7 place-items-center rounded-md hover:bg-surface-2" aria-label="عملیات مرحله"><MoreHorizontal className="size-4" /></DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content align="end" className="z-50 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-float">
                              {!t.isGate && can("production.assign") && !["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status) && <MenuItem onSelect={() => { setAssignee(t.assigneeId ?? ""); setMachine(t.machineId ?? ""); setDialog({ kind: "assign", task: t }); }}>تخصیص کارمند / ماشین</MenuItem>}
                              {can("production.override") && ["PENDING", "READY", "BLOCKED"].includes(t.status) && <MenuItem onSelect={() => setDialog({ kind: "skip", task: t })}>{t.isGate ? "عبور اجباری از شرط" : "رد کردن مرحله"}</MenuItem>}
                              {can("production.override") && ["COMPLETED", "SKIPPED"].includes(t.status) && !t.isGate && <MenuItem onSelect={() => setDialog({ kind: "reopen", task: t })}>بازگشایی (دوباره‌کاری)</MenuItem>}
                              {can("production.override") && !["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status) && <MenuItem danger onSelect={() => setDialog({ kind: "cancel", task: t })}>لغو مرحله</MenuItem>}
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      ) : <span className="w-7" />}
                    </div>
                    {t.blockedReason && t.status === "BLOCKED" && <p className="w-full text-[12px] text-danger">مشکل: {t.blockedReason}</p>}
                    {t.reworkReason && t.attempt > 1 && <p className="w-full text-[12px] text-muted">علت تکرار: {t.reworkReason}</p>}
                  </li>
                );
              })}
            </ol>
            {history.length > 0 && (
              <details className="mt-2 text-[12px] text-muted">
                <summary className="cursor-pointer">{formatNumber(history.length)} اجرای قبلی (پیش از دوباره‌کاری)</summary>
                <ul className="mt-1.5 space-y-1 ps-4">
                  {history.map((h) => <li key={h.id}>{h.name} • اجرای {toFaDigits(h.attempt)} • {TASK_STATUS[h.status]?.[0]} {h.assigneeName ? `• ${h.assigneeName}` : ""}</li>)}
                </ul>
              </details>
            )}
          </div>
        );
      })}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && close()}>
        {dialog?.kind === "assign" && dialog.task && (
          <DialogContent title={`تخصیص «${dialog.task.name}»`} footer={<Button loading={pending} onClick={async () => { if (await run(() => api(`production/tasks/${dialog.task!.id}/assign`, { body: { assigneeId: assignee || null, ...(dialog.task!.machineTypeCode ? { machineId: machine || null } : {}) } }), "تخصیص ذخیره شد.")) close(); }}>ذخیره</Button>}>
            <div className="space-y-4">
              <Field label="مسئول"><Select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">— صف عمومی —</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
              {dialog.task.machineTypeCode && <Field label="ماشین"><Select value={machine} onChange={(e) => setMachine(e.target.value)}><option value="">— انتخاب هنگام شروع —</option>{machines.filter((m) => m.typeCode === dialog.task!.machineTypeCode).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>}
            </div>
          </DialogContent>
        )}
        {dialog?.kind === "priority" && dialog.job && (
          <DialogContent title="اولویت کار تولیدی" description="عدد کمتر = فوری‌تر (۱ تا ۹۹)." footer={<Button loading={pending} onClick={async () => { if (await run(() => api(`production/jobs/${dialog.job!.id}/priority`, { body: { priority: Number(prio) } }), "اولویت ذخیره شد.")) close(); }}>ذخیره</Button>}>
            <Field label="اولویت"><Select value={prio} onChange={(e) => setPrio(e.target.value)}>{[10, 20, 30, 40, 50, 60, 70, 80].map((p) => <option key={p} value={p}>{toFaDigits(p)}</option>)}</Select></Field>
          </DialogContent>
        )}
        {(dialog?.kind === "skip" || dialog?.kind === "cancel" || dialog?.kind === "reopen") && dialog.task && (
          <DialogContent
            title={dialog.kind === "skip" ? (dialog.task.isGate ? "عبور اجباری از شرط" : "رد کردن مرحله") : dialog.kind === "cancel" ? "لغو مرحله" : "بازگشایی مرحله"}
            description={dialog.kind === "reopen" ? "یک اجرای جدید از این مرحله ساخته می‌شود؛ مراحل بعدی تا تکمیل آن منتظر می‌مانند." : "این اقدام مدیریتی در گزارش ممیزی ثبت می‌شود."}
            footer={<Button variant={dialog.kind === "cancel" ? "danger" : "primary"} loading={pending} disabled={reason.trim().length < 2} onClick={async () => {
              const path = dialog.kind === "reopen" ? `production/jobs/${dialog.task!.jobId}/reopen` : `production/tasks/${dialog.task!.id}/${dialog.kind}`;
              const body = dialog.kind === "reopen" ? { stepKey: dialog.task!.stepKey, reason } : { reason };
              if (await run(() => api(path, { body }), "انجام شد.")) close();
            }}>{dialog.kind === "reopen" ? <><RotateCcw /> بازگشایی</> : <><ShieldAlert /> تأیید</>}</Button>}
          >
            <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function MenuItem({ children, onSelect, danger }: { children: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return <DropdownMenu.Item onSelect={onSelect} className={cn("flex h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-2", danger && "text-danger")}>{children}</DropdownMenu.Item>;
}
