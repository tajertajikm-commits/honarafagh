"use client";

import { useState } from "react";
import { Check, Flame, Lock, MessageCircleQuestion, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FileDrop, type UploadedFile } from "@/components/ui/file-drop";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatToman, toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

const tomanToRial = (v: string) => Math.round(Number(toEnDigits(v).replace(/[^\d.]/g, "") || "0") * 10);
const rialToToman = (rial: number | null | undefined) => (rial ? String(Math.round(rial / 10)) : "");

function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Input inputMode="numeric" ltr value={value} onChange={(e) => onChange(toEnDigits(e.target.value).replace(/[^\d]/g, ""))} placeholder={placeholder} className="pe-14" />
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[12px] text-muted">تومان</span>
    </div>
  );
}

// ── Approval ────────────────────────────────────────────────────────────────

export interface StationOption {
  key: string;
  name: string;
  hint: string;
  phase: number;
  required: boolean;
  kind: string;
}

/**
 * The first gate: is it clear, feasible, and is the file usable? The approver
 * ticks the stations this order really needs; that becomes its production plan.
 */
export function ApprovalPanel({
  orderId,
  typeLabel,
  stations,
  suggested,
  canPrice,
  needsDesign,
  designers,
  priced,
}: {
  orderId: string;
  typeLabel: string;
  stations: StationOption[];
  suggested: string[];
  canPrice: boolean;
  needsDesign: boolean;
  designers: { id: string; name: string }[];
  priced: boolean;
}) {
  const { run, pending } = useApiAction();
  const [selected, setSelected] = useState<Set<string>>(new Set([...suggested, ...stations.filter((s) => s.required).map((s) => s.key)]));
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [designerId, setDesignerId] = useState(designers[0]?.id ?? "");
  const [mode, setMode] = useState<"reject" | "info" | null>(null);
  const [text, setText] = useState("");
  const toggle = (k: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });
  const phases = [...new Set(stations.map((s) => s.phase))];
  const realWork = stations.some((s) => selected.has(s.key) && s.kind !== "SHIPPING" && s.kind !== "QUALITY");

  return (
    <section id="approval" className="overflow-hidden rounded-2xl border border-warning/30 bg-surface shadow-card">
      <header className="border-b border-line bg-warning-soft/50 px-5 py-4">
        <h2 className="text-[16px] font-bold">تأیید سفارش {typeLabel}</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">مشخصات قابل فهم است؟ کار شدنی است؟ فایل قابل استفاده است؟ سپس ایستگاه‌هایی را که این سفارش واقعاً لازم دارد انتخاب کنید.</p>
      </header>
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="mb-2 text-[13px] font-bold">مسیر تولید این سفارش</p>
          <ol className="space-y-1.5">
            {phases.map((p) => {
              const group = stations.filter((s) => s.phase === p);
              return (
                <li key={p} className={cn("grid gap-1.5", group.length > 1 && "grid-cols-2")}>
                  {group.map((s) => {
                    const on = selected.has(s.key);
                    return (
                      <label
                        key={s.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                          on ? "border-ink bg-surface" : "border-line bg-surface-2/40 text-muted hover:border-line-strong",
                          s.required && "cursor-default",
                        )}
                      >
                        <input type="checkbox" className="sr-only" checked={on} disabled={s.required} onChange={() => toggle(s.key)} />
                        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface")}>
                          {s.required ? <Lock className="size-3" /> : on ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-bold text-ink">{s.name}{s.required && <span className="ms-1.5 text-[11px] font-medium text-muted">الزامی</span>}</span>
                          <span className="block text-[12px] text-muted">{s.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                  {group.length > 1 && <span className="col-span-2 -mt-0.5 text-[11.5px] text-muted">این دو مرحله هم‌زمان انجام می‌شوند.</span>}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="space-y-4">
          <Field label="یادداشت تأیید (اختیاری)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="نکته‌ای برای تولید یا ثبت در سابقه" />
          </Field>
          {canPrice && !priced && (
            <Field label="مبلغ سفارش (بدون مالیات)" hint="اختیاری؛ حسابداری هم می‌تواند بعداً تعیین کند.">
              <MoneyInput value={price} onChange={setPrice} />
            </Field>
          )}
          {needsDesign && designers.length > 0 && (
            <Field label="طراح">
              <Select value={designerId} onChange={(e) => setDesignerId(e.target.value)}>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Button
            className="w-full"
            size="lg"
            loading={pending}
            disabled={!realWork}
            onClick={() =>
              run(
                () => api(`orders/${orderId}/approve`, { body: { steps: [...selected], notes: notes || null, price: price ? { amount: tomanToRial(price) } : null, designerId: needsDesign ? designerId || null : null } }),
                "سفارش تأیید شد و وارد صف تولید شد.",
              )
            }
          >
            <Check className="size-4" /> تأیید و شروع تولید
          </Button>
          {!realWork && <p className="text-[12px] text-danger">حداقل یک ایستگاه تولید را انتخاب کنید.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { setMode("info"); setText(""); }}>
              <MessageCircleQuestion className="size-4" /> سؤال از مشتری
            </Button>
            <Button variant="danger-ghost" onClick={() => { setMode("reject"); setText(""); }}>
              <X className="size-4" /> رد سفارش
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent
          title={mode === "reject" ? "رد سفارش" : "درخواست توضیح از مشتری"}
          description={mode === "reject" ? "دلیل برای مشتری نمایش داده می‌شود." : "پیام شما برای مشتری ارسال می‌شود و سفارش تا پاسخ او منتظر می‌ماند."}
          footer={
            <Button
              variant={mode === "reject" ? "danger" : "primary"}
              loading={pending}
              disabled={text.trim().length < 3}
              onClick={async () => {
                const ok = await run(
                  () => (mode === "reject" ? api(`orders/${orderId}/reject`, { body: { reason: text } }) : api(`orders/${orderId}/request-info`, { body: { notes: text } })),
                  mode === "reject" ? "سفارش رد شد." : "پیام برای مشتری ارسال شد.",
                );
                if (ok) setMode(null);
              }}
            >
              {mode === "reject" ? "رد سفارش" : "ارسال برای مشتری"}
            </Button>
          }
        >
          <Field label={mode === "reject" ? "دلیل رد" : "سؤال یا اطلاعات موردنیاز"}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={4} />
          </Field>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Priority ────────────────────────────────────────────────────────────────

export function PriorityControl({ orderId, isPriority }: { orderId: string; isPriority: boolean }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [charge, setCharge] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isPriority ? "secondary" : "danger-ghost"}>
          <Flame className="size-4" /> {isPriority ? "برداشتن اولویت" : "اولویت در صف"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={isPriority ? "برداشتن اولویت" : "دادن اولویت به این سفارش"}
        description="تغییر اولویت با نام شما، زمان و دلیل ثبت می‌شود."
        footer={
          <Button loading={pending} disabled={reason.trim().length < 3} onClick={async () => { if (await run(() => api(`orders/${orderId}/priority`, { body: { isPriority: !isPriority, reason, charge: charge ? tomanToRial(charge) : null } }), isPriority ? "اولویت برداشته شد." : "سفارش به ابتدای صف رفت.")) setOpen(false); }}>
            ثبت
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="دلیل" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus placeholder="مثلاً مشتری هزینه فوری پرداخت کرد" />
          </Field>
          {!isPriority && (
            <Field label="هزینه اولویت (اختیاری)" hint="به مبلغ سفارش اضافه می‌شود.">
              <MoneyInput value={charge} onChange={setCharge} />
            </Field>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Artwork & design ────────────────────────────────────────────────────────

export function ArtworkReview({ artworkId }: { artworkId: string }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="flex gap-2">
      <Button size="xs" loading={pending} onClick={() => run(() => api(`artwork/${artworkId}/review`, { body: { approve: true } }), "فایل برای چاپ تأیید شد.")}>
        <Check /> تأیید برای چاپ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="xs" variant="secondary"><X /> نیاز به اصلاح</Button>
        </DialogTrigger>
        <DialogContent
          title="فایل نیاز به اصلاح دارد"
          description="این توضیح برای مشتری نمایش داده می‌شود."
          footer={<Button variant="danger" loading={pending} disabled={note.trim().length < 3} onClick={async () => { if (await run(() => api(`artwork/${artworkId}/review`, { body: { approve: false, note } }), "برای مشتری ارسال شد.")) setOpen(false); }}>ارسال برای مشتری</Button>}
        >
          <Field label="ایراد فایل"><Textarea value={note} onChange={(e) => setNote(e.target.value)} autoFocus rows={3} placeholder="مثلاً رزولوشن تصاویر پایین است؛ فایل ۳۰۰dpi بفرستید" /></Field>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ArtworkUpload({ orderId, purpose, label }: { orderId: string; purpose: "ARTWORK" | "DESIGN"; label: string }) {
  const { run, pending, toast } = useApiAction();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  return (
    <div className="space-y-2">
      <FileDrop purpose={purpose} files={files} onChange={setFiles} compact onError={toast.error} />
      {files.length > 0 && (
        <Button size="sm" loading={pending} onClick={async () => { if (await run(() => api(`orders/${orderId}/artwork`, { body: { fileIds: files.map((f) => f.id) } }), "فایل ثبت شد.")) setFiles([]); }}>
          <Upload className="size-4" /> {label}
        </Button>
      )}
    </div>
  );
}

export function DesignComplete({ orderId }: { orderId: string }) {
  const { run, pending } = useApiAction();
  return (
    <Button size="sm" loading={pending} onClick={() => run(() => api(`orders/${orderId}/design/complete`, { body: {} }), "طراحی انجام شد؛ تولید می‌تواند از این فایل استفاده کند.")}>
      <Check className="size-4" /> طراحی انجام شد
    </Button>
  );
}

// ── Offset: paper and lithography ───────────────────────────────────────────

export function QuoteForm({ orderId, suppliers }: { orderId: string; suppliers: { id: string; name: string }[] }) {
  const { run, pending } = useApiAction();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="grid items-end gap-3 rounded-xl border border-dashed border-line-strong p-3 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
      <Field label="تأمین‌کننده">
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="قیمت">
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      <Field label="توضیح (اختیاری)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً تحویل فردا" />
      </Field>
      <Button loading={pending} disabled={!supplierId || !price} onClick={async () => { if (await run(() => api(`orders/${orderId}/paper-quotes`, { body: { supplierId, price: tomanToRial(price), notes: notes || null } }), "قیمت ثبت شد.")) { setPrice(""); setNotes(""); } }}>
        ثبت قیمت
      </Button>
    </div>
  );
}

export function ChooseSupplier({ orderId, quoteId, label }: { orderId: string; quoteId: string; label: string }) {
  const { run, pending } = useApiAction();
  return (
    <Button size="xs" loading={pending} onClick={() => run(() => api(`orders/${orderId}/paper-decision`, { body: { quoteId } }), `${label} انتخاب شد.`)}>
      <Check /> انتخاب
    </Button>
  );
}

export function LithoForm({
  orderId,
  suppliers,
  job,
}: {
  orderId: string;
  suppliers: { id: string; name: string }[];
  job: { supplierId: string | null; status: string; expectedAt: string | null; price: number | null; notes: string | null } | null;
}) {
  const { run, pending } = useApiAction();
  const [supplierId, setSupplierId] = useState(job?.supplierId ?? suppliers[0]?.id ?? "");
  const [status, setStatus] = useState(job?.status && job.status !== "NOT_ORDERED" ? job.status : "ORDERED");
  const [expectedAt, setExpectedAt] = useState(job?.expectedAt?.slice(0, 10) ?? "");
  const [price, setPrice] = useState(rialToToman(job?.price));
  const [notes, setNotes] = useState(job?.notes ?? "");
  const STATUSES = [
    ["ORDERED", "سفارش داده شد"],
    ["IN_PROGRESS", "در حال انجام در لیتوگرافی"],
    ["READY", "آماده تحویل"],
    ["RECEIVED", "دریافت شد"],
    ["CANCELLED", "لغو شد"],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="لیتوگرافی">
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="وضعیت">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </Select>
      </Field>
      <Field label="تاریخ تحویل پیش‌بینی‌شده" hint="اختیاری">
        <Input type="date" ltr value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
      </Field>
      <Field label="هزینه" hint="اختیاری">
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      <Field label="توضیح" className="sm:col-span-2">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Button
          loading={pending}
          onClick={() =>
            run(
              () => api(`orders/${orderId}/litho`, { method: "PUT", body: { supplierId: supplierId || null, status, expectedAt: expectedAt || null, price: price ? tomanToRial(price) : null, notes: notes || null } }),
              status === "RECEIVED" ? "زینک دریافت شد؛ لیتوگرافی تکمیل شد." : "وضعیت لیتوگرافی ثبت شد.",
            )
          }
        >
          ثبت وضعیت لیتوگرافی
        </Button>
      </div>
    </div>
  );
}

// ── Money ───────────────────────────────────────────────────────────────────

export function PriceForm({ orderId, kind, amount, discount }: { orderId: string; kind: "STORE" | "CUSTOM"; amount: number | null; discount: number }) {
  const { run, pending } = useApiAction();
  const [value, setValue] = useState(rialToToman(amount));
  const [off, setOff] = useState(rialToToman(discount));
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
      {kind === "CUSTOM" && (
        <Field label="مبلغ پروژه (بدون مالیات)">
          <MoneyInput value={value} onChange={setValue} />
        </Field>
      )}
      <Field label="تخفیف">
        <MoneyInput value={off} onChange={setOff} placeholder="0" />
      </Field>
      <Button loading={pending} disabled={kind === "CUSTOM" && !value} onClick={() => run(() => api(`orders/${orderId}/price`, { body: { amount: kind === "CUSTOM" ? tomanToRial(value) : undefined, discount: off ? tomanToRial(off) : 0 } }), "مبلغ سفارش ثبت شد.")}>
        ذخیره مبلغ
      </Button>
    </div>
  );
}

export function PaymentForm({ orderId, balance }: { orderId: string; balance: number }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("POS");
  const [amount, setAmount] = useState(rialToToman(balance));
  const [reference, setReference] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">ثبت دریافت</Button>
      </DialogTrigger>
      <DialogContent
        title="ثبت دریافت وجه"
        description={`مانده: ${formatToman(balance)}`}
        footer={
          <Button loading={pending} disabled={!amount} onClick={async () => { if (await run(() => api(`orders/${orderId}/payments`, { body: { method, amount: tomanToRial(amount), reference: reference || null, idempotencyKey: newIdempotencyKey() } }), "پرداخت ثبت شد.")) setOpen(false); }}>
            ثبت
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="روش">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="POS">کارتخوان</option>
              <option value="CASH">نقدی</option>
              <option value="BANK_TRANSFER">کارت به کارت / حواله</option>
              <option value="CHEQUE">چک (پس از وصول تأیید می‌شود)</option>
            </Select>
          </Field>
          <Field label="مبلغ"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="شماره پیگیری / شماره چک" hint="اختیاری"><Input ltr value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IssueInvoice({ orderId, defaultType }: { orderId: string; defaultType: "OFFICIAL" | "UNOFFICIAL" }) {
  const { run, pending, router } = useApiAction();
  const [type, setType] = useState(defaultType);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="h-8 w-auto text-[13px]">
        <option value="OFFICIAL">فاکتور رسمی (حقوقی)</option>
        <option value="UNOFFICIAL">فاکتور غیررسمی (حقیقی)</option>
      </Select>
      <Button size="sm" loading={pending} onClick={() => run(() => api<{ id: string }>(`orders/${orderId}/invoices`, { body: { type } }), "فاکتور صادر شد.", (r) => router.push(`/panel/invoices/${(r as { id: string }).id}`))}>
        صدور فاکتور
      </Button>
    </div>
  );
}

// ── Shipping ────────────────────────────────────────────────────────────────

export function DispatchForm({ orderId, preferred, people }: { orderId: string; preferred: string | null; people: { id: string; name: string }[] }) {
  const { run, pending } = useApiAction();
  const [method, setMethod] = useState(preferred ?? "COURIER");
  const [responsibleId, setResponsibleId] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");
  const METHODS = [
    ["COURIER", "پیک چاپخانه"],
    ["POST", "پست"],
    ["EXTERNAL", "باربری / شرکت پخش"],
    ["CUSTOMER_COURIER", "پیک مشتری"],
    ["PICKUP", "تحویل حضوری در چاپخانه"],
  ] as const;
  const handover = method === "PICKUP" || method === "CUSTOMER_COURIER";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {METHODS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMethod(k)} className={cn("rounded-xl border px-3 py-2.5 text-[13px] font-bold transition-colors", method === k ? "border-ink bg-ink text-surface" : "border-line bg-surface hover:border-line-strong")}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {method === "COURIER" && people.length > 0 && (
          <Field label="پیک / مسئول ارسال">
            <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">خودم</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {(method === "POST" || method === "EXTERNAL" || method === "CUSTOMER_COURIER") && (
          <Field label={method === "CUSTOMER_COURIER" ? "نام پیک مشتری" : "شرکت حمل / اداره پست"} required={method === "CUSTOMER_COURIER"}>
            <Input value={carrierName} onChange={(e) => setCarrierName(e.target.value)} />
          </Field>
        )}
        {(method === "POST" || method === "EXTERNAL") && (
          <Field label="کد رهگیری">
            <Input ltr value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
          </Field>
        )}
        <Field label={handover ? "تحویل‌گیرنده" : "گیرنده"} hint="اختیاری">
          <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </Field>
        <Field label="توضیح" hint="اختیاری">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <Button
        loading={pending}
        onClick={() =>
          run(
            () => api(`orders/${orderId}/dispatch`, { body: { method, responsibleId: responsibleId || null, carrierName: carrierName || null, trackingCode: trackingCode || null, recipientName: recipientName || null, notes: notes || null } }),
            handover ? "تحویل ثبت شد." : "ارسال ثبت شد.",
          )
        }
      >
        {handover ? "ثبت تحویل" : "ثبت ارسال"}
      </Button>
    </div>
  );
}
