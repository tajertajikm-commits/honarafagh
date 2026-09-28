import Link from "next/link";
import type { Metadata } from "next";
import { AlertOctagon, AlertTriangle, ArrowLeft, Factory, Info, Plus, Timer, Truck, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText, EmptyState, OrderNo } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Status } from "@/components/ui/status";
import { BarList, ColumnChart } from "@/components/panel/charts";
import { PageHeader, Stat } from "@/components/panel/page";
import { cn } from "@/lib/cn";
import { MACHINE_STATUS, ORDER_STATUS, PRIORITY, SHIPMENT_STATUS } from "@/lib/labels";
import { formatDay, formatDayMonth, formatDuration, formatNumber, formatShortDate, formatTime, formatToman, formatWeekday, rialToToman } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { controlCenter } from "@/server/modules/dashboard/control";

export const metadata: Metadata = { title: "مرکز کنترل" };
export const dynamic = "force-dynamic";

const SEV = {
  critical: { icon: AlertOctagon, cls: "text-danger bg-danger-soft" },
  warning: { icon: AlertTriangle, cls: "text-warning bg-warning-soft" },
  info: { icon: Info, cls: "text-info bg-info-soft" },
};

export default async function ControlCenter() {
  const ctx = await requireStaffPage({ workspace: "control" });
  const d = await controlCenter(ctx);
  const k = d.kpis;
  const maxLoad = Math.max(480, ...d.machines.map((m) => m.queuedMinutes));

  return (
    <>
      <PageHeader
        title="مرکز کنترل"
        description={<>{formatWeekday(new Date())} · برنامه تولید {formatTime(d.scheduleAt)} به‌روز شد</>}
        actions={
          <>
            <Button asChild variant="secondary" size="sm"><Link href="/panel/production">تابلوی تولید</Link></Button>
            <Button asChild size="sm"><Link href="/panel/sales/new"><Plus /> ثبت سفارش</Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="سفارش‌های فعال" value={formatNumber(k.active)} sub={`${formatNumber(k.pendingReview)} در انتظار بررسی`} href="/panel/orders" />
        <Stat label="در حال تولید" value={formatNumber(k.inProduction)} sub={k.waitingMaterial ? `${formatNumber(k.waitingMaterial)} منتظر مواد` : "بدون کمبود مواد"} tone="accent" href="/panel/production" />
        <Stat label="آماده تحویل" value={formatNumber(k.ready)} tone="success" href="/panel/shipping" />
        <Stat label="تأخیر" value={formatNumber(k.late)} sub={`${formatNumber(k.projectedLate)} در خطر تأخیر`} tone={k.late ? "danger" : "neutral"} href="/panel/orders?late=1" />
        <Stat label="دریافتی امروز" value={formatToman(k.revenueToday, { unit: false })} sub="تومان" icon={<Wallet />} href="/panel/accounting" />
        <Stat label="مطالبات" value={formatToman(k.receivables, { unit: false })} sub="تومان مانده سفارش‌های باز" href="/panel/accounting" />
      </div>

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="نیازمند اقدام" description="مرتب‌شده بر اساس فوریت؛ هر مورد به محل رسیدگی لینک دارد." actions={<Badge tone={d.alerts.some((a) => a.severity === "critical") ? "danger" : "neutral"}>{formatNumber(d.alerts.length)}</Badge>} />
            <CardBody className="pt-0">
              {d.alerts.length === 0 ? (
                <EmptyState title="همه‌چیز روبه‌راه است" description="هیچ مورد فوری برای رسیدگی وجود ندارد." />
              ) : (
                <ul className="divide-y divide-line">
                  {d.alerts.slice(0, 12).map((a) => {
                    const S = SEV[a.severity];
                    return (
                      <li key={a.key}>
                        <Link href={a.href} className="group flex items-start gap-3 py-3">
                          <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", S.cls)}><S.icon className="size-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-bold">{a.title}</span>
                            <span className="block truncate text-[12.5px] text-muted">{a.detail}</span>
                          </span>
                          <ArrowLeft className="mt-2 size-4 text-subtle transition-transform group-hover:-translate-x-0.5" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="ماشین‌آلات" description="وضعیت لحظه‌ای و بار کاری صف‌شده" icon={<Factory />} actions={<Link href="/panel/machines" className="text-[12.5px] font-bold text-accent-ink">جزئیات</Link>} />
            <CardBody className="grid gap-3 pt-0 sm:grid-cols-2 2xl:grid-cols-3">
              {d.machines.map((m) => (
                <div key={m.id} className="rounded-xl border border-line p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold">{m.name}</p>
                      <p className="text-[11.5px] text-muted"><bdi dir="ltr">{m.code}</bdi></p>
                    </div>
                    {m.status !== "ACTIVE" ? <Status map={MACHINE_STATUS} value={m.status} /> : m.busy ? <Badge tone="accent" dot pulse>در حال کار</Badge> : m.current?.paused ? <Badge tone="warning" dot>متوقف موقت</Badge> : <Badge tone="success" dot>آزاد</Badge>}
                  </div>
                  <div className="mt-2.5 min-h-[36px] text-[12px]">
                    {m.current ? (
                      <Link href={`/panel/orders/${m.current.orderId}`} className="block hover:text-accent-ink">
                        <span className="font-bold">{m.current.name}</span> · سفارش {formatNumber(m.current.orderNumber)}
                        <span className="block text-muted">{m.current.operator ?? "—"}{m.current.startedAt && ` · از ${formatTime(m.current.startedAt)}`}</span>
                      </Link>
                    ) : m.maintenance ? (
                      <span className="text-warning">تعمیر: {m.maintenance.title} ({formatShortDate(m.maintenance.scheduledStart)})</span>
                    ) : (
                      <span className="text-muted">کاری در دست نیست</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-muted">
                      <span>صف: {formatNumber(m.queuedTasks)} کار</span>
                      <span className="tabular">{m.queuedMinutes ? formatDuration(m.queuedMinutes) : "—"}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.queuedMinutes / maxLoad) * 100)}%`, background: m.queuedMinutes > 960 ? "var(--color-danger)" : "var(--color-series)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="جریان تولید" description={d.bottleneck ? <>گلوگاه فعلی: <b className="text-ink">{d.bottleneck.name}</b> با {formatDuration(d.bottleneck.minutes)} کار در صف</> : "صف تولید خالی است"} icon={<Timer />} />
            <CardBody className="pt-0">
              <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                {d.steps.map((s) => (
                  <Link key={s.code} href={`/panel/production?step=${s.code}`} className={cn("min-w-[124px] rounded-xl border p-3 transition-colors hover:border-line-strong", d.bottleneck?.code === s.code ? "border-accent/50 bg-accent-soft/50" : "border-line")}>
                    <p className="truncate text-[12.5px] font-bold">{s.name}</p>
                    <p className="mt-1 text-[22px] font-bold leading-none tabular">{formatNumber(s.ready + s.active + s.blocked)}</p>
                    <p className="mt-1.5 text-[11px] text-muted">{formatNumber(s.active)} در حال انجام · {formatNumber(s.ready)} آماده</p>
                    {s.blocked > 0 && <p className="text-[11px] font-bold text-danger">{formatNumber(s.blocked)} مسدود</p>}
                  </Link>
                ))}
                {d.steps.length === 0 && <p className="py-4 text-[13px] text-muted">کاری در صف نیست.</p>}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="نزدیک به موعد تحویل" actions={<Link href="/panel/orders" className="text-[12.5px] font-bold text-accent-ink">همه</Link>} />
            <CardBody className="pt-0">
              <ul className="divide-y divide-line">
                {d.dueSoon.map((o) => {
                  const isLate = o.dueDate && new Date(o.dueDate) < new Date();
                  const risk = !isLate && o.projected && o.dueDate && new Date(o.projected) > new Date(o.dueDate);
                  return (
                    <li key={o.id}>
                      <Link href={`/panel/orders/${o.id}`} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[13.5px] font-bold"><OrderNo n={o.number} />{o.priority !== "NORMAL" && <Status map={PRIORITY} value={o.priority} />}</span>
                          <span className="block truncate text-[12px] text-muted">{o.customer}</span>
                        </span>
                        <span className="shrink-0 text-end text-[12px]">
                          <Status map={ORDER_STATUS} value={o.status} />
                          <span className={cn("mt-1 block", isLate ? "font-bold text-danger" : risk ? "font-bold text-warning" : "text-muted")}>
                            {o.dueDate ? <DateText value={o.dueDate} /> : "بدون موعد"}{risk && " · در خطر"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="دریافتی ۱۴ روز اخیر" description="هزار تومان" />
            <CardBody className="pt-0">
              <ColumnChart title="دریافتی روزانه" data={d.trend.map((t) => ({ label: formatDay(t.day + "T12:00:00Z"), value: Math.round(rialToToman(t.amount) / 1000), display: `${formatDayMonth(t.day + "T12:00:00Z")}: ${formatToman(t.amount)}` }))} height={150} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="ارسال‌های باز" icon={<Truck />} actions={<Link href="/panel/shipping" className="text-[12.5px] font-bold text-accent-ink">ارسال</Link>} />
            <CardBody className="pt-0">
              {d.shipments.length === 0 ? <p className="py-3 text-[13px] text-muted">مرسوله بازی نیست.</p> : (
                <ul className="space-y-2">
                  {d.shipments.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <Link href={`/panel/orders/${s.orderId}`} className="truncate hover:text-accent-ink">سفارش {formatNumber(s.number)} · {s.customer}</Link>
                      <Status map={SHIPMENT_STATUS} value={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="بار کاری کارکنان" icon={<Users />} />
            <CardBody className="pt-0">
              <BarList data={d.workload.map((w) => ({ label: w.name, value: w.minutes, display: formatDuration(w.minutes) || "—", hint: `${formatNumber(w.active)} در حال انجام · ${formatNumber(w.queued)} در صف` }))} empty="کاری به کسی سپرده نشده است." />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
