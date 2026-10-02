"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useApiAction } from "./actions";

export interface CustomerEditable {
  id: string;
  fullName: string;
  type: "INDIVIDUAL" | "COMPANY";
  companyName: string | null;
  nationalId: string | null;
  economicCode: string | null;
  registrationNo: string | null;
  email: string | null;
  billingAddress: string | null;
  postalCode: string | null;
  notes: string | null;
}

/** Profile and the legal fields official invoices need. */
export function CustomerEdit({ customer }: { customer: CustomerEditable }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(customer);
  const set = (k: keyof CustomerEditable) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const company = f.type === "COMPANY";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary"><Pencil className="size-4" /> ویرایش</Button>
      </DialogTrigger>
      <DialogContent
        wide
        title="ویرایش مشتری"
        description="برای فاکتور رسمی، نام شرکت و شناسه ملی یا کد اقتصادی لازم است."
        footer={
          <Button
            loading={pending}
            onClick={async () => {
              const body = { fullName: f.fullName, type: f.type, companyName: f.companyName || null, nationalId: f.nationalId || null, economicCode: f.economicCode || null, registrationNo: f.registrationNo || null, email: f.email || null, billingAddress: f.billingAddress || null, postalCode: f.postalCode || null, notes: f.notes || null };
              if (await run(() => api(`customers/${customer.id}`, { method: "PATCH", body }), "اطلاعات مشتری ذخیره شد.")) setOpen(false);
            }}
          >
            ذخیره
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نوع مشتری">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CustomerEditable["type"] })}>
              <option value="INDIVIDUAL">حقیقی</option>
              <option value="COMPANY">حقوقی (شرکت)</option>
            </Select>
          </Field>
          <Field label={company ? "نام نماینده" : "نام و نام خانوادگی"}><Input value={f.fullName} onChange={set("fullName")} /></Field>
          {company && <Field label="نام شرکت"><Input value={f.companyName ?? ""} onChange={set("companyName")} /></Field>}
          <Field label={company ? "شناسه ملی شرکت" : "کد ملی"}><Input ltr value={f.nationalId ?? ""} onChange={set("nationalId")} /></Field>
          {company && <Field label="کد اقتصادی"><Input ltr value={f.economicCode ?? ""} onChange={set("economicCode")} /></Field>}
          {company && <Field label="شماره ثبت"><Input ltr value={f.registrationNo ?? ""} onChange={set("registrationNo")} /></Field>}
          <Field label="ایمیل"><Input ltr value={f.email ?? ""} onChange={set("email")} /></Field>
          <Field label="کد پستی"><Input ltr value={f.postalCode ?? ""} onChange={set("postalCode")} /></Field>
          <Field label="نشانی (برای فاکتور)" className="sm:col-span-2"><Input value={f.billingAddress ?? ""} onChange={set("billingAddress")} /></Field>
          <Field label="یادداشت داخلی" className="sm:col-span-2"><Textarea value={f.notes ?? ""} onChange={set("notes")} rows={2} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
