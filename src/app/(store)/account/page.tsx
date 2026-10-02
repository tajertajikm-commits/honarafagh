import Link from "next/link";
import { ArrowLeft, Package, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText, EmptyState, Money, OrderCode } from "@/components/ui/misc";
import { CUSTOMER_STAGES } from "@/lib/order-status";
import { PRODUCTION_TYPE } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { requireCustomerPage } from "@/server/http/session";
import { customerOrders } from "@/server/modules/orders/queries";
import { WelcomeProfile } from "@/components/store/welcome-profile";

export default async function AccountOrders({ searchParams }: { searchParams: Promise<{ welcome?: string; next?: string }> }) {
  const ctx = await requireCustomerPage("/account");
  const { welcome, next } = await searchParams;
  const rows = await customerOrders(ctx);
  return (
    <div className="space-y-4">
      {(welcome || !ctx.actor.name) && <WelcomeProfile customerId={ctx.actor.customerId} next={next && next.startsWith("/") ? next : null} />}
      <div className="flex justify-end">
        <Button asChild size="sm" variant="secondary"><Link href="/order"><Plus className="size-4" /> سفارش اختصاصی جدید</Link></Button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<Package />} title="هنوز سفارشی ثبت نکرده‌اید" action={<div className="flex gap-2"><Button asChild><Link href="/products">خرید از فروشگاه</Link></Button><Button asChild variant="secondary"><Link href="/order">سفارش اختصاصی</Link></Button></div>} />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="group block rounded-2xl border border-line bg-surface p-5 shadow-soft transition-colors hover:border-line-strong">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold"><OrderCode code={o.code} /> <span className="ms-1 text-[12.5px] font-medium text-muted">{PRODUCTION_TYPE[o.productionType]}</span></p>
                    <p className="mt-0.5 truncate text-[13px] text-muted"><DateText value={o.createdAt} /> • {o.title}</p>
                  </div>
                  <Badge tone={o.customer.tone === "danger" ? "danger" : o.customer.tone === "success" ? "success" : o.customer.tone === "warning" ? "warning" : "info"}>{o.customer.label}</Badge>
                </div>
                {o.customer.action && <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[12.5px] font-bold text-warning">{o.customer.action}</p>}
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {CUSTOMER_STAGES.map((s, i) => <span key={s.key} className={cn("h-1.5 flex-1 rounded-full", o.customer.index >= i ? "bg-ink" : "bg-surface-3")} />)}
                  </div>
                  {o.pricedAt ? <Money rial={o.total} strong /> : <span className="text-[12.5px] text-muted">در انتظار قیمت</span>}
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
