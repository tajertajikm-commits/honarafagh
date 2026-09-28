import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { KV, PageHeader, Stat } from "@/components/panel/page";
import { EmployeeProfileActions, EmployeeRolesEditor } from "@/components/panel/people-admin";
import { TASK_STATUS } from "@/lib/labels";
import { formatDuration, formatNumber, formatPhone } from "@/lib/persian";
import { WORKSPACES } from "@/server/auth/permissions";
import { auditLogs, employees, orders, productionTasks, taskTimeLogs, users } from "@/server/db/schema";
import { daysAgo } from "@/lib/time";
import { requireStaffPage } from "@/server/http/session";
import { listRoles } from "@/server/modules/people/service";

export const metadata: Metadata = { title: "پرونده کارمند" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStaffPage({ anyOf: ["employee.view", "role.manage"] });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await ctx.db.select({ e: employees, u: users }).from(employees).innerJoin(users, eq(users.id, employees.userId)).where(eq(employees.id, id));
  if (!row) notFound();
  const perms = ctx.actor.permissions;
  const roles = await listRoles(ctx);
  const links = await ctx.db.execute<{ role_id: string }>(sql`select role_id from employee_roles where employee_id = ${id}`);
  const roleIds = links.rows.map((r) => r.role_id);
  const assigned = roles.filter((r) => roleIds.includes(r.id));
  const effectivePerms = new Set(assigned.flatMap((r) => r.permissions));
  const effectiveWs = new Set(assigned.flatMap((r) => r.workspaces));
  const since = daysAgo(30);
  const [time] = await ctx.db
    .select({ minutes: sql<number>`coalesce(sum(extract(epoch from (coalesce(${taskTimeLogs.endedAt}, now()) - ${taskTimeLogs.startedAt})) / 60), 0)::float` })
    .from(taskTimeLogs)
    .where(and(eq(taskTimeLogs.employeeId, id), gte(taskTimeLogs.startedAt, since)));
  const recent = await ctx.db
    .select({ t: productionTasks, number: orders.number })
    .from(productionTasks)
    .innerJoin(orders, eq(orders.id, productionTasks.orderId))
    .where(and(eq(productionTasks.assigneeId, id), isNotNull(productionTasks.startedAt)))
    .orderBy(desc(productionTasks.updatedAt))
    .limit(12);
  const completed30 = recent.filter((r) => r.t.status === "COMPLETED" && r.t.completedAt && r.t.completedAt > since).length;
  const activity = perms.has("audit.view") ? await ctx.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, row.u.id)).orderBy(desc(auditLogs.createdAt)).limit(15) : [];
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/employees", label: "کارکنان" }]}
        title={<>{row.u.fullName}{!row.e.isActive && <Badge tone="danger" className="ms-2 align-middle">غیرفعال</Badge>}</>}
        description={<>{row.e.title ?? "—"} • کد <Code>{row.e.personnelCode}</Code> • <Code>{formatPhone(row.u.phone)}</Code></>}
        actions={perms.has("employee.manage") && <EmployeeProfileActions employee={{ id: row.e.id, fullName: row.u.fullName, title: row.e.title, hourlyCost: row.e.hourlyCost, isActive: row.e.isActive }} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="زمان کار ثبت‌شده (۳۰ روز)" value={formatDuration(time?.minutes ?? 0)} />
        <Stat label="مراحل تکمیل‌شده اخیر" value={formatNumber(completed30)} />
        <Stat label="هزینه ساعتی" value={<Money rial={row.e.hourlyCost} />} />
        <Stat label="آخرین ورود" value={<DateText value={row.u.lastLoginAt} relative className="text-[18px]" />} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="نقش‌ها" description={perms.has("role.manage") ? "تغییر نقش‌ها فوراً روی دسترسی کاربر اعمال می‌شود." : undefined} />
          <CardBody className="pt-0">
            {perms.has("role.manage") ? <EmployeeRolesEditor employeeId={row.e.id} roles={roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))} current={roleIds} /> : <div className="flex flex-wrap gap-1.5">{assigned.map((r) => <Badge key={r.id}>{r.name}</Badge>)}</div>}
            <div className="mt-5 space-y-2 text-[12.5px]">
              <KV label="فضاهای کاری">{[...effectiveWs].map((w) => WORKSPACES[w as keyof typeof WORKSPACES]?.label ?? w).join("، ") || "—"}</KV>
              <KV label="تعداد مجوزها">{formatNumber(effectivePerms.size)}</KV>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="کارهای اخیر تولید" />
          <CardBody className="pt-0">
            {recent.length === 0 ? <p className="text-[13px] text-muted">کاری ثبت نشده است.</p> : (
              <ul className="divide-y divide-line text-[13px]">
                {recent.map(({ t, number }) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <span><Link href={`/panel/orders/${t.orderId}`} className="hover:text-accent-ink"><OrderNo n={number} /></Link> • {t.name}</span>
                    <span className="flex items-center gap-2 text-muted"><DateText value={t.completedAt ?? t.startedAt} relative /><Status map={TASK_STATUS} value={t.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        {activity.length > 0 && (
          <Card className="xl:col-span-2">
            <CardHeader title="فعالیت‌های ثبت‌شده در ممیزی" actions={<Link href={`/panel/audit?actor=${row.u.id}`} className="text-[13px] font-bold text-accent-ink">همه</Link>} />
            <CardBody className="pt-0">
              <ul className="divide-y divide-line text-[12.5px]">
                {activity.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2"><Code>{a.action}</Code><span className="text-muted">{String(a.context?.reason ?? "")}</span><DateText value={a.createdAt} withTime className="text-muted" /></li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
