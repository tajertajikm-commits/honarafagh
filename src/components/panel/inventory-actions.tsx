"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { UNIT } from "@/lib/labels";
import { formatNumber, toEnDigits, toFaDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface MaterialOption { id: string; sku: string; name: string; unit: string; defaultLocationId?: string | null; standardCost?: number }
export interface LocationOption { id: string; code: string; name: string }

const num = (s: string) => Number(toEnDigits(s).replace(/[^\d.]/g, "") || 0);
const clean = (s: string) => toEnDigits(s).replace(/[^\d.]/g, "");
const unitOf = (u: string) => UNIT[u] ?? u;

function useDialog() {
  const [open, setOpen] = useState(false);
  const key = useRef(newIdempotencyKey());
  return { open, setOpen: (o: boolean) => { if (o) key.current = newIdempotencyKey(); setOpen(o); }, key };
}

/** Manual goods receipt (without a purchase order: returns from customers, found stock, samples …). */
export function ReceiveStockButton({ materials, locations, preset, children = "دریافت کالا", ...btn }: { materials: MaterialOption[]; locations: LocationOption[]; preset?: string; children?: ReactNode } & Pick<ButtonProps, "variant" | "size">) {
  const d = useDialog();
  const { run, pending } = useApiAction();
  const [f, setF] = useState({ materialId: preset ?? "", locationId: "", quantity: "", unitCost: "", reason: "" });
  const m = materials.find((x) => x.id === f.materialId);
  const openIt = () => { setF({ materialId: preset ?? "", locationId: materials.find((x) => x.id === preset)?.defaultLocationId ?? locations[0]?.id ?? "", quantity: "", unitCost: "", reason: "" }); d.setOpen(true); };
  return (
    <>
      <Button size={btn.size ?? "sm"} variant={btn.variant} onClick={openIt}>{children}</Button>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent
          title="دریافت کالا به انبار"
          description="برای خرید از تأمین‌کننده، دریافت را از روی سفارش خرید ثبت کنید تا بدهی و تحویل سفارش خرید هم به‌روز شود. کالای رسیده ابتدا به کمبودهای سفارش‌های باز تخصیص داده می‌شود."
          footer={<Button loading={pending} disabled={!f.materialId || !f.locationId || num(f.quantity) <= 0 || f.reason.trim().length < 2} onClick={async () => {
            const ok = await run(() => api("inventory/receive", { body: { materialId: f.materialId, locationId: f.locationId, quantity: num(f.quantity), unitCost: f.unitCost ? num(f.unitCost) * 10 : null, reason: f.reason, idempotencyKey: d.key.current } }), "دریافت ثبت شد.");
            if (ok) d.setOpen(false);
          }}>ثبت دریافت</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ماده" className="sm:col-span-2">
              <Select value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value, locationId: materials.find((x) => x.id === e.target.value)?.defaultLocationId ?? f.locationId })}>
                <option value="">انتخاب کنید</option>
                {materials.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.sku}</option>)}
              </Select>
            </Field>
            <Field label="محل انبار">
              <Select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
            <Field label={`مقدار${m ? ` (${unitOf(m.unit)})` : ""}`}><Input ltr inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: clean(e.target.value) })} /></Field>
            <Field label="بهای واحد (تومان)" hint="اختیاری؛ برای محاسبه بهای موجودی"><Input ltr inputMode="numeric" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: clean(e.target.value) })} /></Field>
            <Field label="شرح" className="sm:col-span-2"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="مثلاً: برگشت از مشتری، موجودی یافت‌شده در انبارگردانی" /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReserveButton({ requirementId }: { requirementId: string }) {
  const { run, pending } = useApiAction();
  return <Button size="xs" variant="secondary" loading={pending} onClick={() => run(() => api(`inventory/requirements/${requirementId}/reserve`, { body: {} }), "رزرو انجام شد.")}>رزرو</Button>;
}

