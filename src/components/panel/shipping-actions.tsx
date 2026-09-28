"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatNumber, toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface Option { id: string; name: string }
export interface MethodOption extends Option { kind: string }
export interface ShippableLine { itemId: string; title: string; remaining: number }

/** Create a shipment for all or part of an order's remaining quantity. */
export function CreateShipmentButton({ orderId, shippable, methods, couriers, vehicles, defaultMethodId, size = "sm", label = "ایجاد مرسوله" }: {
  orderId: string;
  shippable: ShippableLine[];
  methods: MethodOption[];
  couriers: Option[];
  vehicles: Option[];
  defaultMethodId: string | null;
  size?: "xs" | "sm";
  label?: string;
}) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ methodId: "", assigneeId: "", vehicleId: "", trackingCode: "", notes: "" });
  const [qty, setQty] = useState<Record<string, string>>({});
  const method = methods.find((m) => m.id === form.methodId);
  const lines = shippable.filter((s) => s.remaining > 0);
  if (lines.length === 0) return null;
  return (
    <>
      <Button size={size} onClick={() => { setForm({ methodId: defaultMethodId ?? methods[0]?.id ?? "", assigneeId: "", vehicleId: "", trackingCode: "", notes: "" }); setQty(Object.fromEntries(lines.map((s) => [s.itemId, String(s.remaining)]))); setOpen(true); }}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="ایجاد مرسوله"
          description="برای تحویل بخشی از سفارش، تعداد هر قلم را کاهش دهید. سفارش با مانده پرداخت، بدون مجوز مدیر قابل ارسال نیست."
          footer={<Button loading={pending} onClick={async () => {
            const items = lines.map((s) => ({ orderItemId: s.itemId, quantity: Number(toEnDigits(qty[s.itemId] ?? "0")) })).filter((i) => i.quantity > 0);
            if (await run(() => api(`orders/${orderId}/shipments`, { body: { methodId: form.methodId, items, assigneeId: form.assigneeId || null, vehicleId: form.vehicleId || null, trackingCode: form.trackingCode || null, notes: form.notes || null } }), "مرسوله ایجاد شد.")) setOpen(false);
          }}>ایجاد</Button>}
        >
          <div className="space-y-4">
            <Field label="روش ارسال"><Select value={form.methodId} onChange={(e) => setForm({ ...form, methodId: e.target.value })}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            {lines.map((s) => (
              <Field key={s.itemId} label={`${s.title} (حداکثر ${formatNumber(s.remaining)})`}><Input ltr inputMode="numeric" value={qty[s.itemId] ?? ""} onChange={(e) => setQty({ ...qty, [s.itemId]: toEnDigits(e.target.value).replace(/\D/g, "") })} /></Field>
            ))}
            {method?.kind === "INTERNAL" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="پیک"><Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}><option value="">— بعداً —</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="وسیله نقلیه"><Select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
              </div>
            )}
            {method?.kind === "EXTERNAL" && <Field label="کد رهگیری شرکت حمل"><Input ltr value={form.trackingCode} onChange={(e) => setForm({ ...form, trackingCode: e.target.value })} /></Field>}
            <Field label="توضیحات"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface ShipmentActionView { id: string; status: string; methodKind: string; recipientName: string | null; assigneeId?: string | null }

/** Lifecycle actions on one shipment: assign, dispatch, deliver (with proof), fail, cancel. */
export function ShipmentActions({ s, perms, couriers }: { s: ShipmentActionView; perms: string[]; couriers?: Option[] }) {
  const can = (p: string) => perms.includes(p);
  const { run, pending, toast } = useApiAction();
  const [mode, setMode] = useState<null | "done" | "fail" | "cancel" | "assign">(null);
  const [recipient, setRecipient] = useState("");
  const [proof, setProof] = useState<UploadedFile[]>([]);
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const handle = can("delivery.execute") || can("delivery.manage");
  const open = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"].includes(s.status);
  if (!open) return null;
  const pickup = s.methodKind === "PICKUP";
  return (
    <div className="flex flex-wrap gap-1.5">
      {can("delivery.manage") && couriers && s.methodKind === "INTERNAL" && ["PENDING", "ASSIGNED"].includes(s.status) && <Button size="xs" variant="secondary" onClick={() => { setAssignee(s.assigneeId ?? ""); setMode("assign"); }}>{s.assigneeId ? "تغییر پیک" : "تعیین پیک"}</Button>}
      {handle && ["PENDING", "ASSIGNED"].includes(s.status) && !pickup && <Button size="xs" loading={pending} onClick={() => run(() => api(`shipments/${s.id}/dispatch`, { method: "POST" }), "مرسوله خارج شد.")}>خروج برای تحویل</Button>}
      {handle && (s.status === "OUT_FOR_DELIVERY" || pickup) && <Button size="xs" variant="accent" onClick={() => { setRecipient(s.recipientName ?? ""); setProof([]); setMode("done"); }}>ثبت تحویل</Button>}
      {handle && ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(s.status) && !pickup && <Button size="xs" variant="ghost" onClick={() => { setText(""); setMode("fail"); }}>تحویل ناموفق</Button>}
      {can("delivery.manage") && s.status !== "OUT_FOR_DELIVERY" && <Button size="xs" variant="danger-ghost" onClick={() => { setText(""); setMode("cancel"); }}>لغو</Button>}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        {mode === "done" && (
          <DialogContent title={pickup ? "تحویل حضوری" : "ثبت تحویل"} footer={<Button loading={pending} disabled={recipient.trim().length < 2} onClick={async () => { if (await run(() => api(`shipments/${s.id}/complete`, { body: { recipientName: recipient, proofFileId: proof[0]?.id ?? null } }), "تحویل ثبت شد.")) setMode(null); }}>تأیید تحویل</Button>}>
            <div className="space-y-4">
              <Field label="نام تحویل‌گیرنده"><Input value={recipient} onChange={(e) => setRecipient(e.target.value)} /></Field>
              <Field label="مدرک تحویل (عکس رسید یا امضا، اختیاری)"><FileDrop purpose="DELIVERY_PROOF" files={proof} onChange={setProof} multiple={false} accept=".jpg,.jpeg,.png,.webp,.pdf" hint="JPG، PNG یا PDF" onError={toast.error} /></Field>
            </div>
          </DialogContent>
        )}
        {(mode === "fail" || mode === "cancel") && (
          <DialogContent title={mode === "fail" ? "تحویل ناموفق" : "لغو مرسوله"} description={mode === "fail" ? "اقلام به صف ارسال برمی‌گردند تا دوباره ارسال شوند." : "اقلام مرسوله دوباره قابل ارسال می‌شوند."} footer={<Button variant="danger" loading={pending} disabled={text.trim().length < 2} onClick={async () => { if (await run(() => api(`shipments/${s.id}/${mode}`, { body: { reason: text } }), "ثبت شد.")) setMode(null); }}>ثبت</Button>}>
            <Field label="دلیل"><Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus /></Field>
          </DialogContent>
        )}
        {mode === "assign" && couriers && (
          <DialogContent title="تعیین پیک" footer={<Button loading={pending} disabled={!assignee} onClick={async () => { if (await run(() => api(`shipments/${s.id}/assign`, { body: { assigneeId: assignee } }), "پیک تعیین شد.")) setMode(null); }}>ذخیره</Button>}>
            <Field label="پیک"><Select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">انتخاب کنید</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
