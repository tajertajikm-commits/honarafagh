"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronLeft, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { MACHINE_CATEGORY } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface StepView {
  id: string;
  key: string;
  name: string;
  kind: "WORK" | "PAPER_SELECT" | "LITHO" | "PAPER_PROCURE" | "PRINT" | "QUALITY" | "SHIPPING";
  status: "WAITING" | "READY" | "IN_PROGRESS" | "DONE";
  machineId: string | null;
  blocked: string | null;
  orderCode: string;
}
export interface MaterialOption { id: string; name: string; unit: string; stock: number; category: string }
export interface MachineOption { id: string; name: string; category: string }
export interface ReturnOption { key: string; name: string }

/**
 * The one control an operator needs for a step: start / finish, pick paper,
 * approve quality, assign a press. Special stations (lithography, paper
 * procurement, shipping) open their section of the order.
 */
export function StepActions({
  step,
  canPerform,
  canAssignPress,
  materials = [],
  machines = [],
  returnOptions,
}: {
  step: StepView;
  canPerform: boolean;
  canAssignPress?: boolean;
  materials?: MaterialOption[];
  machines?: MachineOption[];
  returnOptions?: ReturnOption[];
}) {
  const { run, pending } = useApiAction();
  if (step.status === "DONE" || step.status === "WAITING") return null;
  const href = `/panel/orders/${step.orderCode}`;

  if (step.kind === "LITHO" || step.kind === "PAPER_PROCURE") {
    return canPerform ? <OpenLink href={`${href}?tab=procurement`} label={step.kind === "LITHO" ? "ثبت وضعیت لیتوگرافی" : "قیمت‌ها و دریافت کاغذ"} /> : null;
  }
  if (step.kind === "SHIPPING") {
    return canPerform ? <OpenLink href={`${href}?tab=shipping`} label={step.status === "IN_PROGRESS" ? "ثبت تحویل" : "ثبت ارسال"} /> : null;
  }
  if (step.kind === "QUALITY") return canPerform ? <QualityButtons step={step} returnOptions={returnOptions} /> : null;

  const needsPress = step.kind === "PRINT" && !step.machineId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {needsPress && canAssignPress && <PressSelect stepId={step.id} machines={machines} />}
      {canPerform && !step.blocked && (
        <>
          {step.status === "READY" && step.kind !== "PAPER_SELECT" && (
            <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => api(`steps/${step.id}/start`, { body: {} }), "کار شروع شد.")}>
              <Play className="size-3.5" /> شروع
            </Button>
          )}
          {step.kind === "PAPER_SELECT" ? (
            <PaperDialog stepId={step.id} materials={materials} />
          ) : (
            <Button size="sm" loading={pending} onClick={() => run(() => api(`steps/${step.id}/complete`, { body: {} }), `${step.name} انجام شد.`)}>
              <Check className="size-3.5" /> انجام شد
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild size="sm" variant="secondary">
      <Link href={href}>
        {label} <ChevronLeft className="size-3.5" />
      </Link>
    </Button>
  );
}

function PressSelect({ stepId, machines }: { stepId: string; machines: MachineOption[] }) {
  const { run, pending } = useApiAction();
  const presses = machines.filter((m) => m.category !== "DIGITAL");
  return (
    <Select
      aria-label="تعیین ماشین چاپ"
      className="h-8 w-auto min-w-44 text-[13px]"
      disabled={pending}
      defaultValue=""
      onChange={(e) => e.target.value && void run(() => api(`steps/${stepId}/machine`, { body: { machineId: e.target.value } }), "ماشین چاپ تعیین شد.")}
    >
      <option value="" disabled>
        تعیین ماشین چاپ…
      </option>
      {presses.map((m) => (
        <option key={m.id} value={m.id}>
          {MACHINE_CATEGORY[m.category]} — {m.name}
        </option>
      ))}
    </Select>
  );
}

function PaperDialog({ stepId, materials }: { stepId: string; materials: MaterialOption[] }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [paperNote, setPaperNote] = useState("");
  const selected = materials.find((m) => m.id === materialId);
  const ok = materialId || paperNote.trim().length > 1;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Check className="size-3.5" /> انتخاب کاغذ
        </Button>
      </DialogTrigger>
      <DialogContent
        title="کاغذ / مقوای این سفارش"
        description="از انبار برداشت می‌شود و موجودی به‌روز می‌شود."
        footer={
          <Button
            loading={pending}
            disabled={!ok}
            onClick={async () => {
              if (await run(() => api(`steps/${stepId}/complete`, { body: { materialId: materialId || null, quantity: quantity ? Number(quantity) : null, paperNote: paperNote || null } }), "کاغذ ثبت شد.")) setOpen(false);
            }}
          >
            ثبت و ادامه
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="کاغذ یا مقوا">
            <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
              <option value="">انتخاب از انبار…</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — موجودی {formatNumber(m.stock)}
                </option>
              ))}
            </Select>
          </Field>
          {selected && (
            <Field label={`تعداد مصرف (${selected.unit === "SHEET" ? "برگ" : selected.unit})`} hint="اختیاری؛ از موجودی کم می‌شود.">
              <Input inputMode="numeric" ltr value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          )}
          {!materialId && (
            <Field label="یا توضیح کاغذ (اگر در انبار ثبت نشده)">
              <Input value={paperNote} onChange={(e) => setPaperNote(e.target.value)} placeholder="مثلاً کاغذ اهدایی مشتری" />
            </Field>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QualityButtons({ step, returnOptions }: { step: StepView; returnOptions?: ReturnOption[] }) {
  const { run, pending } = useApiAction();
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [returnTo, setReturnTo] = useState(returnOptions?.at(-1)?.key ?? "");
  const submit = async (approve: boolean) => {
    const ok = await run(
      () => api(`steps/${step.id}/quality`, { body: { approve, notes: notes || null, reason: approve ? null : reason, returnTo: approve ? null : returnTo || null } }),
      approve ? "کیفیت تأیید شد." : "رد شد و کار به مرحله قبل برگشت.",
    );
    if (ok) {
      setMode(null);
      setNotes("");
      setReason("");
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => setMode("reject")}>
        <X className="size-3.5" /> رد
      </Button>
      <Button size="sm" onClick={() => setMode("approve")}>
        <Check className="size-3.5" /> تأیید کیفیت
      </Button>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent
          title={mode === "approve" ? `تأیید — ${step.name}` : `رد — ${step.name}`}
          description={mode === "approve" ? "پس از تأیید، سفارش به مرحله بعد می‌رود." : "کار به مرحله انتخاب‌شده برمی‌گردد و دوباره انجام می‌شود."}
          footer={
            <Button variant={mode === "approve" ? "primary" : "danger"} loading={pending} disabled={mode === "reject" && reason.trim().length < 3} onClick={() => submit(mode === "approve")}>
              {mode === "approve" ? "تأیید کیفیت" : "رد و بازگشت"}
            </Button>
          }
        >
          <div className="space-y-4">
            {mode === "reject" && (
              <>
                <Field label="دلیل رد" required>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="مثلاً اختلاف رنگ با نمونه" />
                </Field>
                {returnOptions && returnOptions.length > 0 ? (
                  <Field label="بازگشت به مرحله">
                    <Select value={returnTo} onChange={(e) => setReturnTo(e.target.value)}>
                      {returnOptions.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <p className="text-[12.5px] text-muted">کار به نزدیک‌ترین مرحله تولید قبلی برمی‌گردد.</p>
                )}
              </>
            )}
            <Field label="یادداشت (اختیاری)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
