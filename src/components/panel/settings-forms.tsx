"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface BusinessSettings { name: string; legalName: string; phone: string; address: string; postalCode: string; economicCode: string; nationalId: string; registrationNo: string }
export interface InvoiceSettings { vatPct: number; paymentTerms: string; officialNote: string }

/** Seller details printed on invoices. Every legal/tax field is editable here, none is hard-coded. */
export function BusinessSettingsForm({ value }: { value: BusinessSettings }) {
  const { run, pending } = useApiAction();
  const [f, setF] = useState(value);
  const set = (k: keyof BusinessSettings, digits = false) => (e: { target: { value: string } }) => setF({ ...f, [k]: digits ? toEnDigits(e.target.value) : e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="نام تجاری"><Input value={f.name} onChange={set("name")} /></Field>
      <Field label="نام حقوقی (روی فاکتور رسمی)"><Input value={f.legalName} onChange={set("legalName")} /></Field>
      <Field label="شناسه ملی"><Input ltr value={f.nationalId} onChange={set("nationalId", true)} /></Field>
      <Field label="کد اقتصادی"><Input ltr value={f.economicCode} onChange={set("economicCode", true)} /></Field>
      <Field label="شماره ثبت"><Input ltr value={f.registrationNo} onChange={set("registrationNo", true)} /></Field>
      <Field label="تلفن"><Input ltr value={f.phone} onChange={set("phone", true)} /></Field>
      <Field label="کد پستی"><Input ltr value={f.postalCode} onChange={set("postalCode", true)} /></Field>
      <Field label="نشانی" className="sm:col-span-2"><Textarea className="min-h-[60px]" value={f.address} onChange={set("address")} /></Field>
      <div><Button loading={pending} disabled={f.name.trim().length < 1} onClick={() => run(() => api("settings/business", { method: "PUT", body: f }), "ذخیره شد. فاکتورهای جدید با این اطلاعات صادر می‌شوند.")}>ذخیره</Button></div>
    </div>
  );
}

export function InvoiceSettingsForm({ value }: { value: InvoiceSettings }) {
  const { run, pending } = useApiAction();
  const [f, setF] = useState(value);
  return (
    <div className="grid gap-4">
      <Field label="مالیات بر ارزش افزوده (٪)" hint="برای سفارش‌های جدید"><Input ltr inputMode="numeric" value={String(f.vatPct)} onChange={(e) => setF({ ...f, vatPct: Math.min(30, Number(toEnDigits(e.target.value).replace(/\D/g, "") || 0)) })} /></Field>
      <Field label="شرایط پرداخت (روی فاکتور)"><Input value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} /></Field>
      <Field label="یادداشت فاکتور رسمی"><Textarea className="min-h-[60px]" value={f.officialNote} onChange={(e) => setF({ ...f, officialNote: e.target.value })} /></Field>
      <div><Button loading={pending} onClick={() => run(() => api("settings/invoice", { method: "PUT", body: f }), "ذخیره شد.")}>ذخیره</Button></div>
    </div>
  );
}
