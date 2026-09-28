"use client";

import { DropdownMenu } from "radix-ui";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useApiAction } from "./actions";

export function MachineActions({ machine, maintenance }: { machine: { id: string; name: string; status: string }; maintenance: { id: string; title: string; status: string }[] }) {
  const { run, pending } = useApiAction();
  const [mode, setMode] = useState<null | "status" | "maint">(null);
  const [status, setStatus] = useState(machine.status);
  const [reason, setReason] = useState("");
  const [m, setM] = useState({ kind: "PREVENTIVE", title: "", start: "", hours: "4" });
  const item = "flex h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-2";
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="grid size-8 place-items-center rounded-md hover:bg-surface-2" aria-label="عملیات ماشین"><MoreHorizontal className="size-4" /></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="z-50 w-52 rounded-xl border border-line bg-surface p-1.5 shadow-float">
            <DropdownMenu.Item className={item} onSelect={() => setMode("status")}>تغییر وضعیت</DropdownMenu.Item>
            <DropdownMenu.Item className={item} onSelect={() => setMode("maint")}>برنامه تعمیرات</DropdownMenu.Item>
            {maintenance.map((x) => x.status === "SCHEDULED" ? (
              <DropdownMenu.Item key={x.id} className={item} onSelect={() => run(() => api(`maintenance/${x.id}/start`, { body: {} }), "تعمیرات آغاز شد.")}>شروع: {x.title}</DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item key={x.id} className={item} onSelect={() => run(() => api(`maintenance/${x.id}/complete`, { body: {} }), "تعمیرات پایان یافت.")}>پایان: {x.title}</DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        {mode === "status" && (
          <DialogContent title={`وضعیت ${machine.name}`} footer={<Button loading={pending} disabled={reason.trim().length < 2} onClick={async () => { if (await run(() => api(`machines/${machine.id}/status`, { body: { status, reason } }), "وضعیت ماشین تغییر کرد.")) setMode(null); }}>ذخیره</Button>}>
            <div className="space-y-4">
              <Field label="وضعیت"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">فعال</option><option value="MAINTENANCE">در تعمیر</option><option value="OUT_OF_SERVICE">خارج از سرویس</option></Select></Field>
              <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
          </DialogContent>
        )}
        {mode === "maint" && (
          <DialogContent title="برنامه تعمیرات" description="در بازه تعمیرات، کاری روی این ماشین برنامه‌ریزی نمی‌شود." footer={<Button loading={pending} disabled={!m.title || !m.start} onClick={async () => {
            const start = new Date(m.start);
            if (await run(() => api(`machines/${machine.id}/maintenance`, { body: { kind: m.kind, title: m.title, scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + Number(m.hours || 1) * 3600_000).toISOString() } }), "تعمیرات برنامه‌ریزی شد.")) setMode(null);
          }}>ثبت</Button>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نوع"><Select value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })}><option value="PREVENTIVE">پیشگیرانه</option><option value="REPAIR">تعمیر</option><option value="INSPECTION">بازرسی</option></Select></Field>
              <Field label="مدت (ساعت)"><Input ltr inputMode="numeric" value={m.hours} onChange={(e) => setM({ ...m, hours: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="عنوان" className="sm:col-span-2"><Input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} /></Field>
              <Field label="زمان شروع" className="sm:col-span-2"><Input ltr type="datetime-local" value={m.start} onChange={(e) => setM({ ...m, start: e.target.value })} /></Field>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