/** Issue material to the production floor against an order requirement. */
export function IssueButton({ req }: { req: { id: string; materialName: string; unit: string; reserved: number; remaining: number; available?: number } }) {
  const d = useDialog();
  const { run, pending } = useApiAction();
  const [qty, setQty] = useState("");
  return (
    <>
      <Button size="xs" onClick={() => { setQty(String(req.reserved > 0 ? Math.min(req.reserved, req.remaining) : req.remaining)); d.setOpen(true); }}>حواله</Button>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent
          title={`حواله ${req.materialName}`}
          description={`رزروشده برای این سفارش: ${formatNumber(req.reserved, { decimals: true })} · باقی‌مانده نیاز: ${formatNumber(req.remaining, { decimals: true })} ${unitOf(req.unit)}. مقدار بیش از رزرو از موجودی آزاد کسر می‌شود.`}
          footer={<Button loading={pending} disabled={num(qty) <= 0} onClick={async () => { if (await run(() => api(`inventory/requirements/${req.id}/issue`, { body: { quantity: num(qty), idempotencyKey: d.key.current } }), "حواله ثبت شد و از موجودی کسر شد.")) d.setOpen(false); }}>ثبت حواله</Button>}
        >
          <Field label={`مقدار (${unitOf(req.unit)})`}><Input ltr inputMode="decimal" value={qty} onChange={(e) => setQty(clean(e.target.value))} autoFocus /></Field>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Return unused, issued material back to stock. */
export function ReturnButton({ req }: { req: { id: string; materialName: string; unit: string; outstanding: number } }) {
  const d = useDialog();
  const { run, pending } = useApiAction();
  const [qty, setQty] = useState("");
  return (
    <>
      <Button size="xs" variant="secondary" onClick={() => { setQty(String(req.outstanding)); d.setOpen(true); }}>برگشت به انبار</Button>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent
          title={`برگشت ${req.materialName}`}
          description={`حواله‌شده و مصرف‌نشده: ${formatNumber(req.outstanding, { decimals: true })} ${unitOf(req.unit)}`}
          footer={<Button loading={pending} disabled={num(qty) <= 0 || num(qty) > req.outstanding + 1e-6} onClick={async () => { if (await run(() => api(`inventory/requirements/${req.id}/return`, { body: { quantity: num(qty) } }), "برگشت به انبار ثبت شد.")) d.setOpen(false); }}>ثبت برگشت</Button>}
        >
          <Field label={`مقدار (${unitOf(req.unit)})`}><Input ltr inputMode="decimal" value={qty} onChange={(e) => setQty(clean(e.target.value))} autoFocus /></Field>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Stock correction (count difference) or write-off (damaged, expired). Both require a reason and are audited. */
export function StockCorrection({ material, locations, mode }: { material: MaterialOption; locations: (LocationOption & { onHand: number; available: number })[]; mode: "adjust" | "waste" }) {
  const d = useDialog();
  const { run, pending } = useApiAction();
  const [f, setF] = useState({ locationId: locations[0]?.id ?? "", sign: "+", quantity: "", reason: "" });
  const loc = locations.find((l) => l.id === f.locationId);
  const q = num(f.quantity);
  const tooMuch = mode === "waste" ? !!loc && q > loc.available : f.sign === "-" && !!loc && q > loc.available;
  return (
    <>
      <Button size="sm" variant={mode === "waste" ? "danger-ghost" : "secondary"} onClick={() => { setF({ locationId: locations[0]?.id ?? "", sign: "+", quantity: "", reason: "" }); d.setOpen(true); }}>{mode === "adjust" ? "اصلاح موجودی" : "ثبت ضایعات انبار"}</Button>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent
          title={mode === "adjust" ? `اصلاح موجودی ${material.name}` : `ضایعات ${material.name}`}
          description={mode === "adjust" ? "برای ثبت اختلاف انبارگردانی. فقط از موجودی آزاد (رزرونشده) می‌توان کسر کرد." : "برای کالای آسیب‌دیده، رطوبت‌زده یا تاریخ‌گذشته. از موجودی آزاد کسر می‌شود."}
          footer={<Button variant={mode === "waste" ? "danger" : "primary"} loading={pending} disabled={!f.locationId || q <= 0 || tooMuch || f.reason.trim().length < 2} onClick={async () => {
            const ok = mode === "adjust"
              ? await run(() => api("inventory/adjust", { body: { materialId: material.id, locationId: f.locationId, delta: f.sign === "-" ? -q : q, reason: f.reason } }), "اصلاح موجودی ثبت شد.")
              : await run(() => api("inventory/write-off", { body: { materialId: material.id, locationId: f.locationId, quantity: q, reason: f.reason } }), "ضایعات ثبت شد.");
            if (ok) d.setOpen(false);
          }}>ثبت</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="محل انبار" className="sm:col-span-2">
              <Select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} — موجود {formatNumber(l.onHand, { decimals: true })}، آزاد {formatNumber(l.available, { decimals: true })}</option>)}
              </Select>
            </Field>
            {mode === "adjust" && (
              <Field label="نوع اصلاح">
                <Select value={f.sign} onChange={(e) => setF({ ...f, sign: e.target.value })}>
                  <option value="+">افزایش موجودی</option>
                  <option value="-">کاهش موجودی</option>
                </Select>
              </Field>
            )}
            <Field label={`مقدار (${unitOf(material.unit)})`} error={tooMuch ? "بیشتر از موجودی آزاد است." : null}><Input ltr inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: clean(e.target.value) })} /></Field>
            <Field label="دلیل" className="sm:col-span-2"><Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Ask procurement for material (manual request; shortages create requests automatically). */
export function MaterialRequestButton({ materials, preset, size = "sm", variant = "secondary" }: { materials: MaterialOption[]; preset?: { materialId: string; quantity?: number } } & Pick<ButtonProps, "size" | "variant">) {
  const d = useDialog();
  const { run, pending } = useApiAction();
  const [f, setF] = useState({ materialId: "", quantity: "", neededBy: "", note: "" });
  const m = materials.find((x) => x.id === f.materialId);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => { setF({ materialId: preset?.materialId ?? "", quantity: preset?.quantity ? String(preset.quantity) : "", neededBy: "", note: "" }); d.setOpen(true); }}>درخواست خرید</Button>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent
          title="درخواست خرید مواد"
          description="درخواست برای واحد تأمین فرستاده می‌شود تا در سفارش خرید قرار گیرد."
          footer={<Button loading={pending} disabled={!f.materialId || num(f.quantity) <= 0} onClick={async () => { if (await run(() => api("procurement/requests", { body: { materialId: f.materialId, quantity: num(f.quantity), neededBy: f.neededBy || null, note: f.note || undefined } }), "درخواست خرید ثبت شد.")) d.setOpen(false); }}>ثبت درخواست</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ماده" className="sm:col-span-2">
              <Select value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
                <option value="">انتخاب کنید</option>
                {materials.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.sku}</option>)}
              </Select>
            </Field>
            <Field label={`مقدار${m ? ` (${unitOf(m.unit)})` : ""}`}><Input ltr inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: clean(e.target.value) })} /></Field>
            <Field label="نیاز تا تاریخ"><Input ltr type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} /></Field>
            <Field label="توضیح" className="sm:col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface PoLineView { id: string; materialName: string; unit: string; quantity: number; received: number }

