"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "./actions";

export interface RoleOption { id: string; code: string; name: string }
export interface PermissionGroup { title: string; items: { code: string; label: string }[] }

function CheckGrid({ items, value, onChange, columns = 2 }: { items: { code: string; label: string; hint?: string }[]; value: string[]; onChange: (v: string[]) => void; columns?: 2 | 3 }) {
  return (
    <div className={cn("grid gap-1.5", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {items.map((i) => {
        const on = value.includes(i.code);
        return (
          <label key={i.code} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-[12.5px] transition-colors", on ? "border-ink/30 bg-surface-2" : "border-line hover:border-line-strong")}>
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" checked={on} onChange={(e) => onChange(e.target.checked ? [...value, i.code] : value.filter((x) => x !== i.code))} />
            <span>{i.label}{i.hint && <bdi dir="ltr" className="block text-[10.5px] text-subtle">{i.hint}</bdi>}</span>
          </label>
        );
      })}
    </div>
  );
}

export function NewEmployeeButton({ roles, canAssignRoles }: { roles: RoleOption[]; canAssignRoles: boolean }) {
  const router = useRouter();
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const blank = { phone: "", fullName: "", personnelCode: "", title: "", hourlyCost: "", password: "", roleIds: [] as string[] };
  const [f, setF] = useState(blank);
  return (
    <>
      <Button size="sm" onClick={() => { setF(blank); setOpen(true); }}><Plus /> کارمند جدید</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          wide
          title="کارمند جدید"
          description="کارمند با شماره موبایل و رمز عبور وارد پنل می‌شود. فضای کاری و مجوزها از نقش‌ها می‌آیند."
          footer={<Button loading={pending} disabled={f.fullName.trim().length < 2 || f.personnelCode.trim().length < 1 || f.password.length < 8 || toEnDigits(f.phone).replace(/\D/g, "").length < 10} onClick={() => run(() => api<{ id: string }>("employees", { body: { phone: f.phone, fullName: f.fullName, personnelCode: toEnDigits(f.personnelCode), title: f.title || null, hourlyCost: Number(toEnDigits(f.hourlyCost) || 0) * 10, password: f.password, roleIds: canAssignRoles ? f.roleIds : [] } }), "کارمند ثبت شد.", (r) => router.push(`/panel/employees/${(r as { id: string }).id}`)).then((ok) => ok && setOpen(false))}>ثبت</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="نام و نام خانوادگی"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
            <Field label="موبایل"><Input ltr inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="کد پرسنلی"><Input ltr value={f.personnelCode} onChange={(e) => setF({ ...f, personnelCode: e.target.value })} /></Field>
            <Field label="سمت"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="هزینه ساعتی (تومان)" hint="برای بهای تمام‌شده دستمزد"><Input ltr inputMode="numeric" value={f.hourlyCost} onChange={(e) => setF({ ...f, hourlyCost: toEnDigits(e.target.value).replace(/\D/g, "") })} /></Field>
            <Field label="رمز عبور اولیه" hint="حداقل ۸ کاراکتر"><Input ltr type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          </div>
          {canAssignRoles && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-bold text-ink-2">نقش‌ها</p>
              <CheckGrid columns={3} items={roles.map((r) => ({ code: r.id, label: r.name }))} value={f.roleIds} onChange={(roleIds) => setF({ ...f, roleIds })} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EmployeeRolesEditor({ employeeId, roles, current }: { employeeId: string; roles: RoleOption[]; current: string[] }) {
  const { run, pending } = useApiAction();
  const [value, setValue] = useState(current);
  const dirty = value.length !== current.length || value.some((v) => !current.includes(v));
  return (
    <div>
      <CheckGrid items={roles.map((r) => ({ code: r.id, label: r.name }))} value={value} onChange={setValue} />
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={!dirty} loading={pending} onClick={() => run(() => api(`employees/${employeeId}/roles`, { method: "PUT", body: { roleIds: value } }), "نقش‌ها به‌روز شد. تغییر از درخواست بعدی کاربر اعمال می‌شود.")}>ذخیره نقش‌ها</Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setValue(current)}>انصراف</Button>}
      </div>
    </div>
  );
}

export function EmployeeProfileActions({ employee }: { employee: { id: string; fullName: string; title: string | null; hourlyCost: number; isActive: boolean } }) {
  const { run, pending } = useApiAction();
  const [mode, setMode] = useState<null | "edit" | "password">(null);
  const [f, setF] = useState({ fullName: employee.fullName, title: employee.title ?? "", hourlyCost: String(Math.round(employee.hourlyCost / 10)) });
  const [pw, setPw] = useState("");
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => { setF({ fullName: employee.fullName, title: employee.title ?? "", hourlyCost: String(Math.round(employee.hourlyCost / 10)) }); setMode("edit"); }}>ویرایش</Button>
      <Button size="sm" variant="secondary" onClick={() => { setPw(""); setMode("password"); }}>تعیین رمز جدید</Button>
      <Button size="sm" variant={employee.isActive ? "danger-ghost" : "secondary"} loading={pending} onClick={() => { if (employee.isActive && !window.confirm("حساب غیرفعال و همه نشست‌های کاربر بسته شود؟")) return; void run(() => api(`employees/${employee.id}`, { method: "PATCH", body: { isActive: !employee.isActive } }), employee.isActive ? "حساب غیرفعال شد." : "حساب فعال شد."); }}>{employee.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}</Button>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        {mode === "edit" && (
          <DialogContent title="ویرایش کارمند" footer={<Button loading={pending} disabled={f.fullName.trim().length < 2} onClick={async () => { if (await run(() => api(`employees/${employee.id}`, { method: "PATCH", body: { fullName: f.fullName, title: f.title || null, hourlyCost: Number(toEnDigits(f.hourlyCost) || 0) * 10 } }), "ذخیره شد.")) setMode(null); }}>ذخیره</Button>}>
            <div className="grid gap-4">
              <Field label="نام و نام خانوادگی"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
              <Field label="سمت"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
              <Field label="هزینه ساعتی (تومان)"><Input ltr inputMode="numeric" value={f.hourlyCost} onChange={(e) => setF({ ...f, hourlyCost: toEnDigits(e.target.value).replace(/\D/g, "") })} /></Field>
            </div>
          </DialogContent>
        )}
        {mode === "password" && (
          <DialogContent title="تعیین رمز جدید" description="همه نشست‌های فعال کاربر بسته می‌شود." footer={<Button loading={pending} disabled={pw.length < 8} onClick={async () => { if (await run(() => api(`employees/${employee.id}/password`, { body: { password: pw } }), "رمز جدید ثبت شد.")) setMode(null); }}>ثبت</Button>}>
            <Field label="رمز جدید" hint="حداقل ۸ کاراکتر"><Input ltr type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export interface RoleValue { id?: string; code: string; name: string; description: string | null; permissions: string[]; workspaces: string[]; stepTypes: string[] }

/** Role editor: action permissions, visible workspaces, and production step types the role may execute. */
export function RoleEditorButton({ role, permissionGroups, workspaces, stepTypes }: { role?: RoleValue; permissionGroups: PermissionGroup[]; workspaces: { code: string; label: string }[]; stepTypes: { code: string; label: string }[] }) {
  const { run, pending } = useApiAction();
  const blank: RoleValue = { code: "", name: "", description: "", permissions: [], workspaces: [], stepTypes: [] };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<RoleValue>(role ?? blank);
  return (
    <>
      <Button size={role ? "xs" : "sm"} variant={role ? "ghost" : "primary"} onClick={() => { setF(role ?? blank); setOpen(true); }}>{role ? "ویرایش" : <><Plus /> نقش جدید</>}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          wide
          title={role ? `نقش ${role.name}` : "نقش جدید"}
          description="مجوزها در سرور بررسی می‌شوند؛ فضای کاری فقط تعیین می‌کند کدام صفحه‌ها در منو دیده شوند."
          footer={<Button loading={pending} disabled={f.name.trim().length < 2 || !/^[A-Z][A-Z0-9_]{1,47}$/.test(f.code)} onClick={async () => { if (await run(() => api("roles", { body: { ...f, description: f.description || null } }), "نقش ذخیره شد.")) setOpen(false); }}>ذخیره</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نام نقش"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="کد (لاتین)" hint="مثلاً BINDERY_LEAD"><Input ltr value={f.code} disabled={!!role} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} /></Field>
            <Field label="توضیح" className="sm:col-span-2"><Textarea className="min-h-[60px]" value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          </div>
          <h4 className="mb-2 mt-5 text-[14px] font-bold">فضاهای کاری</h4>
          <CheckGrid columns={3} items={workspaces} value={f.workspaces} onChange={(v) => setF({ ...f, workspaces: v })} />
          <h4 className="mb-2 mt-5 text-[14px] font-bold">مراحل تولیدی قابل انجام</h4>
          <p className="mb-2 text-[12px] text-muted">کارهای این مراحل در «کارهای من» اعضای نقش ظاهر می‌شود.</p>
          <CheckGrid columns={3} items={stepTypes} value={f.stepTypes} onChange={(v) => setF({ ...f, stepTypes: v })} />
          <h4 className="mb-2 mt-5 text-[14px] font-bold">مجوزها</h4>
          <div className="space-y-4">
            {permissionGroups.map((g) => (
              <div key={g.title}>
                <p className="mb-1.5 text-[12.5px] font-bold text-muted">{g.title}</p>
                <CheckGrid items={g.items.map((i) => ({ ...i, hint: i.code }))} value={f.permissions} onChange={(v) => setF({ ...f, permissions: v })} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
