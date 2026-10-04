"use client";

import { useState } from "react";
import { GitBranchPlus, RotateCcw, Undo2, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useApiAction } from "./actions";
import { MoneyInput, tomanToRial } from "./order-forms";

export interface Person { id: string; name: string }
export interface ReturnTarget { key: string; label: string; hint?: string }

/** Manager: hand a step to a specific person (or free it again). */
export function StepAssign({ stepId, assigneeId, assignedByManager, people }: { stepId: string; assigneeId: string | null; assignedByManager: boolean; people: Person[] }) {
  const { run, pending } = useApiAction();
  const value = assignedByManager && assigneeId ? assigneeId : "";
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-muted">
      <UserRoundCog className="size-3.5" />
      <Select
        aria-label="ارجاع به"
        className="h-8 w-auto min-w-36 text-[12.5px]"
        disabled={pending}
        value={value}
        onChange={(e) => void run(() => api(`steps/${stepId}/assign`, { body: { employeeId: e.target.value || null } }), e.target.value ? "کار ارجاع شد." : "ارجاع برداشته شد.")}
      >
        <option value="">ارجاع به… (هر کس آزاد است)</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
    </label>
  );
}

/** Manager: give the design to another designer. */
export function DesignerAssign({ orderId, designerId, designers }: { orderId: string; designerId: string | null; designers: Person[] }) {
  const { run, pending } = useApiAction();
  return (
    <Field label="ارجاع طراحی به">
      <Select value={designerId ?? ""} disabled={pending} onChange={(e) => e.target.value && void run(() => api(`orders/${orderId}/designer`, { body: { employeeId: e.target.value } }), "طراحی ارجاع شد.")}>
        <option value="" disabled>انتخاب طراح…</option>
        {designers.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Sends the order back to a chosen point. `undo` = the person who recorded a
 * step cancels their own mistake (single fixed target).
 */
export function ReturnOrder({ orderId, targets, undo, compact }: { orderId: string; targets: ReturnTarget[]; undo?: boolean; compact?: boolean }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(targets[0]?.key ?? "");
  const [reason, setReason] = useState("");
  if (targets.length === 0) return null;
  const chosen = targets.find((t) => t.key === target);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {undo ? (
          <Button size="sm" variant="ghost"><Undo2 className="size-3.5" /> لغو (اشتباه)</Button>
        ) : (
          <Button size={compact ? "sm" : "md"} variant="secondary"><RotateCcw className="size-4" /> {compact ? "برگرداندن" : "برگرداندن سفارش به مرحله قبل"}</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={undo ? `لغو «${targets[0]!.label}»` : "برگرداندن سفارش"}
        description="مرحله انتخاب‌شده دوباره باز می‌شود و همه مراحل بعد از آن باید دوباره انجام شوند. با نام شما و دلیل در تاریخچه ثبت می‌شود."
        footer={
          <Button variant="danger" loading={pending} disabled={!target || reason.trim().length < 3} onClick={async () => { if (await run(() => api(`orders/${orderId}/return`, { body: { target, reason } }), "سفارش برگردانده شد.")) { setOpen(false); setReason(""); } }}>
            {undo ? "لغو و بازگشت" : "برگرداندن"}
          </Button>
        }
      >
        <div className="space-y-4">
          {!undo && (
            <Field label="بازگشت به">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </Select>
            </Field>
          )}
          {chosen?.hint && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{chosen.hint}</p>}
          <Field label="دلیل" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder={undo ? "مثلاً اشتباهی ثبت شد" : "مثلاً مشتری تماس گرفت و تغییر طرح خواست"} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface PlanStation { key: string; name: string; phase: number; required: boolean; inPlan: boolean; status: string | null }

/** Add stations mid-job (e.g. lamination after printing) or drop unfinished optional ones. */
export function PlanEditor({ orderId, stations }: { orderId: string; stations: PlanStation[] }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [charge, setCharge] = useState("");
  const toggle = (set: Set<string>, fn: (s: Set<string>) => void, k: string) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    fn(n);
  };
  const changed = add.size + remove.size > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary"><GitBranchPlus className="size-4" /> تغییر ایستگاه‌ها</Button>
      </DialogTrigger>
      <DialogContent
        title="تغییر مسیر تولید"
        description="مثلاً مشتری بعد از چاپ سلفون خواست: «سلفون» را اضافه کنید. مراحل بعد از ایستگاه اضافه‌شده (کیفیت، بسته‌بندی…) دوباره انجام می‌شوند."
        footer={
          <Button
            loading={pending}
            disabled={!changed || reason.trim().length < 3}
            onClick={async () => {
              if (await run(() => api(`orders/${orderId}/plan`, { body: { add: [...add], remove: [...remove], reason, charge: charge ? tomanToRial(charge) : null } }), "مسیر تولید به‌روز شد.")) {
                setOpen(false);
                setAdd(new Set());
                setRemove(new Set());
                setReason("");
                setCharge("");
              }
            }}
          >
            ثبت تغییر
          </Button>
        }
      >
        <div className="space-y-4">
          <ul className="grid gap-1.5">
            {stations.map((s) => {
              const locked = s.required || (s.inPlan && (s.status === "DONE" || s.status === "IN_PROGRESS"));
              const on = s.inPlan ? !remove.has(s.key) : add.has(s.key);
              return (
                <li key={s.key}>
                  <label className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 text-[13.5px]", on ? "border-ink" : "border-line text-muted", locked ? "opacity-70" : "cursor-pointer")}>
                    <input type="checkbox" checked={on} disabled={locked} onChange={() => (s.inPlan ? toggle(remove, setRemove, s.key) : toggle(add, setAdd, s.key))} />
                    <span className="flex-1 font-bold text-ink">{s.name}</span>
                    {s.required && <span className="text-[11.5px]">الزامی</span>}
                    {!s.required && s.inPlan && (s.status === "DONE" || s.status === "IN_PROGRESS") && <span className="text-[11.5px]">{s.status === "DONE" ? "انجام شده" : "در حال انجام"}</span>}
                    {!s.inPlan && add.has(s.key) && <span className="text-[11.5px] text-success">اضافه می‌شود</span>}
                    {s.inPlan && remove.has(s.key) && <span className="text-[11.5px] text-danger">حذف می‌شود</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <Field label="دلیل" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="مثلاً مشتری تماس گرفت و سلفون مات خواست" />
          </Field>
          <Field label="هزینه اضافه (اختیاری)" hint="به مبلغ سفارش اضافه می‌شود.">
            <MoneyInput value={charge} onChange={setCharge} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Courier delivery confirmed: who delivered it and to whom. */
export function DeliveredForm({ orderId, people, defaultId }: { orderId: string; people: Person[]; defaultId: string | null }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [deliveredById, setDeliveredById] = useState(defaultId ?? "");
  const [recipientName, setRecipientName] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">تحویل شد</Button>
      </DialogTrigger>
      <DialogContent
        title="ثبت تحویل به مشتری"
        footer={
          <Button loading={pending} onClick={async () => { if (await run(() => api(`orders/${orderId}/delivered`, { body: { deliveredById: deliveredById || null, recipientName: recipientName || null } }), "تحویل ثبت شد.")) setOpen(false); }}>
            ثبت تحویل
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="تحویل‌دهنده">
            <Select value={deliveredById} onChange={(e) => setDeliveredById(e.target.value)}>
              <option value="">خودم</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="تحویل‌گیرنده" hint="اختیاری">
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
