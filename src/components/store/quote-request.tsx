"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";

export function QuoteRequestForm({ loggedIn, products }: { loggedIn: boolean; products: { id: string; name: string }[] }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", description: "", quantity: "", productId: "" });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!loggedIn) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center shadow-soft">
        <p className="text-[14.5px]">برای ثبت استعلام و دریافت پیش‌فاکتور وارد حساب کاربری شوید.</p>
        <Button asChild className="mt-4"><Link href="/login?next=/quote">ورود با شماره موبایل</Link></Button>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-success/25 bg-success-soft p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <p className="mt-3 text-[17px] font-bold">استعلام شما ثبت شد</p>
        <p className="mt-1 text-[13.5px] text-ink-2">پیش‌فاکتور در بخش «پیش‌فاکتورها» حساب شما قرار می‌گیرد و پیامک اطلاع‌رسانی ارسال می‌شود.</p>
        <Button asChild variant="secondary" className="mt-5"><Link href="/account/quotes">پیش‌فاکتورهای من</Link></Button>
      </div>
    );
  }
  return (
    <form
      className="mt-8 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-soft"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await api("inquiries", { body: { title: f.title, description: f.description, quantity: f.quantity ? Number(f.quantity) : null, productId: f.productId || null, attachmentFileIds: files.map((x) => x.id) } });
          setDone(true);
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "خطا");
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="عنوان کار" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: جعبه بسته‌بندی محصول" required minLength={3} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="محصول مشابه (اختیاری)">
          <Select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
            <option value="">— انتخاب نشده —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="تیراژ تقریبی"><Input ltr inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: toEnDigits(e.target.value).replace(/\D/g, "") })} /></Field>
      </div>
      <Field label="مشخصات کامل" required hint="ابعاد، جنس و گرماژ کاغذ، تعداد رنگ، عملیات تکمیلی، زمان موردنیاز…"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[140px]" required minLength={10} /></Field>
      <Field label="فایل یا نمونه (اختیاری)"><FileDrop purpose="ATTACHMENT" files={files} onChange={setFiles} onError={toast.error} accept=".pdf,.jpg,.jpeg,.png,.webp,.zip" hint="PDF، تصویر یا ZIP" /></Field>
      <Button type="submit" size="lg" loading={loading} className="w-full">ثبت استعلام</Button>
    </form>
  );
}
