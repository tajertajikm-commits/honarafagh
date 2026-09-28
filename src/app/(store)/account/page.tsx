import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateText, EmptyState, InkProgress, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";
import { requireCustomerPage } from "@/server/http/session";
import { listOrders } from "@/server/modules/orders/queries";
import { WelcomeProfile } from "@/components/store/welcome-profile";

const PROGRESS: Record<string, number> = { PENDING_REVIEW: 0.1, CONFIRMED: 0.25, IN_PROGRESS: 0.55, ON_HOLD: 0.4, READY: 0.85, COMPLETED: 1, CANCELLED: 0 };

export default async function AccountOrders({ searchParams }: { searchParams: Promise<{ welcome?: string; next?: string }> }) {
  const ctx = await requireCustomerPage("/account");
  const { welcome, next } = await searchParams;
  const { rows } = await listOrders(ctx, { pageSize: 50 });
  return (
    <div className="space-y-4">
      {(welcome || !ctx.actor.name) && <WelcomeProfile customerId={ctx.actor.customerId} next={next && next.startsWith("/") ? next : null} />}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<Package />} title="هنوز سفارشی ثبت نکرده‌اید" action={<Button asChild><Link href="/products">شروع سفارش</Link></Button>} />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ order: o, items }) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="group block rounded-2xl border border-line bg-surface p-5 shadow-soft transition-colors hover:border-line-strong">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold">سفارش <OrderNo n={o.number} /></p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      <DateText value={o.placedAt} /> · {items.map((i) => `${i.title} (${formatNumber(i.quantity)})`).join("، ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Status map={ORDER_STATUS} value={o.status} />
                    <Status map={PAYMENT_STATUS} value={o.paymentStatus} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <InkProgress value={PROGRESS[o.status] ?? 0} className="flex-1" />
                  <Money rial={o.total} strong />
                  <ArrowLeft className="size-4 text-muted transition-transform group-hover:-translate-x-0.5" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
