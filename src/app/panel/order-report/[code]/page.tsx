import Image from "next/image";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { InvoiceToolbar } from "@/components/invoice/invoice-toolbar";
import { requireStaffPage } from "@/server/http/session";
import { staffOrder } from "@/server/modules/orders/queries";
import { balanceOf } from "@/server/modules/orders/state";
import { getSetting } from "@/server/modules/settings/service";
import { station } from "@/server/modules/workflow/stations";
import { APPROVAL_DECISION, ARTWORK_FILE_STATUS, ARTWORK_STATUS, CUSTOMER_TYPE, INVOICE_TYPE, LITHO_STATUS, ORDER_KIND, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_RECORD_STATUS, PAYMENT_STATUS, PRODUCTION_TYPE, SHIPPING_METHOD, STEP_STATUS, label } from "@/lib/labels";
import { formatDate, formatDateTime, formatNumber, formatPhone, formatToman } from "@/lib/persian";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return { title: `گزارش کار ${decodeURIComponent((await params).code)}` };
}

const dt = (d: Date | string | null | undefined) => (d ? formatDateTime(d) : "—");
const money = (n: number | null | undefined) => (n == null ? "—" : formatToman(n));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-break-avoid mt-5">
      <h2 className="mb-2 border-b-2 border-ink pb-1 text-[14px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] print:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-1.5 border-b border-dashed border-line py-0.5">
          <dt className="shrink-0 text-muted">{k}:</dt>
          <dd className="font-medium" dir="auto">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows, empty = "موردی ثبت نشده است." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="text-[12px] text-muted">{empty}</p>;
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="bg-surface-2">
          {head.map((h) => (
            <th key={h} className="border border-line px-1.5 py-1 text-start font-bold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="print-break-avoid align-top">
            {r.map((c, j) => (
              <td key={j} className="border border-line px-1.5 py-1">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The order's complete record ("شناسنامه"): everything that happened, who did
 * it and when, on A4 — for the accountant's file. PDF via the browser.
 */
export default async function OrderReportPage({ params }: { params: Promise<{ code: string }> }) {
  const ctx = await requireStaffPage({ anyOf: ["invoice.manage", "payment.view", "dashboard.view"] });
  const d = await staffOrder(ctx, decodeURIComponent((await params).code));
  const { order: o, customer: c } = d;
  const business = await getSetting(ctx.db, "business");
  const s = d.shipment;
  const events = [...d.events].reverse();
  const reworks = d.steps.reduce((n, x) => n + x.step.reworkCount, 0);

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 print:bg-white print:p-0">
      <InvoiceToolbar backHref={`/panel/orders/${o.code}`} backLabel={`بازگشت به سفارش ${o.code}`} />
      <article className="print-sheet mx-auto max-w-[210mm] rounded-2xl border border-line bg-white p-8 text-ink shadow-card" style={{ color: "#121214" }}>
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo.webp" alt="هنر آفاق" width={64} height={50} />
            <div>
              <p className="text-[15px] font-bold">{business.name}</p>
              <p className="text-[11.5px] text-muted">{business.phone}</p>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-[19px] font-bold">شناسنامه و گزارش کار سفارش</h1>
            <p className="text-[12px] text-muted">{PRODUCTION_TYPE[o.productionType]} • {ORDER_KIND[o.kind]}</p>
          </div>
          <dl className="space-y-0.5 text-[12px]">
            <div className="flex justify-between gap-4"><dt className="text-muted">کد سفارش</dt><dd className="font-bold" dir="ltr">{o.code}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">وضعیت</dt><dd className="font-bold">{label(ORDER_STATUS, o.status)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">تاریخ گزارش</dt><dd className="font-bold">{formatDate(new Date())}</dd></div>
          </dl>
        </header>

        <Section title="۱. مشتری و مشخصات سفارش">
          <Grid
            rows={[
              ["مشتری", c.companyName ? `${c.companyName} (${c.fullName})` : c.fullName],
              ["کد مشتری", <bdi key="c" dir="ltr">CUS-{c.code}</bdi>],
              ["نوع مشتری", CUSTOMER_TYPE[c.type]],
              ["تلفن", <bdi key="p" dir="ltr">{formatPhone(c.phone)}</bdi>],
              ["عنوان کار", o.title],
              ["تیراژ", o.quantity ? formatNumber(o.quantity) : "—"],
              ["ابعاد", o.dimensions],
              ["جنس کاغذ / مقوا", o.material],
              ["رنگ", o.colors],
              ["عملیات تکمیلی", o.finishing],
              ["ثبت سفارش", dt(o.createdAt)],
              ["تحویل درخواستی", o.requestedDeadline ? formatDate(o.requestedDeadline) : "—"],
              ["اولویت", o.isPriority ? "دارد" : "ندارد"],
              ["دفعات دوباره‌کاری", formatNumber(reworks)],
            ]}
          />
          {o.description && <p className="mt-2 text-[12px]"><b>توضیحات:</b> {o.description}</p>}
          {o.customerNote && <p className="mt-1 text-[12px]"><b>یادداشت مشتری:</b> {o.customerNote}</p>}
        </Section>

        <Section title="۲. تأیید سفارش">
          <Table
            head={["تاریخ", "تصمیم", "تأییدکننده", "ایستگاه‌های انتخاب‌شده", "یادداشت / دلیل"]}
            rows={d.approvals.map(({ approval: a, approverName }) => [dt(a.createdAt), label(APPROVAL_DECISION, a.decision), approverName, a.selectedSteps.map((k) => station(k).name).join("، ") || "—", [a.notes, a.reason].filter(Boolean).join(" — ") || "—"])}
          />
        </Section>

        <Section title="۳. فایل و طراحی">
          <Grid rows={[["وضعیت فایل", label(ARTWORK_STATUS, o.artworkStatus)], ["طراح", o.needsDesign ? (d.designerName ?? "تعیین نشده") : "طراحی لازم نبود"]]} />
          <div className="mt-2">
            <Table
              head={["نسخه", "منبع", "فایل", "بارگذاری", "وضعیت", "بررسی / توضیح"]}
              rows={d.artwork.map(({ artwork: a, file, uploaderName }) => [formatNumber(a.versionNo), a.source === "DESIGNER" ? "طراح" : "مشتری", file.name, `${uploaderName ?? "—"} — ${dt(a.createdAt)}`, label(ARTWORK_FILE_STATUS, a.status), [a.reviewNote, a.note].filter(Boolean).join(" — ") || (a.reviewedAt ? dt(a.reviewedAt) : "—")])}
            />
          </div>
        </Section>

        <Section title="۴. مسیر تولید (ایستگاه‌ها)">
          <Table
            head={["مرحله", "ایستگاه", "وضعیت", "مسئول", "شروع", "پایان / ثبت‌کننده", "ماشین / کاغذ", "دوباره‌کاری", "یادداشت"]}
            rows={d.steps.map(({ step: x, station: st, machineName, assigneeName, completedByName }) => [
              formatNumber(x.phase),
              st.name,
              label(STEP_STATUS, x.status),
              assigneeName ? `${assigneeName}${x.assignedBy ? " (ارجاع مدیر)" : ""}` : "—",
              dt(x.startedAt),
              x.completedAt ? `${dt(x.completedAt)} — ${completedByName ?? ""}` : "—",
              [machineName, typeof x.data.materialName === "string" ? `${x.data.materialName}${x.data.quantity ? ` × ${formatNumber(Number(x.data.quantity))}` : ""}` : null, typeof x.data.paperNote === "string" ? x.data.paperNote : null].filter(Boolean).join(" — ") || "—",
              x.reworkCount ? formatNumber(x.reworkCount) : "—",
              x.note ?? "—",
            ])}
          />
        </Section>

        <Section title="۵. کنترل کیفیت">
          <Table
            head={["تاریخ", "مرحله", "نتیجه", "تأییدکننده", "دلیل رد / بازگشت به", "یادداشت"]}
            rows={d.quality.map(({ q, approverName }) => [dt(q.createdAt), d.steps.find((x) => x.step.id === q.stepId)?.station.name ?? "—", q.decision === "APPROVED" ? "تأیید" : "رد", approverName, q.decision === "REJECTED" ? `${q.reason ?? ""}${q.returnToStep ? ` ← ${q.returnToStep === "DESIGN" ? "طراحی مجدد" : q.returnToStep === "CUSTOMER_FILE" ? "اصلاح فایل مشتری" : station(q.returnToStep).name}` : ""}` : "—", q.notes ?? "—"])}
          />
        </Section>

        {d.priority.length > 0 && (
          <Section title="۶. اولویت در صف">
            <Table head={["تاریخ", "تغییر", "توسط", "دلیل", "هزینه"]} rows={d.priority.map(({ change: p, byName }) => [dt(p.createdAt), p.isPriority ? "اولویت داده شد" : "اولویت برداشته شد", byName, p.reason, money(p.charge)])} />
          </Section>
        )}

        {d.offset && (
          <Section title="۷. تأمین کاغذ و لیتوگرافی">
            <Table
              head={["تأمین‌کننده کاغذ", "قیمت", "ثبت", "انتخاب‌شده"]}
              rows={d.offset.procurement.quotes.map(({ quote: q, supplierName, createdByName }) => [supplierName, money(q.price), `${createdByName ?? "—"} — ${dt(q.quotedAt)}`, d.offset!.procurement.decision?.decision.quoteId === q.id ? `بله (${d.offset!.procurement.decision.approverName})` : "—"])}
              empty="قیمتی ثبت نشده است."
            />
            <div className="mt-2">
              <Grid
                rows={[
                  ["لیتوگرافی", d.offset.litho?.supplierName ?? "—"],
                  ["وضعیت لیتوگرافی", d.offset.litho ? label(LITHO_STATUS, d.offset.litho.job.status) : "—"],
                  ["هزینه لیتوگرافی", money(d.offset.litho?.job.price)],
                  ["توضیح", d.offset.litho?.job.notes ?? "—"],
                ]}
              />
            </div>
          </Section>
        )}

        <Section title="۸. مالی">
          <Table head={["ردیف", "شرح", "تعداد", "مبلغ"]} rows={d.items.map((i) => [formatNumber(i.lineNo), [i.title, i.note].filter(Boolean).join(" — "), formatNumber(i.quantity), money(i.lineSubtotal)])} />
          <div className="mt-2">
            <Grid
              rows={[
                ["جمع کل", o.pricedAt ? money(o.total) : "تعیین نشده"],
                ["پرداخت‌شده", money(o.paidAmount)],
                ["مانده", o.pricedAt ? money(Math.max(0, balanceOf(o))) : "—"],
                ["وضعیت پرداخت", label(PAYMENT_STATUS, o.paymentStatus)],
              ]}
            />
          </div>
          <div className="mt-2">
            <Table
              head={["تاریخ", "روش", "مبلغ", "وضعیت", "ثبت‌کننده / مرجع"]}
              rows={d.payments.map(({ payment: p, byName }) => [dt(p.createdAt), p.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[p.method], money(p.kind === "REFUND" ? -p.amount : p.amount), label(PAYMENT_RECORD_STATUS, p.status), [byName ?? (p.method === "ONLINE" ? "درگاه" : null), p.reference].filter(Boolean).join(" — ") || "—"])}
              empty="پرداختی ثبت نشده است."
            />
          </div>
          {d.invoices.length > 0 && <p className="mt-2 text-[12px]"><b>فاکتورها:</b> {d.invoices.map((i) => `${INVOICE_TYPE[i.type]} شماره ${formatNumber(i.number)} (${formatDate(i.issuedAt)})${i.status === "VOID" ? " — باطل" : ""}`).join("، ")}</p>}
        </Section>

        <Section title="۹. ارسال و تحویل">
          {s ? (
            <Grid
              rows={[
                ["روش ارسال", SHIPPING_METHOD[s.shipment.method]],
                ["مسئول ارسال", s.responsibleName ?? "—"],
                ["حمل‌کننده", s.shipment.carrierName ?? "—"],
                ["کد رهگیری", s.shipment.trackingCode ? <bdi key="t" dir="ltr">{s.shipment.trackingCode}</bdi> : "—"],
                ["زمان ارسال", dt(s.shipment.dispatchedAt)],
                ["زمان تحویل", dt(s.shipment.deliveredAt)],
                ["تحویل‌دهنده به مشتری", s.deliveredByName ?? (s.shipment.deliveredAt ? "—" : "هنوز تحویل نشده")],
                ["تحویل‌گیرنده", s.shipment.recipientName ?? "—"],
              ]}
            />
          ) : (
            <p className="text-[12px] text-muted">هنوز ارسال نشده است.</p>
          )}
        </Section>

        <Section title="۱۰. تاریخچه کامل">
          <Table head={["زمان", "رویداد", "توسط"]} rows={events.map((e) => [dt(e.createdAt), e.message, e.actorLabel ?? "—"])} />
        </Section>

        <div className="print-break-avoid mt-10 grid grid-cols-3 gap-8 text-center text-[12px] text-muted">
          <div className="border-t border-dashed border-line-strong pt-2">مسئول تولید</div>
          <div className="border-t border-dashed border-line-strong pt-2">حسابداری</div>
          <div className="border-t border-dashed border-line-strong pt-2">مدیر</div>
        </div>
      </article>
    </div>
  );
}
