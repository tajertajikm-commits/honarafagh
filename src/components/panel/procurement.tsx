"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Code, DateText, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { MATERIAL_REQUEST_STATUS, UNIT } from "@/lib/labels";
import { formatNumber, formatToman, toEnDigits } from "@/lib/persian";
import { ReasonAction, useApiAction } from "./actions";

export interface SupplierOption { id: string; name: string; leadTimeDays: number }
export interface MaterialPick { id: string; sku: string; name: string; unit: string; standardCost: number; defaultSupplierId: string | null; defaultLocationId: string | null }
export interface RequestRow {
  id: string;
  number: number;
  status: string;
  reason: string;
  quantity: number;
  neededBy: string | null;
  orderNumber: number | null;
  note: string | null;
  requestedBy: string | null;
  material: MaterialPick;
}

const REASON: Record<string, string> = { SHORTAGE: "کمبود سفارش", REORDER: "نقطه سفارش", MANUAL: "دستی" };
const clean = (s: string) => toEnDigits(s).replace(/[^\d.]/g, "");
const num = (s: string) => Number(clean(s) || 0);

interface Line { materialId: string; quantity: string; unitCost: string; requestIds: string[] }

/** Open requests with multi-select → one purchase order per supplier. */
export function RequestsTable({ requests, suppliers, materials, canManage }: { requests: RequestRow[]; suppliers: SupplierOption[]; materials: MaterialPick[]; canManage: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<{ supplierId: string; lines: Line[] }>({ supplierId: "", lines: [] });
  const openRows = requests.filter((r) => r.status === "OPEN");
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const startPo = (ids: string[]) => {
    const rows = requests.filter((r) => ids.includes(r.id));
    // Merge requests for the same material into one line.
    const byMat = new Map<string, Line>();
    for (const r of rows) {
      const l = byMat.get(r.material.id) ?? { materialId: r.material.id, quantity: "0", unitCost: String(Math.round(r.material.standardCost / 10)), requestIds: [] };
      l.quantity = String(num(l.quantity) + r.quantity);
      l.requestIds.push(r.id);
      byMat.set(r.material.id, l);
    }
    setSeed({ supplierId: rows[0]?.material.defaultSupplierId ?? suppliers[0]?.id ?? "", lines: [...byMat.values()] });
    setOpen(true);
  };

  return (
    <>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <Button size="sm" disabled={sel.size === 0} onClick={() => startPo([...sel])}>ایجاد سفارش خرید از {formatNumber(sel.size)} درخواست</Button>
          <Button size="sm" variant="secondary" onClick={() => { setSeed({ supplierId: suppliers[0]?.id ?? "", lines: [{ materialId: "", quantity: "", unitCost: "", requestIds: [] }] }); setOpen(true); }}><Plus /> سفارش خرید بدون درخواست</Button>
        </div>
      )}
      {requests.length === 0 ? <p className="px-5 py-10 text-center text-[13px] text-muted">درخواست بازی وجود ندارد.</p> : (
        <Table>
          <THead>
            <tr>
              {canManage && <TH className="w-10"><input type="checkbox" aria-label="انتخاب همه" checked={openRows.length > 0 && openRows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(openRows.map((r) => r.id)) : new Set())} className="size-4 accent-[var(--color-ink)]" /></TH>}
              <TH>شماره</TH><TH>کالا</TH><TH className="text-end">مقدار</TH><TH>علت</TH><TH>سفارش</TH><TH>نیاز تا</TH><TH>وضعیت</TH><TH />
            </tr>
          </THead>
          <TBody>
            {requests.map((r) => (
              <TR key={r.id}>
                {canManage && <TD>{r.status === "OPEN" && <input type="checkbox" aria-label={`انتخاب درخواست ${r.number}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--color-ink)]" />}</TD>}
                <TD className="tabular text-muted">{formatNumber(r.number).replace(/٬/g, "")}</TD>
                <TD><span className="whitespace-nowrap font-bold">{r.material.name}</span><span className="block text-[11.5px] text-muted"><Code>{r.material.sku}</Code></span></TD>
                <TD className="text-end tabular">{formatNumber(r.quantity, { decimals: true })} <span className="text-[11px] text-muted">{UNIT[r.material.unit]}</span></TD>
                <TD className="text-muted">{REASON[r.reason]}{r.note && <span className="block max-w-[200px] truncate text-[11.5px]" title={r.note}>{r.note}</span>}</TD>
                <TD>{r.orderNumber ? <OrderNo n={r.orderNumber} /> : "—"}</TD>
                <TD className="text-muted"><DateText value={r.neededBy} /></TD>
                <TD><Status map={MATERIAL_REQUEST_STATUS} value={r.status} /></TD>
                <TD className="text-end">
                  {canManage && r.status === "OPEN" && (
                    <div className="flex justify-end gap-1">
                      <Button size="xs" variant="secondary" onClick={() => startPo([r.id])}>سفارش خرید</Button>
                      <ReasonAction size="xs" variant="ghost" path={`procurement/requests/${r.id}/cancel`} title="لغو درخواست خرید" success="درخواست لغو شد." danger>لغو</ReasonAction>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <PurchaseOrderDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()); }} seed={seed} suppliers={suppliers} materials={materials} />
    </>
  );
}

function PurchaseOrderDialog({ open, onOpenChange, seed, suppliers, materials }: { open: boolean; onOpenChange: (o: boolean) => void; seed: { supplierId: string; lines: Line[] }; suppliers: SupplierOption[]; materials: MaterialPick[] }) {
  const { run, pending } = useApiAction();
  const [supplierId, setSupplierId] = useState(seed.supplierId);
  const [lines, setLines] = useState<Line[]>(seed.lines);
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [lastSeed, setLastSeed] = useState(seed);
  if (seed !== lastSeed) {
    // Reset the form whenever a new selection opens the dialog.
    setLastSeed(seed);
    setSupplierId(seed.supplierId);
    setLines(seed.lines);
    const lead = suppliers.find((s) => s.id === seed.supplierId)?.leadTimeDays ?? 3;
    setExpectedAt(new Date(Date.now() + lead * 86_400_000).toISOString().slice(0, 10));
    setNote("");
  }
  const total = lines.reduce((s, l) => s + num(l.quantity) * num(l.unitCost), 0);
  const valid = supplierId && lines.length > 0 && lines.every((l) => l.materialId && num(l.quantity) > 0);
  const save = (submit: boolean) =>
    run(
      () => api("procurement/purchase-orders", {
        body: {
          supplierId,
          expectedAt: expectedAt || null,
          note: note || undefined,
          submit,
          lines: lines.map((l) => ({ materialId: l.materialId, quantity: num(l.quantity), unitCost: num(l.unitCost) * 10, locationId: materials.find((m) => m.id === l.materialId)?.defaultLocationId ?? null, materialRequestIds: l.requestIds })),
        },
      }),
      submit ? "سفارش خرید ثبت و برای تأمین‌کننده ارسال شد." : "پیش‌نویس سفارش خرید ذخیره شد.",
    ).then((ok) => ok && onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title="سفارش خرید"
        description="با ثبت سفارش، تاریخ رسیدن در برنامه‌ریزی تولید لحاظ می‌شود تا موعد سفارش‌های منتظر این کالا واقع‌بینانه محاسبه شود."
        footer={
          <>
            <span className="me-auto text-[13px] text-muted">جمع: <b className="tabular text-ink">{formatToman(total * 10)}</b></span>
            <Button variant="secondary" loading={pending} disabled={!valid} onClick={() => save(false)}>ذخیره پیش‌نویس</Button>
            <Button loading={pending} disabled={!valid} onClick={() => save(true)}>ثبت و ارسال</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="تأمین‌کننده">
            <Select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); const lead = suppliers.find((s) => s.id === e.target.value)?.leadTimeDays ?? 3; setExpectedAt(new Date(Date.now() + lead * 86_400_000).toISOString().slice(0, 10)); }}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="تاریخ رسیدن"><Input ltr type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></Field>
          <Field label="توضیح"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="mt-5 space-y-2">
          <div className="grid grid-cols-[1fr_110px_130px_32px] gap-2 text-[12px] font-bold text-muted"><span>کالا</span><span>مقدار</span><span>بهای واحد (تومان)</span><span /></div>
          {lines.map((l, i) => {
            const m = materials.find((x) => x.id === l.materialId);
            const set = (patch: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="grid grid-cols-[1fr_110px_130px_32px] items-center gap-2">
                {l.requestIds.length ? (
                  <div className="text-[13px]"><b>{m?.name}</b><span className="block text-[11.5px] text-muted">از {formatNumber(l.requestIds.length)} درخواست</span></div>
                ) : (
                  <Select aria-label="کالا" value={l.materialId} onChange={(e) => { const mm = materials.find((x) => x.id === e.target.value); set({ materialId: e.target.value, unitCost: mm ? String(Math.round(mm.standardCost / 10)) : "" }); }}>
                    <option value="">انتخاب کالا</option>
                    {materials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                )}
                <Input ltr inputMode="decimal" aria-label="مقدار" value={l.quantity} onChange={(e) => set({ quantity: clean(e.target.value) })} />
                <Input ltr inputMode="numeric" aria-label="بهای واحد" value={l.unitCost} onChange={(e) => set({ unitCost: clean(e.target.value) })} />
                <Button size="icon-sm" variant="ghost" aria-label="حذف ردیف" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            );
          })}
          <Button size="xs" variant="ghost" onClick={() => setLines([...lines, { materialId: "", quantity: "", unitCost: "", requestIds: [] }])}><Plus /> افزودن ردیف</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface SupplierFull { id?: string; name: string; contactName: string | null; phone: string | null; email: string | null; address: string | null; leadTimeDays: number; notes: string | null; isActive: boolean }

export function SupplierDialog({ supplier, trigger }: { supplier?: SupplierFull; trigger: "new" | "edit" }) {
  const { run, pending } = useApiAction();
  const blank: SupplierFull = { name: "", contactName: "", phone: "", email: "", address: "", leadTimeDays: 3, notes: "", isActive: true };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<SupplierFull>(supplier ?? blank);
  return (
    <>
      <Button size={trigger === "new" ? "sm" : "xs"} variant={trigger === "new" ? "primary" : "ghost"} onClick={() => { setF(supplier ?? blank); setOpen(true); }}>{trigger === "new" ? <><Plus /> تأمین‌کننده جدید</> : "ویرایش"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={supplier ? `ویرایش ${supplier.name}` : "تأمین‌کننده جدید"}
          footer={<Button loading={pending} disabled={f.name.trim().length < 2} onClick={async () => {
            const body = { ...f, id: supplier?.id, email: f.email || null, phone: f.phone ? toEnDigits(f.phone) : null, contactName: f.contactName || null, address: f.address || null, notes: f.notes || null };
            if (await run(() => api("procurement/suppliers", { body }), "تأمین‌کننده ذخیره شد.")) setOpen(false);
          }}>ذخیره</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نام" className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="نام رابط"><Input value={f.contactName ?? ""} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
            <Field label="تلفن"><Input ltr value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="ایمیل"><Input ltr type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="زمان تأمین (روز)"><Input ltr inputMode="numeric" value={String(f.leadTimeDays)} onChange={(e) => setF({ ...f, leadTimeDays: num(e.target.value) })} /></Field>
            <Field label="نشانی" className="sm:col-span-2"><Input value={f.address ?? ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="یادداشت" className="sm:col-span-2"><Textarea value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            {supplier && (
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                <input type="checkbox" className="size-4 accent-[var(--color-ink)]" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> فعال
              </label>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