/** Receive goods against a purchase order (full or partial per line). */
export function ReceivePoButton({ po }: { po: { id: string; number: number; supplierName: string; lines: PoLineView[] } }) {
  const d = useDialog();
  const { run, pending } = useApiAction();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const lines = po.lines.map((l) => ({ lineId: l.id, quantity: num(qty[l.id] ?? "") })).filter((l) => l.quantity > 0);
  return (
    <>
      <Button size="xs" onClick={() => { setQty(Object.fromEntries(po.lines.map((l) => [l.id, String(Math.max(0, l.quantity - l.received))]))); setNote(""); d.setOpen(true); }}>ثبت رسید</Button>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent
          wide
          title={`رسید کالا — سفارش خرید ${toFaDigits(po.number)}`}
          description={`${po.supplierName} · مقدار رسیده هر ردیف را وارد کنید؛ دریافت ناقص مجاز است.`}
          footer={<Button loading={pending} disabled={lines.length === 0} onClick={async () => { if (await run(() => api(`procurement/purchase-orders/${po.id}/receive`, { body: { lines, note: note || undefined, idempotencyKey: d.key.current } }), "رسید کالا ثبت شد.")) d.setOpen(false); }}>ثبت رسید</Button>}
        >
          <div className="space-y-3">
            {po.lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_140px] items-center gap-3">
                <div>
                  <p className="text-[13.5px] font-bold">{l.materialName}</p>
                  <p className="text-[12px] text-muted">سفارش {formatNumber(l.quantity, { decimals: true })} · رسیده {formatNumber(l.received, { decimals: true })} {unitOf(l.unit)}</p>
                </div>
                <Input ltr inputMode="decimal" aria-label={`مقدار رسیده ${l.materialName}`} value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: clean(e.target.value) })} />
              </div>
            ))}
            <Field label="توضیح"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="شماره بارنامه، وضعیت بسته‌بندی …" /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
