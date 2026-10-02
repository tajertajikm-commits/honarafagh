import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Code, DateText } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterTabs, PageHeader } from "@/components/panel/page";
import { EmployeeManage, NewEmployeeButton, RoleEditorButton } from "@/components/panel/people-admin";
import { PERMISSION_GROUPS } from "@/server/auth/permissions";
import { requireStaffPage } from "@/server/http/session";
import { listEmployees, listRoles } from "@/server/modules/people/service";
import { formatNumber, formatPhone } from "@/lib/persian";

export const metadata: Metadata = { title: "کارکنان و نقش‌ها" };

const groups = () => Object.values(PERMISSION_GROUPS).map((g) => ({ title: g.title, items: Object.entries(g.items).map(([code, label]) => ({ code, label })) }));

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "employee.manage" });
  const tab = sp.tab === "roles" ? "roles" : "people";
  const employees = await listEmployees(ctx);
  const roles = await listRoles(ctx);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const roleOptions = roles.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  return (
    <>
      <PageHeader
        title="کارکنان و نقش‌ها"
        description="هر کارمند می‌تواند چند نقش داشته باشد؛ منو و کارهایی که می‌بیند از مجوزهای نقش‌ها می‌آید."
        actions={tab === "people" ? <NewEmployeeButton roles={roleOptions} /> : <RoleEditorButton permissionGroups={groups()} />}
      />
      <FilterTabs active={tab} tabs={[{ key: "people", label: "کارکنان", href: "/panel/employees", count: employees.filter((e) => e.e.isActive).length }, { key: "roles", label: "نقش‌ها", href: "/panel/employees?tab=roles", count: roles.length }]} />
      <Card className="overflow-hidden">
        {tab === "people" ? (
          <Table>
            <THead><tr><TH>کارمند</TH><TH>کد</TH><TH>موبایل</TH><TH>نقش‌ها</TH><TH>آخرین ورود</TH><TH /></tr></THead>
            <TBody>
              {employees.map(({ e, fullName, phone, lastLoginAt, roleIds }) => (
                <TR key={e.id} className={e.isActive ? undefined : "opacity-55"}>
                  <TD><span className="font-bold">{fullName}</span>{e.title && <span className="block text-[12px] text-muted">{e.title}</span>}</TD>
                  <TD><Code className="text-muted">{e.personnelCode}</Code></TD>
                  <TD><Code>{formatPhone(phone)}</Code></TD>
                  <TD><div className="flex flex-wrap gap-1">{roleIds.map((id) => <Badge key={id}>{roleName.get(id)}</Badge>)}{!e.isActive && <Badge tone="danger">غیرفعال</Badge>}</div></TD>
                  <TD className="text-muted"><DateText value={lastLoginAt} relative /></TD>
                  <TD className="text-end"><EmployeeManage employee={{ id: e.id, fullName, title: e.title, isActive: e.isActive }} roles={roleOptions} current={roleIds} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Table>
            <THead><tr><TH>نقش</TH><TH className="text-end">مجوزها</TH><TH className="text-end">اعضا</TH><TH /></tr></THead>
            <TBody>
              {roles.map((r) => (
                <TR key={r.id}>
                  <TD><span className="font-bold">{r.name}</span> <Code className="text-[11px] text-subtle">{r.code}</Code>{r.description && <span className="block max-w-xl text-[12px] text-muted">{r.description}</span>}</TD>
                  <TD className="text-end tabular">{formatNumber(r.permissions.length)}</TD>
                  <TD className="text-end tabular">{formatNumber(r.members)}</TD>
                  <TD className="text-end"><RoleEditorButton role={{ id: r.id, code: r.code, name: r.name, description: r.description, permissions: r.permissions }} permissionGroups={groups()} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
