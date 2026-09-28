import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, Clock } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Status } from "@/components/ui/status";
import { FilterTabs, PageHeader } from "@/components/panel/page";
import { cn } from "@/lib/cn";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { formatDuration, formatNumber, toFaDigits } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { productionBoard } from "@/server/modules/production/queries";
import { computeSchedule } from "@/server/modules/scheduling/service";

export const metadata: Metadata = { title: "تولید" };

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ step?: string; view?: string }> }) {
  const { step, view = "active" } = await searchParams;
  const ctx = await requireStaffPage({ permission: "production.view" });
  const board = await productionBoard(ctx);
  const schedule = await computeSchedule(ctx);
  const projected = new Map([...schedule.tasks.values()].map((t) => [t.taskId, t]));
  const tasks = board.tasks.filter((t) => !t.task.gate && (view === "all" || t.task.status !== "PENDING") && (!step || t.task.stepTypeCode === step));
  const columns = board.stepTypes.filter((s) => s.category !== "GATE").map((s) => ({ ...s, tasks: tasks.filter((t) => t.task.stepTypeCode === s.code) })).filter((c) => c.tasks.length > 0 || c.code === step);
  const lateOrders = schedule.lateJobs.slice(0, 6);

  return (
    <>
      <PageHeader title="تابلوی تولید" description={`${formatNumber(tasks.length)} کار • برنامه‌ریزی ظرفیت با صف ماشین‌ها و تقویم کاری`} />
      <FilterTabs active={view} tabs={[{ key: "active", label: "آماده و در جریان", href: `/panel/production?view=active${step ? `&step=${step}` : ""}` }, { key: "all", label: "همه (شامل منتظر پیش‌نیاز)", href: `/panel/production?view=all${step ? `&step=${step}` : ""}` }]} />
      {lateOrders.length > 0 && (
        <Card className="mb-5 border-warning/30">
          <CardHeader title="در خطر تأخیر" description="بر اساس برنامه‌ریزی فعلی، این کارها بعد از موعد تحویل آماده می‌شوند." icon={<AlertTriangle />} />
          <CardBody className="flex flex-wrap gap-2 pt-0">
            {lateOrders.map((l) => {
              const orderId = schedule.jobOrder.get(l.jobId);
              const any = board.tasks.find((t) => t.task.jobId === l.jobId);
              return (
                <Link key={l.jobId} href={`/panel/orders/${orderId}`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] hover:border-warning">
                  <b>سفارش {toFaDigits(any?.orderNumber ?? 0)}</b> • {any?.itemTitle} • <span className="text-warning">{formatDuration(l.lateMinutes)} تأخیر</span>
                </Link>
              );
            })}
          </CardBody>
        </Card>
      )}
      <div className="scrollbar-thin -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
        {columns.map((col) => (
          <section key={col.code} className="w-[290px] shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-[13.5px] font-bold"><span className="size-2.5 rounded-full" style={{ background: col.color ?? "var(--color-subtle)" }} />{col.name}</h2>
              <span className="text-[12px] text-muted tabular">{formatNumber(col.tasks.length)} • {formatDuration(col.tasks.reduce((s, t) => s + Math.max(0, t.task.estimatedMinutes - t.task.actualMinutes), 0))}</span>
            </div>
            <div className="space-y-2">
              {col.tasks.map((t) => {
                const p = projected.get(t.task.id);
                const late = p && t.dueDate && p.end > t.dueDate;
                return (
                  <Link key={t.task.id} href={`/panel/orders/${t.task.orderId}`} className={cn("block rounded-xl border bg-surface p-3 shadow-soft transition-colors hover:border-line-strong", t.task.status === "IN_PROGRESS" ? "border-accent/40" : t.task.status === "BLOCKED" ? "border-danger/40" : "border-line")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-bold">سفارش {toFaDigits(t.orderNumber)}</span>
                      <Status map={TASK_STATUS} value={t.task.status} />
                    </div>
                    <p className="mt-1 truncate text-[12.5px] text-ink-2">{t.itemTitle} • {formatNumber(t.task.quantityPlanned)} {t.itemUnit}</p>
                    <p className="truncate text-[11.5px] text-muted">{t.customerName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                      {t.orderPriority !== "NORMAL" && <Status map={PRIORITY} value={t.orderPriority} />}
                      {t.task.attempt > 1 && <Badge tone="danger">دوباره‌کاری</Badge>}
                      <span>{t.assigneeName ?? "صف عمومی"}</span>
                      {t.machineCode && <span>• <bdi dir="ltr">{t.machineCode}</bdi></span>}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-1 text-muted"><Clock className="size-3.5" />{formatDuration(t.task.estimatedMinutes)}</span>
                      {p && t.task.status !== "PENDING" && <span className={late ? "font-bold text-danger" : "text-muted"}>پایان: <DateText value={p.end} withTime /></span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {columns.length === 0 && <p className="py-16 text-center text-muted">کاری در این وضعیت نیست.</p>}
      </div>
    </>
  );
}
