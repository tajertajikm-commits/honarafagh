import type { Metadata } from "next";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { Wrench } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Status } from "@/components/ui/status";
import { PageHeader } from "@/components/panel/page";
import { MachineActions } from "@/components/panel/machine-actions";
import { MACHINE_STATUS, METHOD, TASK_STATUS } from "@/lib/labels";
import { formatDuration, formatNumber, toFaDigits } from "@/lib/persian";
import { machineMaintenance, machineTypes, machines, orders, productionTasks } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { computeSchedule } from "@/server/modules/scheduling/service";

export const metadata: Metadata = { title: "ماشین‌آلات" };

export default async function MachinesPage() {
  const ctx = await requireStaffPage({ anyOf: ["machine.view", "machine.manage", "production.view"] });
  const ms = await ctx.db.select({ m: machines, typeName: machineTypes.name }).from(machines).innerJoin(machineTypes, eq(machineTypes.code, machines.typeCode)).orderBy(asc(machines.typeCode), asc(machines.code));
  const ids = ms.map((x) => x.m.id);
  const tasks = ids.length ? await ctx.db.select({ t: productionTasks, number: orders.number }).from(productionTasks).innerJoin(orders, eq(orders.id, productionTasks.orderId)).where(inArray(productionTasks.status, ["READY", "IN_PROGRESS", "PAUSED", "BLOCKED"])) : [];
  const maint = await ctx.db.select().from(machineMaintenance).orderBy(desc(machineMaintenance.scheduledStart)).limit(50);
  const schedule = await computeSchedule(ctx);
  const canManage = ctx.actor.permissions.has("machine.manage");
  return (
    <>
      <PageHeader title="ماشین‌آلات" description={`${formatNumber(ms.length)} ماشین • بار کاری بر اساس برنامه‌ریزی ظرفیت`} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {ms.map(({ m, typeName }) => {
          const running = tasks.find((x) => x.t.machineId === m.id && x.t.status === "IN_PROGRESS");
          const assigned = tasks.filter((x) => x.t.machineId === m.id && x.t.status !== "IN_PROGRESS");
          const typeQueue = tasks.filter((x) => !x.t.machineId && x.t.machineTypeCode === m.typeCode && x.t.status === "READY");
          const load = schedule.machineLoad.get(m.id);
          const mt = maint.filter((x) => x.machineId === m.id && ["SCHEDULED", "IN_PROGRESS"].includes(x.status));
          return (
            <Card key={m.id}>
              <CardHeader
                title={m.name}
                description={<>{typeName} • <bdi dir="ltr">{m.code}</bdi>{m.methodCode && ` • ${METHOD[m.methodCode]}`} • ظرفیت {formatNumber(m.capacityPerHour)}/ساعت</>}
                actions={<div className="flex items-center gap-1.5">{running ? <Badge tone="accent" dot pulse>در حال کار</Badge> : <Status map={MACHINE_STATUS} value={m.status} />}{canManage && <MachineActions machine={{ id: m.id, name: m.name, status: m.status }} maintenance={mt.map((x) => ({ id: x.id, title: x.title, status: x.status }))} />}</div>}
              />
              <CardBody className="space-y-2 pt-0 text-[12.5px]">
                {running ? <p className="rounded-lg bg-accent-soft/60 px-3 py-2"><b>{running.t.name}</b> • سفارش {toFaDigits(running.number)}</p> : <p className="text-muted">در حال حاضر کاری روی این ماشین نیست.</p>}
                <div className="flex justify-between"><span className="text-muted">کارهای تخصیص‌یافته</span><span>{formatNumber(assigned.length)}</span></div>
                <div className="flex justify-between"><span className="text-muted">صف عمومی این نوع ماشین</span><span>{formatNumber(typeQueue.length)}</span></div>
                <div className="flex justify-between"><span className="text-muted">بار برنامه‌ریزی‌شده</span><span className="tabular">{load?.queuedMinutes ? formatDuration(load.queuedMinutes) : "—"}</span></div>
                {load?.busyUntil && <div className="flex justify-between"><span className="text-muted">مشغول تا</span><DateText value={load.busyUntil} withTime /></div>}
                {assigned.slice(0, 3).map((x) => <p key={x.t.id} className="flex justify-between text-muted"><span>{x.t.name} • سفارش {toFaDigits(x.number)}</span><Status map={TASK_STATUS} value={x.t.status} /></p>)}
                {mt.map((x) => <p key={x.id} className="flex items-center gap-1.5 text-warning"><Wrench className="size-3.5" /> {x.title} • <DateText value={x.scheduledStart} withTime /></p>)}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardHeader title="سابقه تعمیرات" />
        <CardBody className="pt-0">
          <ul className="divide-y divide-line text-[13px]">
            {maint.map((x) => (
              <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span><b>{ms.find((m) => m.m.id === x.machineId)?.m.name}</b> • {x.title} <span className="text-muted">({({ PREVENTIVE: "پیشگیرانه", REPAIR: "تعمیر", INSPECTION: "بازرسی" } as Record<string, string>)[x.kind]})</span></span>
                <span className="text-muted"><DateText value={x.scheduledStart} withTime /> • {({ SCHEDULED: "برنامه‌ریزی شده", IN_PROGRESS: "در حال انجام", COMPLETED: "انجام شد", CANCELLED: "لغو" } as Record<string, string>)[x.status]}</span>
              </li>
            ))}
            {maint.length === 0 && <li className="py-4 text-muted">سابقه‌ای ثبت نشده است.</li>}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
