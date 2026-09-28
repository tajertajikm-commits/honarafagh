import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { DateText, EmptyState, Money } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { INQUIRY_STATUS, QUOTE_STATUS } from "@/lib/labels";
import { toFaDigits } from "@/lib/persian";
import { inquiries, quotes } from "@/server/db/schema";
import { requireCustomerPage } from "@/server/http/session";

export default async function AccountQuotes() {
  const ctx = await requireCustomerPage("/account/quotes");
  const qs = await ctx.db.select().from(quotes).where(eq(quotes.customerId, ctx.actor.customerId)).orderBy(desc(quotes.createdAt));
  const inq = await ctx.db.select().from(inquiries).where(eq(inquiries.customerId, ctx.actor.customerId)).orderBy(desc(inquiries.createdAt));
  const visible = qs.filter((q) => q.status !== "DRAFT");
  return (
    <div className="space-y-6">
      {visible.length === 0 && inq.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<FileText />} title="پیش‌فاکتوری ندارید" description="برای کارهای خاص، استعلام قیمت ثبت کنید." action={<Link className="font-bold text-accent-ink" href="/quote">ثبت استعلام</Link>} />
        </div>
      )}
      {visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((q) => (
            <li key={q.id}>
              <Link href={`/account/quotes/${q.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-soft hover:border-line-strong">
                <div>
                  <p className="font-bold">پیش‌فاکتور {toFaDigits(q.number)}</p>
                  <p className="text-[13px] text-muted">اعتبار تا <DateText value={q.validUntil} /></p>
                </div>
                <div className="flex items-center gap-3">
                  <Money rial={q.total} strong />
                  <Status map={QUOTE_STATUS} value={q.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {inq.length > 0 && (
        <div>
          <h3 className="mb-3 text-[15px] font-bold">استعلام‌های من</h3>
          <ul className="space-y-2">
            {inq.map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-[13.5px]">
                <span>{i.title} <span className="text-muted">• <DateText value={i.createdAt} /></span></span>
                <Status map={INQUIRY_STATUS} value={i.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
