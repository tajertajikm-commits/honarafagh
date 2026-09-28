import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { DateText, Money } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { QuoteActions } from "@/components/store/quote-actions";
import { QUOTE_STATUS } from "@/lib/labels";
import { formatNumber, toFaDigits } from "@/lib/persian";
import { quoteItems, quotes } from "@/server/db/schema";
import { requireCustomerPage } from "@/server/http/session";

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCustomerPage(`/account/quotes/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [q] = await ctx.db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.customerId, ctx.actor.customerId)));
  if (!q || q.status === "DRAFT") notFound();
  const items = await ctx.db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.sortOrder));
  const expired = q.validUntil < new Date();
  return (
    <Card>
      <CardBody className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold">پیش‌فاکتور {toFaDigits(q.number)}</h2>
            <p className="text-[13px] text-muted">صدور: <DateText value={q.createdAt} /> · اعتبار تا <DateText value={q.validUntil} /></p>
          </div>
          <Status map={QUOTE_STATUS} value={expired && q.status === "SENT" ? "EXPIRED" : q.status} />
        </div>
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-bold">{it.title} <span className="font-medium text-muted">× {formatNumber(it.quantity)}</span></p>
                {it.description && <p className="text-[12.5px] leading-6 text-muted">{toFaDigits(it.description)}</p>}
              </div>
              <Money rial={it.lineSubtotal} />
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 text-[14px] sm:ms-auto sm:max-w-xs">
          <div className="flex justify-between"><dt className="text-muted">جمع</dt><dd><Money rial={q.subtotal} /></dd></div>
          {q.discountAmount > 0 && <div className="flex justify-between"><dt className="text-muted">تخفیف</dt><dd><Money rial={q.discountAmount} /></dd></div>}
          <div className="flex justify-between"><dt className="text-muted">مالیات ({formatNumber(q.vatPct)}٪)</dt><dd><Money rial={q.vatAmount} /></dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-[16px] font-bold"><dt>مبلغ کل</dt><dd><Money rial={q.total} /></dd></div>
        </dl>
        {q.customerNote && <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px] text-ink-2">{q.customerNote}</p>}
        {q.status === "SENT" && !expired && <QuoteActions quoteId={q.id} />}
        {q.convertedOrderId && <a href={`/account/orders/${q.convertedOrderId}`} className="mt-4 inline-block font-bold text-accent-ink">مشاهده سفارش ثبت‌شده</a>}
      </CardBody>
    </Card>
  );
}
