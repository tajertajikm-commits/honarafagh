import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, ChevronLeft, ClipboardCheck, Flame, Layers, ScrollText, Truck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DateText, Money, OrderCode } from "@/components/ui/misc";
import { PageHeader } from "@/components/panel/page";
import { PriorityFlag, TypeChip } from "@/components/panel/chips";
import { requireStaffPage } from "@/server/http/session";
import { controlCenter } from "@/server/modules/dashboard/service";
import type { StationQueue } from "@/server/modules/queues/service";
import { LITHO_STATUS, SHIPPING_METHOD, label } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/persian";

export const metadata: Metadata = { title: "داشبورد مدیریت" };

export default async function DashboardPage() {
  const ctx = await requireStaffPage({ permission: "dashboard.view" });
  const d = await controlCenter(ctx);
  const n = formatNumber;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title="مرکز کنترل" description="آنچه همین حالا تصمیم شما را می‌خواهد، و جایی که کار گیر کرده است." />

      {/* Decisions waiting for the manager */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile href="/panel/orders?tab=approval" icon={<ClipboardCheck />} label="منتظر تأیید" value={d.waitingApproval.length} sub={d.needsInfo ? `${n(d.needsInfo)} منتظر پاسخ مشتری` : "سفارش جدید"} tone={d.waitingApproval.length ? "warning" : "neutral"} />
        <Tile href="#quality" icon={<BadgeCheck />} label="منتظر تأیید کیفیت" value={d.quality.length} sub="چاپ و نهایی" tone={d.quality.length ? "warning" : "neutral"} />
        <Tile href="#paper" icon={<ScrollText />} label="انتخاب تأمین‌کننده کاغذ" value={d.paperPending.length} sub="قیمت‌ها ثبت شده" tone={d.paperPending.length ? "warning" : "neutral"} />
        <Tile href="#priority" icon={<Flame />} label="سفارش‌های فوری" value={d.priority.length} sub="بالای صف‌ها" tone={d.priority.length ? "danger" : "neutral"} />
      </div>

      {/* Production at a glance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Board title="دیجیتال" href="/panel/queues/digital" active={d.digitalActive} queues={d.digital} />
        <Board title="افست" href="/panel/queues/offset" active={d.offsetActive} queues={d.offset} />
      </div>
      {d.bottlenecks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft/60 px-5 py-3 text-[13.5px]">
          <AlertTriangle className="size-5 text-warning" />
          <b>گلوگاه:</b>
          {d.bottlenecks.map((b) => (
            <span key={b.station.key}>
              {b.station.name} ({b.station.type === "DIGITAL" ? "دیجیتال" : "افست"}) — {n(b.waiting)} در صف{b.blocked ? `، ${n(b.blocked)} متوقف` : ""}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel id="approvals" icon={<ClipboardCheck />} title="سفارش‌های منتظر تأیید" count={d.waitingApproval.length} className="lg:col-span-2">
          {d.waitingApproval.slice(0, 8).map((o) => (
            <OrderLine key={o.id} code={o.code} type={o.productionType} title={o.title} customer={o.customerName} priority={o.isPriority} right={<DateText value={o.createdAt} relative className="text-[12px] text-muted" />} />
          ))}
        </Panel>
        <Panel id="priority" icon={<Flame />} title="فوری‌ها" count={d.priority.length}>
          {d.priority.map((o) => (
            <OrderLine key={o.id} code={o.code} type={o.productionType} title={o.title} customer={o.customerName} />
          ))}
        </Panel>

        <Panel id="quality" icon={<BadgeCheck />} title="منتظر تأیید کیفیت" count={d.quality.length}>
          {d.quality.map((q) => (
            <OrderLine key={q.stepId} code={q.order.code} type={q.order.productionType} title={q.stationName} customer={q.order.customerName} priority={q.order.isPriority} />
          ))}
        </Panel>
        <Panel id="paper" icon={<ScrollText />} title="تصمیم تأمین کاغذ" count={d.paperPending.length}>
          {d.paperPending.map((o) => (
            <OrderLine key={o.id} code={o.code} type={o.productionType} title={o.title} customer={o.customerName} href={`/panel/orders/${o.code}?tab=procurement`} />
          ))}
        </Panel>
        <Panel icon={<Layers />} title="لیتوگرافی بیرون" count={d.litho.length}>
          {d.litho.map((l) => (
            <OrderLine
              key={l.order.id}
              code={l.order.code}
              type={l.order.productionType}
              title={l.supplierName ?? "—"}
              customer={label(LITHO_STATUS, l.status)}
              right={l.expectedAt ? <span className={cn("text-[12px]", new Date(l.expectedAt) < new Date() ? "font-bold text-danger" : "text-muted")}>تحویل <DateText value={l.expectedAt} /></span> : undefined}
              href={`/panel/orders/${l.order.code}?tab=procurement`}
            />
          ))}
        </Panel>

        <Panel icon={<Truck />} title="ارسال" count={d.readyToShip.length + d.inTransit.length}>
          {d.readyToShip.map((i) => (
            <OrderLine key={i.stepId} code={i.order.code} type={i.order.productionType} title={i.order.title} customer="آماده ارسال" href={`/panel/orders/${i.order.code}?tab=shipping`} />
          ))}
          {d.inTransit.map((s) => (
            <OrderLine key={s.order.id} code={s.order.code} type={s.order.productionType} title={s.order.title} customer={`${SHIPPING_METHOD[s.method]}${s.carrierName ? ` — ${s.carrierName}` : ""}`} right={<Badge tone="info">در مسیر</Badge>} href={`/panel/orders/${s.order.code}?tab=shipping`} />
          ))}
        </Panel>
        <Panel icon={<Wallet />} title="هشدار مالی" count={d.money.unpaidFinished.length + d.money.unpriced + d.money.paymentsToConfirm} className="lg:col-span-2">
          {(d.money.unpriced > 0 || d.money.paymentsToConfirm > 0) && (
            <li className="flex flex-wrap gap-2 px-4 py-2.5 text-[12.5px]">
              {d.money.unpriced > 0 && <Link href="/panel/accounting?filter=unpriced"><Badge tone="warning">{n(d.money.unpriced)} سفارش بدون قیمت</Badge></Link>}
              {d.money.paymentsToConfirm > 0 && <Link href="/panel/accounting?tab=payments"><Badge tone="warning">{n(d.money.paymentsToConfirm)} پرداخت منتظر تأیید</Badge></Link>}
            </li>
          )}
          {d.money.unpaidFinished.slice(0, 8).map((o) => (
            <OrderLine key={o.id} code={o.code} type={o.productionType} title={o.title} customer={o.customerName} right={<span className="text-[12.5px]">مانده <Money rial={o.total - o.paid} strong className="text-danger" /></span>} href={`/panel/orders/${o.code}?tab=finance`} />
          ))}
        </Panel>
        {d.overdue.length > 0 && (
          <Panel icon={<AlertTriangle />} title="گذشته از تاریخ درخواستی مشتری" count={d.overdue.length}>
            {d.overdue.map((o) => (
              <OrderLine key={o.id} code={o.code} type={o.productionType} title={o.title} customer={o.customerName} />
            ))}
          </Panel>
        )}
      </div>

      <section className="rounded-2xl border border-line bg-surface shadow-card">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-bold">آخرین اتفاق‌ها</h2>
        <ul className="divide-y divide-line">
          {d.recent.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
              <Link href={`/panel/orders/${e.code}`} className="hover:underline"><OrderCode code={e.code} /></Link>
              <span className="min-w-0 flex-1 truncate">{e.message}</span>
              <span className="text-[12px] text-muted">{e.actorLabel ?? "سیستم"} • <DateText value={e.createdAt} relative /></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ href, icon, label: l, value, sub, tone }: { href: string; icon: ReactNode; label: string; value: number; sub: string; tone: "warning" | "danger" | "neutral" }) {
  return (
    <Link href={href} className={cn("group rounded-2xl border bg-surface px-4 py-4 shadow-card transition-colors hover:border-line-strong", tone === "warning" ? "border-warning/40" : tone === "danger" ? "border-danger/30" : "border-line")}>
      <div className="flex items-center justify-between">
        <span className={cn("grid size-9 place-items-center rounded-xl [&_svg]:size-[18px]", tone === "warning" ? "bg-warning-soft text-warning" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>{icon}</span>
        <ChevronLeft className="size-4 text-subtle transition-transform group-hover:-translate-x-0.5" />
      </div>
      <p className="mt-3 text-[30px] font-bold leading-none tabular">{formatNumber(value)}</p>
      <p className="mt-1.5 text-[13.5px] font-bold">{l}</p>
      <p className="text-[12px] text-muted">{sub}</p>
    </Link>
  );
}

function Board({ title, href, active, queues }: { title: string; href: string; active: number; queues: StationQueue[] }) {
  const max = Math.max(4, ...queues.map((q) => q.waiting + q.working));
  return (
    <Link href={href} className="block rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[16px] font-bold">{title}</h2>
        <span className="text-[12.5px] text-muted">{formatNumber(active)} سفارش در تولید</span>
      </div>
      <ul className="space-y-1.5">
        {queues.map((q) => {
          const total = q.working + q.waiting;
          return (
            <li key={q.station.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-[12.5px]">
              <span className="truncate font-bold text-ink-2">{q.station.short}</span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span className="absolute inset-y-0 right-0 rounded-full bg-accent" style={{ width: `${(q.working / max) * 100}%` }} />
                <span className="absolute inset-y-0 rounded-full bg-ink/25" style={{ right: `${(q.working / max) * 100}%`, width: `${(q.waiting / max) * 100}%` }} />
              </span>
              <span className="w-24 text-start tabular text-muted">
                {total === 0 ? "خالی" : `${formatNumber(q.working)} کار • ${formatNumber(q.waiting)} صف`}
                {q.priority > 0 && <span className="text-danger"> 🔥</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex gap-4 text-[11.5px] text-muted">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-accent" /> در حال انجام</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ink/25" /> در صف</span>
      </p>
    </Link>
  );
}

function Panel({ id, icon, title, count, children, className }: { id?: string; icon: ReactNode; title: string; count: number; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-2xl border border-line bg-surface shadow-card", className)}>
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-[14.5px] font-bold">
        <span className="text-muted [&_svg]:size-4">{icon}</span>
        {title}
        <span className="ms-auto rounded-full bg-surface-2 px-2 text-[12px] tabular text-muted">{formatNumber(count)}</span>
      </h2>
      {count === 0 ? <p className="px-4 py-5 text-center text-[12.5px] text-muted">موردی نیست.</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

function OrderLine({ code, type, title, customer, right, priority, href }: { code: string; type: string; title: string; customer: string; right?: ReactNode; priority?: boolean; href?: string }) {
  return (
    <li className={cn(priority && "bg-danger-soft/40")}>
      <Link href={href ?? `/panel/orders/${code}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 hover:bg-surface-2/60">
        <OrderCode code={code} className="text-[13px]" />
        <TypeChip type={type} className="h-5 text-[11px]" />
        {priority && <PriorityFlag compact className="h-5" />}
        <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
        <span className="text-[12px] text-muted">{customer}</span>
        {right}
      </Link>
    </li>
  );
}
