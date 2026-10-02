"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, Layers, Palette, Printer, Search, Upload, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, newIdempotencyKey } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { toEnDigits } from "@/lib/persian";

interface CustomerHit { id: string; code: number; fullName: string; companyName: string | null; phone: string }

/**
 * Custom printing request. The customer picks Digital or Offset (we explain
 * the difference in one line), describes the job, and either uploads a file
 * or asks the printing house to design it. Staff use the same form for phone
 * orders, choosing the customer first.
 */
export function CustomOrderForm({ mode }: { mode: "customer" | "staff" }) {
  const router = useRouter();
  const toast = useToast();
  const key = useRef(newIdempotencyKey());
  const [type, setType] = useState<"DIGITAL" | "OFFSET" | null>(null);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [material, setMaterial] = useState("");
  const [colors, setColors] = useState("");
  const [finishing, setFinishing] = useState("");
  const [description, setDescription] = useState("");
  const [needsDesign, setNeedsDesign] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [loading, setLoading] = useState(false);

  const qty = Number(toEnDigits(quantity).replace(/\D/g, "")) || 0;
  const ready = type && title.trim().length >= 3 && qty > 0 && (mode === "customer" || customer);

  async function submit() {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await api<{ id: string; code: string }>("orders/custom", {
        body: {
          customerId: mode === "staff" ? customer!.id : undefined,
          productionType: type,
          title: title.trim(),
          quantity: qty,
          dimensions: dimensions || null,
          material: material || null,
          colors: colors || null,
          finishing: finishing || null,
          description: description || null,
          needsDesign,
          artworkFileIds: needsDesign ? [] : files.map((f) => f.id),
          requestedDeadline: deadline || null,
          note: note || null,
          idempotencyKey: key.current,
        },
      });
      toast.success(`سفارش ${r.code} ثبت شد.`);
      router.push(mode === "customer" ? `/account/orders/${r.id}?placed=1` : `/panel/orders/${r.code}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "ثبت سفارش ممکن نشد.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {mode === "staff" && <CustomerPicker value={customer} onChange={setCustomer} />}

      <section>
        <h2 className="mb-3 text-[15px] font-bold">۱. نوع چاپ</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeCard active={type === "DIGITAL"} onClick={() => setType("DIGITAL")} icon={<Printer />} title="چاپ دیجیتال" text="تیراژ کم (معمولاً تا چند صد عدد)، تحویل سریع، بدون زینک." />
          <TypeCard active={type === "OFFSET"} onClick={() => setType("OFFSET")} icon={<Layers />} title="چاپ افست" text="تیراژ بالا (از حدود هزار عدد)، کیفیت یکدست و قیمت مناسب در حجم زیاد." />
        </div>
        <p className="mt-2 text-[12.5px] text-muted">مطمئن نیستید؟ نزدیک‌ترین گزینه را انتخاب کنید؛ کارشناس ما هنگام بررسی راهنمایی می‌کند.</p>
      </section>

      <section>
        <h2 className="mb-3 text-[15px] font-bold">۲. مشخصات کار</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان سفارش" required className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً بروشور معرفی محصولات" />
          </Field>
          <Field label="تیراژ (تعداد)" required>
            <Input inputMode="numeric" ltr value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1000" />
          </Field>
          <Field label="ابعاد">
            <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="مثلاً A4، ۹×۵ سانتی‌متر" />
          </Field>
          <Field label="جنس کاغذ / مقوا">
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="مثلاً گلاسه ۱۳۵ گرم" />
          </Field>
          <Field label="رنگ">
            <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="مثلاً چهاررنگ دو رو" />
          </Field>
          <Field label="عملیات تکمیلی" className="sm:col-span-2">
            <Input value={finishing} onChange={(e) => setFinishing(e.target.value)} placeholder="مثلاً سلفون مات، برش، صحافی منگنه" />
          </Field>
          <Field label="توضیحات" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="هر نکته‌ای که به فهم بهتر کار کمک می‌کند" />
          </Field>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[15px] font-bold">۳. فایل طرح</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <TypeCard active={!needsDesign} onClick={() => setNeedsDesign(false)} icon={<Upload />} title="فایل آماده دارم" text="فایل چاپی را بارگذاری کنید؛ پیش از چاپ بررسی می‌شود." />
          <TypeCard active={needsDesign} onClick={() => setNeedsDesign(true)} icon={<Palette />} title="طراحی توسط چاپخانه" text="پس از تأیید سفارش، طراح ما با شما هماهنگ می‌کند." />
        </div>
        {!needsDesign && <FileDrop purpose="ARTWORK" files={files} onChange={setFiles} onError={toast.error} />}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="تاریخ تحویل درخواستی" hint="اختیاری">
          <Input type="date" ltr value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Field label="یادداشت" hint="اختیاری">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button size="lg" loading={loading} disabled={!ready} onClick={submit}>
          ثبت سفارش
        </Button>
        <p className="text-[12.5px] text-muted">سفارش ابتدا بررسی و تأیید می‌شود؛ مبلغ پس از بررسی اعلام می‌شود.</p>
      </div>
    </div>
  );
}

function TypeCard({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-start gap-3 rounded-2xl border p-4 text-start transition-all", active ? "border-ink bg-surface shadow-card ring-1 ring-ink" : "border-line bg-surface hover:border-line-strong")}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", active ? "bg-ink text-surface" : "bg-surface-2 text-ink-2")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-bold">{title}{active && <Check className="size-4 text-success" />}</span>
        <span className="mt-0.5 block text-[12.5px] leading-6 text-muted">{text}</span>
      </span>
    </button>
  );
}

function CustomerPicker({ value, onChange }: { value: CustomerHit | null; onChange: (c: CustomerHit | null) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const search = async (v: string) => {
    setQ(v);
    if (v.trim().length < 2) return setHits([]);
    const r = await api<{ rows: CustomerHit[] }>(`customers?q=${encodeURIComponent(v)}`).catch(() => ({ rows: [] }));
    setHits(r.rows);
  };
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-ink bg-surface p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold">{value.companyName || value.fullName}</span>
          <span className="text-[12.5px] text-muted"><bdi dir="ltr">CUS-{value.code}</bdi> • <bdi dir="ltr">{value.phone}</bdi></span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => onChange(null)}>تغییر مشتری</Button>
      </div>
    );
  }
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-[15px] font-bold">مشتری</h2>
      {!creating ? (
        <>
          <label className="relative block">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => void search(e.target.value)} placeholder="نام، شرکت، موبایل یا CUS-1042" className="ps-9" />
          </label>
          <ul className="mt-2 space-y-1">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => onChange(h)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-surface-2">
                  <span className="flex-1 text-[13.5px] font-bold">{h.companyName || h.fullName}</span>
                  <bdi dir="ltr" className="text-[12px] text-muted">CUS-{h.code}</bdi>
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setCreating(true)}><UserPlus className="size-4" /> مشتری جدید</Button>
        </>
      ) : (
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="نام و نام خانوادگی"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="موبایل"><Input ltr inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912…" /></Field>
          <Button
            onClick={async () => {
              try {
                const c = await api<CustomerHit>("customers", { body: { fullName: name, phone } });
                onChange(c);
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "ثبت مشتری ممکن نشد.");
              }
            }}
            disabled={name.trim().length < 2 || phone.length < 10}
          >
            ثبت مشتری
          </Button>
        </div>
      )}
    </section>
  );
}
