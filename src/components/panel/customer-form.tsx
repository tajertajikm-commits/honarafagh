"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface CustomerFormValue { id?: string; phone: string; fullName: string; type: "INDIVIDUAL" | "COMPANY"; companyName: string | null; nationalId: string | null; economicCode: string | null; email: string | null; notes: string | null; discountPct?: number; creditLimit?: number }

/** Create a customer, or edit one (commercial terms only for roles with price override). */
export function CustomerFormButton({ customer, canEditTerms }: { customer?: CustomerFormValue; canEditTerms?: boolean }) {
  const router = useRouter();
  const { run, pending } = useApiAction();
  const blank: CustomerFormValue = { phone: "", fullName: "", type: "INDIVIDUAL", companyName: "", nationalId: "", economicCode: "", email: "", notes: "", discountPct: 0, creditLimit: 0 };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<CustomerFormValue>(customer ?? blank);
  const [credit, setCredit] = useState(String(Math.round((customer?.creditLimit ?? 0) / 10)));
  const opt = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const save = () => {
    const common = { fullName: f.fullName, type: f.type, companyName: opt(f.companyName), nationalId: opt(f.nationalId), economicCode: opt(f.economicCode), email: opt(f.email), notes: opt(f.notes) };
    return customer
      ? run(() => api(`customers/${customer.id}`, { method: "PATCH", body: { ...common, ...(canEditTerms ? { discountPct: Number(f.discountPct ?? 0), creditLimit: Number(toEnDigits(credit) || 0) * 10 } : {}) } }), "اطلاعات مشتری ذخیره شد.").then((ok) => ok && setOpen(false))
      : run(() => api<{ id: string }>("customers", { body: { ...common, phone: f.phone } }), "مشتری ثبت شد.", (r) => router.push(`/panel/customers/${(r as { id: string }).id}`)).then((ok) => ok && setOpen(false));
  };
  return (
    <>
      <Button size="sm" variant={customer ? "secondary" : "primary"} onClick={() => { setF(customer ?? blank); setOpen(true); }}>{customer ? "ویرایش" : <><Plus /> مشتری جدید</>}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={customer ? "ویرایش مشتری" : "مشتری جدید"} footer={<Button loading={pending} disabled={f.fullName.trim().length < 2 || (!customer && toEnDigits(f.phone).replace(/\D/g, "").length < 10)} onClick={save}>ذخیره</Button>}>
          <div className="grid gap-4 sm:grid-cols-2">
            {!customer && <Field label="موبایل" hint="شناسه ورود مشتری به فروشگاه"><Input ltr inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>}
            <Field label="نام و نام خانوادگی"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
            <Field label="نوع"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CustomerFormValue["type"] })}><option value="INDIVIDUAL">حقیقی</option><option value="COMPANY">حقوقی</option></Select></Field>
            <Field label="نام شرکت"><Input value={f.companyName ?? ""} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></Field>
            <Field label="کد / شناسه ملی"><Input ltr value={f.nationalId ?? ""} onChange={(e) => setF({ ...f, nationalId: toEnDigits(e.target.value) })} /></Field>
            <Field label="کد اقتصادی"><Input ltr value={f.economicCode ?? ""} onChange={(e) => setF({ ...f, economicCode: toEnDigits(e.target.value) })} /></Field>
            <Field label="ایمیل"><Input ltr type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            {customer && canEditTerms && (
              <>
                <Field label="تخفیف ثابت (٪)" hint="در موتور قیمت‌گذاری اعمال می‌شود."><Input ltr inputMode="decimal" value={String(f.discountPct ?? 0)} onChange={(e) => setF({ ...f, discountPct: Number(toEnDigits(e.target.value).replace(/[^\d.]/g, "") || 0) })} /></Field>
                <Field label="سقف اعتبار (تومان)" hint="تحویل با مانده تا این سقف مجاز است."><Input ltr inputMode="numeric" value={credit} onChange={(e) => setCredit(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
              </>
            )}
            <Field label="یادداشت داخلی" className="sm:col-span-2"><Textarea value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
