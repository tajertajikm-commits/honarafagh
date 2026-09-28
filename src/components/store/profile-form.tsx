"use client";

import { useRouter } from "next/navigation";
import { MapPin, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { formatPhone, toEnDigits } from "@/lib/persian";

interface Customer { id: string; fullName: string; phone: string; type: "INDIVIDUAL" | "COMPANY"; companyName: string | null; nationalId: string | null; economicCode: string | null; email: string | null }
interface Address { id: string; title: string; province: string; city: string; line: string; postalCode: string | null; recipientName: string; recipientPhone: string; isDefault: boolean }

export function ProfileForm({ customer, addresses }: { customer: Customer; addresses: Address[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [c, setC] = useState(customer);
  const emptyAddr = { title: "خانه", province: "تهران", city: "تهران", line: "", postalCode: "", recipientName: customer.fullName, recipientPhone: customer.phone, isDefault: addresses.length === 0 };
  const [a, setA] = useState(emptyAddr);
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); router.refresh(); } catch (e) { toast.error(e instanceof ApiError ? e.message : "خطا"); }
  });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="مشخصات" description={<>موبایل: <bdi dir="ltr" className="tabular">{formatPhone(customer.phone)}</bdi></>} />
        <CardBody className="space-y-4">
          <Field label="نام و نام خانوادگی"><Input value={c.fullName} onChange={(e) => setC({ ...c, fullName: e.target.value })} /></Field>
          <Field label="نوع مشتری">
            <Select value={c.type} onChange={(e) => setC({ ...c, type: e.target.value as Customer["type"] })}>
              <option value="INDIVIDUAL">حقیقی</option>
              <option value="COMPANY">حقوقی</option>
            </Select>
          </Field>
          {c.type === "COMPANY" && (
            <>
              <Field label="نام شرکت"><Input value={c.companyName ?? ""} onChange={(e) => setC({ ...c, companyName: e.target.value })} /></Field>
              <Field label="کد اقتصادی"><Input ltr value={c.economicCode ?? ""} onChange={(e) => setC({ ...c, economicCode: toEnDigits(e.target.value) })} /></Field>
            </>
          )}
          <Field label="کد ملی / شناسه ملی"><Input ltr inputMode="numeric" value={c.nationalId ?? ""} onChange={(e) => setC({ ...c, nationalId: toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 11) })} /></Field>
          <Field label="ایمیل (اختیاری)"><Input ltr type="email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
          <Button loading={pending} onClick={() => run(() => api(`customers/${c.id}`, { method: "PATCH", body: { fullName: c.fullName, type: c.type, companyName: c.companyName || null, nationalId: c.nationalId || null, economicCode: c.economicCode || null, email: c.email || null } }), "مشخصات ذخیره شد.")}>ذخیره</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="آدرس‌ها" icon={<MapPin />} />
        <CardBody className="space-y-3">
          {addresses.map((ad) => (
            <div key={ad.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[13.5px]">
              <div>
                <p className="font-bold">{ad.title} {ad.isDefault && <Badge tone="info" className="ms-1">پیش‌فرض</Badge>}</p>
                <p className="text-muted">{ad.province}، {ad.city}، {ad.line}</p>
                <p className="text-muted">{ad.recipientName} • <bdi dir="ltr">{formatPhone(ad.recipientPhone)}</bdi></p>
              </div>
              <Button variant="danger-ghost" size="icon-sm" aria-label="حذف آدرس" onClick={() => run(() => api(`account/addresses/${ad.id}`, { method: "DELETE" }), "آدرس حذف شد.")}><Trash2 /></Button>
            </div>
          ))}
          <div className="space-y-3 rounded-xl bg-surface-2/60 p-4">
            <p className="text-[13.5px] font-bold">افزودن آدرس</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="عنوان"><Input value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></Field>
              <Field label="استان"><Input value={a.province} onChange={(e) => setA({ ...a, province: e.target.value })} /></Field>
              <Field label="شهر"><Input value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} /></Field>
            </div>
            <Field label="نشانی"><Textarea value={a.line} onChange={(e) => setA({ ...a, line: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="تحویل‌گیرنده"><Input value={a.recipientName} onChange={(e) => setA({ ...a, recipientName: e.target.value })} /></Field>
              <Field label="موبایل"><Input ltr value={a.recipientPhone} onChange={(e) => setA({ ...a, recipientPhone: toEnDigits(e.target.value) })} /></Field>
              <Field label="کد پستی"><Input ltr value={a.postalCode} onChange={(e) => setA({ ...a, postalCode: toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 10) })} /></Field>
            </div>
            <Button variant="secondary" loading={pending} onClick={() => run(async () => { await api("account/addresses", { body: { ...a, postalCode: a.postalCode || null } }); setA(emptyAddr); }, "آدرس اضافه شد.")}>افزودن آدرس</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
