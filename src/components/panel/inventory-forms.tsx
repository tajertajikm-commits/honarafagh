"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

const num = (v: string) => Number(toEnDigits(v).replace(/[^\d.-]/g, "") || "0");

export function StockDialog({ materialId, name, unit }: { materialId: string; name: string; unit: string }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"RECEIVE" | "ADJUST">("RECEIVE");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="secondary">ورود / اصلاح</Button>
      </DialogTrigger>
      <DialogContent
        title={name}
        description="دریافت از تأمین‌کننده یا اصلاح پس از شمارش."
        footer={<Button loading={pending} disabled={!delta || (reason === "ADJUST" && note.trim().length < 3)} onClick={async () => { if (await run(() => api(`materials/${materialId}/stock`, { body: { delta: num(delta), reason, note: note || null } }), "موجودی به‌روز شد.")) { setOpen(false); setDelta(""); setNote(""); } }}>ثبت</Button>}
      >
        <div className="space-y-4">
          <Field label="نوع">
            <Select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              <option value="RECEIVE">دریافت (افزایش)</option>
              <option value="ADJUST">اصلاح شمارش (مثبت یا منفی)</option>
            </Select>
          </Field>
          <Field label={`مقدار (${unit})`}><Input ltr value={delta} onChange={(e) => setDelta(e.target.value)} placeholder={reason === "ADJUST" ? "-20 یا 15" : "500"} /></Field>
          <Field label={reason === "ADJUST" ? "دلیل" : "توضیح (اختیاری)"}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CATS: [string, string][] = [["PAPER", "کاغذ"], ["CARDBOARD", "مقوا"], ["FILM", "فیلم سلفون"], ["UV", "UV و ورنی"], ["BINDING", "ملزومات صحافی"], ["PLATE", "زینک"], ["PACKAGING", "بسته‌بندی"], ["OTHER", "سایر"]];

export function MaterialDialog() {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ sku: "", name: "", category: "PAPER", unit: "SHEET", standardCost: "", minStock: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> ماده جدید</Button>
      </DialogTrigger>
      <DialogContent
        title="ماده جدید"
        footer={<Button loading={pending} disabled={f.sku.length < 2 || f.name.length < 2} onClick={async () => { if (await run(() => api("materials", { body: { sku: f.sku, name: f.name, category: f.category, unit: f.unit, standardCost: num(f.standardCost) * 10, minStock: num(f.minStock) } }), "ثبت شد.")) setOpen(false); }}>ثبت</Button>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="کد کالا"><Input ltr value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="P-GL170-70" /></Field>
          <Field label="نام"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="دسته"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="واحد"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="SHEET">برگ</option><option value="PIECE">عدد</option><option value="KG">کیلوگرم</option><option value="ROLL">رول</option><option value="SQM">مترمربع</option><option value="LITER">لیتر</option></Select></Field>
          <Field label="قیمت واحد (تومان)"><Input ltr value={f.standardCost} onChange={(e) => setF({ ...f, standardCost: e.target.value })} /></Field>
          <Field label="حداقل موجودی"><Input ltr value={f.minStock} onChange={(e) => setF({ ...f, minStock: e.target.value })} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierDialog({ supplier, kinds }: { supplier?: { id: string; name: string; kind: string; contactName: string | null; phone: string | null; notes: string | null }; kinds: [string, string][] }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: supplier?.name ?? "", kind: supplier?.kind ?? kinds[0]![0], contactName: supplier?.contactName ?? "", phone: supplier?.phone ?? "", notes: supplier?.notes ?? "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {supplier ? <Button size="xs" variant="ghost">ویرایش</Button> : <Button><Plus className="size-4" /> تأمین‌کننده جدید</Button>}
      </DialogTrigger>
      <DialogContent
        title={supplier ? "ویرایش تأمین‌کننده" : "تأمین‌کننده جدید"}
        footer={<Button loading={pending} disabled={f.name.trim().length < 2} onClick={async () => { if (await run(() => api("suppliers", { body: { id: supplier?.id, name: f.name, kind: f.kind, contactName: f.contactName || null, phone: f.phone || null, notes: f.notes || null } }), "ذخیره شد.")) setOpen(false); }}>ذخیره</Button>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="نوع"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="طرف تماس"><Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
          <Field label="تلفن"><Input ltr value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="توضیح" className="sm:col-span-2"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
