import Image from "next/image";
import type { InvoiceParty, InvoiceSnapshot } from "@/server/db/schema";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/persian";

const rial = (n: number) => formatNumber(n);

function Party({ title, p, official }: { title: string; p: InvoiceParty; official: boolean }) {
  const rows: [string, string | null | undefined][] = official
    ? [
        ["نام شرکت", p.companyName ?? p.name],
        ["شناسه ملی", p.nationalId],
        ["کد اقتصادی", p.economicCode],
        ["شماره ثبت", p.registrationNo],
        ["تلفن", p.phone],
        ["کد پستی", p.postalCode],
        ["نشانی", p.address],
      ]
    : [
        ["نام", p.name],
        ["کد ملی", p.nationalId],
        ["تلفن", p.phone],
        ["نشانی", p.address],
      ];
  return (
    <div className="print-break-avoid rounded-xl border border-line">
      <p className="border-b border-line bg-surface-2 px-3 py-1.5 text-[12px] font-bold">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-[12px]">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className={cn("flex gap-1.5", k === "نشانی" && "col-span-2")}>
            <dt className="shrink-0 text-muted">{k}:</dt>
            <dd className="font-medium" dir="auto">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The invoice as issued: everything comes from the frozen snapshot, so it
 * prints the same forever. A4, print-ready (browser «Save as PDF»).
 */
export function InvoiceDocument({ number, type, issuedAt, snapshot: s, notes, voided }: { number: number; type: "OFFICIAL" | "UNOFFICIAL"; issuedAt: Date; snapshot: InvoiceSnapshot; notes: string | null; voided: boolean }) {
  const official = type === "OFFICIAL";
  return (
    <article className="print-sheet relative mx-auto max-w-[210mm] rounded-2xl border border-line bg-white p-8 text-ink shadow-card" style={{ color: "#121214" }}>
      {voided && <div className="pointer-events-none absolute inset-0 grid place-items-center text-[90px] font-bold text-danger/15 [transform:rotate(-20deg)]">باطل شده</div>}
      <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
        <div className="flex items-center gap-3">
          <Image src="/brand/logo.webp" alt="هنر آفاق" width={70} height={55} />
          <div>
            <p className="text-[16px] font-bold">{s.seller.companyName ?? s.seller.name}</p>
            {official && s.seller.name !== s.seller.companyName && <p className="text-[12px] text-muted">{s.seller.name}</p>}
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-[20px] font-bold">{official ? "صورتحساب فروش کالا و خدمات" : "فاکتور فروش"}</h1>
          <p className="text-[12px] text-muted">{official ? "رسمی — مشتری حقوقی" : "غیررسمی — مشتری حقیقی"}</p>
        </div>
        <dl className="space-y-0.5 text-[12px]">
          <div className="flex justify-between gap-4"><dt className="text-muted">شماره فاکتور</dt><dd className="font-bold tabular">{formatNumber(number)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">تاریخ</dt><dd className="font-bold">{formatDate(issuedAt)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">کد سفارش</dt><dd className="font-bold" dir="ltr">{s.orderCode}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">کد مشتری</dt><dd className="font-bold" dir="ltr">{s.customerCode}</dd></div>
        </dl>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
        <Party title="مشخصات فروشنده" p={s.seller} official={official} />
        <Party title="مشخصات خریدار" p={s.buyer} official={official} />
      </div>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-surface-2 text-[11.5px]">
            {["ردیف", "شرح کالا / خدمت", "تعداد", "واحد", "مبلغ واحد (ریال)", "تخفیف (ریال)", "مبلغ (ریال)"].map((h) => (
              <th key={h} className="border border-line px-2 py-1.5 text-start font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="print-break-avoid">
              <td className="border border-line px-2 py-1.5 tabular">{formatNumber(i + 1)}</td>
              <td className="border border-line px-2 py-1.5">
                <span className="font-bold">{l.title}</span>
                {l.description && <span className="block text-[11px] text-muted">{l.description}</span>}
              </td>
              <td className="border border-line px-2 py-1.5 tabular">{formatNumber(l.quantity)}</td>
              <td className="border border-line px-2 py-1.5">{l.unit}</td>
              <td className="border border-line px-2 py-1.5 tabular">{rial(l.unitPrice)}</td>
              <td className="border border-line px-2 py-1.5 tabular">{l.discount ? rial(l.discount) : "—"}</td>
              <td className="border border-line px-2 py-1.5 font-bold tabular">{rial(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_18rem] print:grid-cols-[1fr_18rem]">
        <div className="space-y-2 text-[12px]">
          <p><b>وضعیت پرداخت:</b> {s.paymentStatus}</p>
          {s.paymentTerms && <p><b>شرایط پرداخت:</b> {s.paymentTerms}</p>}
          {notes && <p className="rounded-lg bg-surface-2 px-3 py-2">{notes}</p>}
        </div>
        <dl className="print-break-avoid divide-y divide-line rounded-xl border border-line text-[12.5px]">
          {([
            ["جمع اقلام", s.subtotal],
            ...(s.discount ? ([["تخفیف", -s.discount]] as [string, number][]) : []),
            ...(s.shipping ? ([["هزینه ارسال", s.shipping]] as [string, number][]) : []),
            [`مالیات بر ارزش افزوده (${formatNumber(s.vatPct)}٪)`, s.vat],
          ] as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex justify-between px-3 py-1.5"><dt className="text-muted">{k}</dt><dd className="tabular">{rial(v)}</dd></div>
          ))}
          <div className="flex justify-between bg-surface-2 px-3 py-2 text-[14px] font-bold"><dt>مبلغ کل (ریال)</dt><dd className="tabular">{rial(s.total)}</dd></div>
          <div className="flex justify-between px-3 py-1.5"><dt className="text-muted">پرداخت‌شده</dt><dd className="tabular">{rial(s.paid)}</dd></div>
          <div className="flex justify-between px-3 py-1.5 font-bold"><dt>مانده</dt><dd className="tabular">{rial(Math.max(0, s.remaining))}</dd></div>
        </dl>
      </div>

      {official && (
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[12px] text-muted print-break-avoid">
          <div className="border-t border-dashed border-line-strong pt-2">مهر و امضای فروشنده</div>
          <div className="border-t border-dashed border-line-strong pt-2">مهر و امضای خریدار</div>
        </div>
      )}
    </article>
  );
}
