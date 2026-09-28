"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { DateText } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { api } from "@/lib/api-client";
import { SHIPMENT_STATUS } from "@/lib/labels";
import { formatNumber, toEnDigits } from "@/lib/persian";
import { useApiAction } from "../actions";

export interface ShipmentView { id: string; number: number; status: string; methodName: string; methodKind: string; assigneeName: string | null; vehicleName: string | null; trackingCode: string | null; externalProvider: string | null; recipientName: string | null; deliveredAt: string | null; failureReason: string | null; proofFileId: string | null; lines: { title: string; quantity: number }[] }

export function DeliveryPanel({ orderId, shipments, shippable, methods, couriers, vehicles, perms, defaultMethodId }: {
  orderId: string;
  shipments: ShipmentView[];
  shippable: { itemId: string; title: string; remaining: number }[];
  methods: { id: string; name: string; kind: string }[];
  couriers: { id: string; name: string }[];
  vehicles: { id: string; name: string }[];
  perms: string[];
  defaultMethodId: string | null;
}) {
  const can = (p: string) => perms.includes(p);
  const { run, pending, toast } = useApiAction();
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ methodId: defaultMethodId ?? methods[0]?.id ?? "", assigneeId: "", vehicleId: "", trackingCode: "", notes: "" });
  const [qty, setQty] = useState<Record<string, string>>({});
  const [done, setDone] = useState<ShipmentView | null>(null);
  const [recipient, setRecipient] = useState("");
  const [proof, setProof] = useState<UploadedFile[]>([]);
  const [fail, setFail] = useState<ShipmentView | null>(null);
  const [reason, setReason] = useState("");
  const anyShippable = shippable.some((s) => s.remaining > 0);

  return (
    <div>
      {can("delivery.manage") && anyShippable && <Button size="sm" className="mb-3" onClick={() => { setQty(Object.fromEntries(shippable.map((s) => [s.itemId, String(s.remaining)]))); setCreate(true); }}>ایجاد مرسوله</Button>}
      {shipments.length === 0 ? <p className="text-[13px] text-muted">مرسوله‌ای ثبت نشده است.</p> : (
        <ul className="space-y-2">
          {shipments.map((s) => (
            <li key={s.id} className="rounded-xl border border-line px-3 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{s.methodName}</span>
                <span className="text-muted">{s.lines.map((l) => `${l.title} × ${formatNumber(l.quantity)}`).join("، ")}</span>
                <span className="ms-auto"><Status map={SHIPMENT_STATUS} value={s.status} /></span>
              </div>
              <p className="mt-1 text-muted">
                {[s.assigneeName, s.vehicleName, s.trackingCode && `رهگیری ${s.trackingCode}`, s.recipientName && s.status === "DELIVERED" && `تحویل به ${s.recipientName}`].filter(Boolean).join(" · ")}
                {s.deliveredAt && <> · <DateText value={s.deliveredAt} withTime /></>}
                {s.proofFileId && <> · <a className="font-bold text-accent-ink" target="_blank" rel="noreferrer" href={`/api/v1/files/${s.proofFileId}?inline=1`}>مدرک تحویل</a></>}
              </p>
              {s.failureReason && <p className="text-danger">{s.failureReason}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["PENDING", "ASSIGNED"].includes(s.status) && s.methodKind !== "PICKUP" && (can("delivery.execute") || can("delivery.manage")) && <Button size="xs" loading={pending} onClick={() => run(() => api(`shipments/${s.id}/dispatch`, { method: "POST" }), "مرسوله خارج شد.")}>خروج برای تحویل</Button>}
                {(s.status === "OUT_FOR_DELIVERY" || (s.methodKind === "PICKUP" && ["PENDING", "ASSIGNED"].includes(s.status))) && <Button size="xs" variant="accent" onClick={() => { setRecipient(s.recipientName ?? ""); setProof([]); setDone(s); }}>ثبت تحویل</Button>}
                {["ASSIGNED", "OUT_FOR_DELIVERY"].includes(s.status) && <Button size="xs" variant="ghost" onClick={() => { setReason(""); setFail(s); }}>تحویل ناموفق</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent title="ایجاد مرسوله" description="برای تحویل بخشی، تعداد هر قلم را کاهش دهید." footer={<Button loading={pending} onClick={async () => {
          const items = shippable.map((s) => ({ orderItemId: s.itemId, quantity: Number(toEnDigits(qty[s.itemId] ?? "0")) })).filter((i) => i.quantity > 0);
          if (await run(() => api(`orders/${orderId}/shipments`, { body: { methodId: form.methodId, items, assigneeId: form.assigneeId || null, vehicleId: form.vehicleId || null, trackingCode: form.trackingCode || null, notes: form.notes || null } }), "مرسوله ایجاد شد.")) setCreate(false);
        }}>ایجاد</Button>}>
          <div className="space-y-4">
            <Field label="روش ارسال"><Select value={form.methodId} onChange={(e) => setForm({ ...form, methodId: e.target.value })}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            {shippable.map((s) => (
              <Field key={s.itemId} label={`${s.title} (حداکثر ${formatNumber(s.remaining)})`}><Input ltr inputMode="numeric" value={qty[s.itemId] ?? ""} onChange={(e) => setQty({ ...qty, [s.itemId]: toEnDigits(e.target.value).replace(/\D/g, "") })} /></Field>
            ))}
            {methods.find((m) => m.id === form.methodId)?.kind === "INTERNAL" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="پیک"><Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}><option value="">— بعداً —</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="وسیله نقلیه"><Select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
              </div>
            )}
            {methods.find((m) => m.id === form.methodId)?.kind === "EXTERNAL" && <Field label="کد رهگیری شرکت حمل"><Input ltr value={form.trackingCode} onChange={(e) => setForm({ ...form, trackingCode: e.target.value })} /></Field>}
            <Field label="توضیحات"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!done} onOpenChange={(o) => !o && setDone(null)}>
        {done && (
          <DialogContent title="ثبت تحویل" footer={<Button loading={pending} disabled={recipient.trim().length < 2} onClick={async () => { if (await run(() => api(`shipments/${done.id}/complete`, { body: { recipientName: recipient, proofFileId: proof[0]?.id ?? null } }), "تحویل ثبت شد.")) setDone(null); }}>تأیید تحویل</Button>}>
            <div className="space-y-4">
              <Field label="نام تحویل‌گیرنده"><Input value={recipient} onChange={(e) => setRecipient(e.target.value)} /></Field>
              <Field label="مدرک تحویل (عکس/امضا، اختیاری)"><FileDrop purpose="DELIVERY_PROOF" files={proof} onChange={setProof} multiple={false} accept=".jpg,.jpeg,.png,.webp,.pdf" hint="عکس رسید یا امضا" onError={toast.error} /></Field>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!fail} onOpenChange={(o) => !o && setFail(null)}>
        {fail && (
          <DialogContent title="تحویل ناموفق" footer={<Button variant="danger" loading={pending} disabled={reason.trim().length < 2} onClick={async () => { if (await run(() => api(`shipments/${fail.id}/fail`, { body: { reason } }), "ثبت شد.")) setFail(null); }}>ثبت</Button>}>
            <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
