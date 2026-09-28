import Link from "next/link";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Code, DateText } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterTabs, PageHeader } from "@/components/panel/page";
import { NewEmployeeButton, RoleEditorButton } from "@/components/panel/people-admin";
import { permissionGroups, workspaceOptions } from "@/components/panel/permission-groups";
import { formatNumber, formatPhone } from "@/lib/persian";
import { WORKSPACES } from "@/server/auth/permissions";
import { stepTypes } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { listEmployees, listRoles } from "@/server/modules/people/service";

export const metadata: Metadata = { title: "کارکنان و نقش‌ها" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ anyOf: ["employee.view", "role.manage"] });
  const perms = ctx.actor.permissions;
  const tab = sp.tab === "roles" ? "roles" : "people";
  const employees = await listEmployees(ctx);
  const roles = await listRoles(ctx);
  const steps = await ctx.db.select().from(stepTypes).orderBy(asc(stepTypes.sortOrder));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const stepOptions = steps.map((s) => ({ code: s.code, label: s.name }));
  return (
    <>
      <PageHeader
        title="کارکنان و نقش‌ها"
        description="هر کارمند می‌تواند چند نقش داشته باشد؛ مجوزها، فضاهای کاری و مراحل تولیدی از مجموع نقش‌ها به دست می‌آید."
        actions={tab === "people" ? perms.has("employee.manage") && <NewEmployeeButton roles={roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))} canAssignRoles={perms.has("role.manage")} /> : perms.has("role.manage") && <RoleEditorButton permissionGroups={permissionGroups()} workspaces={workspaceOptions()} stepTypes={stepOptions} />}
      />
      <FilterTabs active={tab} tabs={[{ key: "people", label: "کارکنان", href: "/panel/employees", count: employees.filter((e) => e.e.isActive).length }, { key: "roles", label: "نقش‌ها", href: "/panel/employees?tab=roles", count: roles.length }]} />
      <Card className="overflow-hidden">
        {tab === "people" ? (
          <Table>
            <THead><tr><TH>کارمند</TH><TH>کد</TH><TH>موبایل</TH><TH>نقش‌ها</TH><TH>آخرین ورود</TH></tr></THead>
            <TBody>
              {employees.map(({ e, fullName, phone, lastLoginAt, roleIds }) => (
                <TR key={e.id} className={e.isActive ? undefined : "opacity-55"}>
                  <TD><Link href={`/panel/employees/${e.id}`} className="font-bold hover:text-accent-ink">{fullName}</Link>{e.title && <span className="block text-[12px] text-muted">{e.title}</span>}</TD>
                  <TD><Code className="text-muted">{e.personnelCode}</Code></TD>
                  <TD><Code>{formatPhone(phone)}</Code></TD>
                  <TD><div className="flex flex-wrap gap-1">{roleIds.map((id) => <Badge key={id}>{roleName.get(id)}</Badge>)}{!e.isActive && <Badge tone="danger">غیرفعال</Badge>}</div></TD>
                  <TD className="text-muted"><DateText value={lastLoginAt} relative /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Table>
            <THead><tr><TH>نقش</TH><TH>فضاهای کاری</TH><TH className="text-end">مجوزها</TH><TH className="text-end">مراحل تولید</TH><TH className="text-end">اعضا</TH><TH /></tr></THead>
            <TBody>
              {roles.map((r) => (
                <TR key={r.id}>
                  <TD><span className="font-bold">{r.name}</span> <Code className="text-[11px] text-subtle">{r.code}</Code>{r.description && <span className="block max-w-md text-[12px] text-muted">{r.description}</span>}</TD>
                  <TD><div className="flex flex-wrap gap-1">{r.workspaces.map((w) => <Badge key={w} tone="info">{WORKSPACES[w as keyof typeof WORKSPACES]?.label ?? w}</Badge>)}</div></TD>
                  <TD className="text-end tabular">{formatNumber(r.permissions.length)}</TD>
                  <TD className="text-end tabular">{formatNumber(r.stepTypes.length)}</TD>
                  <TD className="text-end tabular">{formatNumber(r.members)}</TD>
                  <TD className="text-end">{perms.has("role.manage") && <RoleEditorButton role={{ id: r.id, code: r.code, name: r.name, description: r.description, permissions: r.permissions, workspaces: r.workspaces, stepTypes: r.stepTypes }} permissionGroups={permissionGroups()} workspaces={workspaceOptions()} stepTypes={stepOptions} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
