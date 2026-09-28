import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { addresses, customers, employeeRoles, employees, orders, rolePermissions, roles, users } from "@/server/db/schema";
import { type Ctx, assertCan, assertCanAny, inTx, requireCustomer } from "@/server/core/context";
import { conflict, invalidState, isUniqueViolation, notFound, validation } from "@/server/core/errors";
import { hashPassword } from "@/server/auth/password";
import { ALL_WORKSPACES, isPermission } from "@/server/auth/permissions";
import { revokeAllSessions } from "@/server/auth/sessions";
import { audit } from "@/server/modules/audit/audit";
import { normalizeFa, normalizePhone, toEnDigits } from "@/lib/persian";

// ── Employees ───────────────────────────────────────────────────────────────

export async function createEmployee(ctx: Ctx, input: { phone: string; fullName: string; personnelCode: string; title?: string | null; hourlyCost?: number; roleIds: string[]; password: string }) {
  assertCan(ctx, "employee.manage");
  if (input.roleIds.length) assertCan(ctx, "role.manage");
  const phone = normalizePhone(input.phone);
  if (!phone) throw validation("شماره موبایل معتبر نیست.");
  if (input.password.length < 8) throw validation("رمز عبور باید حداقل ۸ کاراکتر باشد.");
  return inTx(ctx, async (tx) => {
    try {
      const [user] = await tx.db.insert(users).values({ phone, fullName: input.fullName, kind: "EMPLOYEE", passwordHash: await hashPassword(input.password) }).returning();
      const [emp] = await tx.db.insert(employees).values({ userId: user!.id, personnelCode: input.personnelCode, title: input.title ?? null, hourlyCost: input.hourlyCost ?? 0 }).returning();
      if (input.roleIds.length) await tx.db.insert(employeeRoles).values(input.roleIds.map((roleId) => ({ employeeId: emp!.id, roleId })));
      await audit(tx, { action: "employee.create", entityType: "employee", entityId: emp!.id, after: { phone, fullName: input.fullName, roleIds: input.roleIds } });
      return emp!;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("این شماره موبایل یا کد پرسنلی قبلاً ثبت شده است.");
      throw err;
    }
  });
}

export async function updateEmployee(ctx: Ctx, employeeId: string, input: { fullName?: string; title?: string | null; hourlyCost?: number; isActive?: boolean }) {
  assertCan(ctx, "employee.manage");
  return inTx(ctx, async (tx) => {
    const [emp] = await tx.db.select().from(employees).where(eq(employees.id, employeeId)).for("update");
    if (!emp) throw notFound("کارمند");
    if (input.isActive === false && tx.actor.kind === "staff" && tx.actor.employeeId === employeeId) throw invalidState("نمی‌توانید حساب خودتان را غیرفعال کنید.");
    await tx.db.update(employees).set({ title: input.title ?? emp.title, hourlyCost: input.hourlyCost ?? emp.hourlyCost, isActive: input.isActive ?? emp.isActive }).where(eq(employees.id, employeeId));
    if (input.fullName) await tx.db.update(users).set({ fullName: input.fullName }).where(eq(users.id, emp.userId));
    if (input.isActive === false) {
      await tx.db.update(users).set({ isActive: false }).where(eq(users.id, emp.userId));
      await revokeAllSessions(tx.db, emp.userId);
    } else if (input.isActive === true) await tx.db.update(users).set({ isActive: true }).where(eq(users.id, emp.userId));
    await audit(tx, { action: "employee.update", entityType: "employee", entityId: employeeId, before: emp, after: input });
  });
}

export async function setEmployeeRoles(ctx: Ctx, employeeId: string, roleIds: string[]) {
  assertCan(ctx, "role.manage");
  return inTx(ctx, async (tx) => {
    const before = await tx.db.select({ roleId: employeeRoles.roleId }).from(employeeRoles).where(eq(employeeRoles.employeeId, employeeId));
    // Never leave the platform without a manager.
    const [managerRole] = await tx.db.select().from(roles).where(eq(roles.code, "MANAGER"));
    if (managerRole && before.some((b) => b.roleId === managerRole.id) && !roleIds.includes(managerRole.id)) {
      const others = await tx.db
        .select({ id: employeeRoles.employeeId })
        .from(employeeRoles)
        .innerJoin(employees, eq(employees.id, employeeRoles.employeeId))
        .where(and(eq(employeeRoles.roleId, managerRole.id), ne(employeeRoles.employeeId, employeeId), eq(employees.isActive, true)));
      if (others.length === 0) throw invalidState("حداقل یک مدیر فعال باید باقی بماند.");
    }
    await tx.db.delete(employeeRoles).where(eq(employeeRoles.employeeId, employeeId));
    if (roleIds.length) await tx.db.insert(employeeRoles).values(roleIds.map((roleId) => ({ employeeId, roleId })));
    await audit(tx, { action: "employee.roles", entityType: "employee", entityId: employeeId, before: before.map((b) => b.roleId), after: roleIds });
  });
}

export async function resetEmployeePassword(ctx: Ctx, employeeId: string, password: string) {
  assertCan(ctx, "employee.manage");
  if (password.length < 8) throw validation("رمز عبور باید حداقل ۸ کاراکتر باشد.");
  return inTx(ctx, async (tx) => {
    const [emp] = await tx.db.select().from(employees).where(eq(employees.id, employeeId));
    if (!emp) throw notFound("کارمند");
    await tx.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, emp.userId));
    await revokeAllSessions(tx.db, emp.userId);
    await audit(tx, { action: "employee.password_reset", entityType: "employee", entityId: employeeId });
  });
}

// ── Roles (permission changes are audited) ──────────────────────────────────

export async function upsertRole(ctx: Ctx, input: { id?: string; code: string; name: string; description?: string | null; permissions: string[]; workspaces: string[]; stepTypes: string[] }) {
  assertCan(ctx, "role.manage");
  const bad = input.permissions.filter((p) => !isPermission(p));
  if (bad.length) throw validation(`مجوز ناشناخته: ${bad.join("، ")}`);
  const badWs = input.workspaces.filter((w) => !(ALL_WORKSPACES as string[]).includes(w));
  if (badWs.length) throw validation(`فضای کاری ناشناخته: ${badWs.join("، ")}`);
  if (!/^[A-Z][A-Z0-9_]{1,47}$/.test(input.code)) throw validation("کد نقش باید با حروف بزرگ لاتین باشد.");
  return inTx(ctx, async (tx) => {
    let roleId = input.id;
    let before: unknown = null;
    if (roleId) {
      const [r] = await tx.db.select().from(roles).where(eq(roles.id, roleId)).for("update");
      if (!r) throw notFound("نقش");
      if (r.code === "MANAGER" && !input.permissions.includes("role.manage")) throw invalidState("نقش مدیر نمی‌تواند مجوز مدیریت نقش‌ها را از دست بدهد.");
      const perms = await tx.db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      before = { ...r, permissions: perms.map((x) => x.p) };
      await tx.db.update(roles).set({ name: input.name, description: input.description ?? null, workspaces: input.workspaces, stepTypes: input.stepTypes }).where(eq(roles.id, roleId));
      await tx.db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    } else {
      try {
        const [r] = await tx.db.insert(roles).values({ code: input.code, name: input.name, description: input.description ?? null, workspaces: input.workspaces, stepTypes: input.stepTypes }).returning();
        roleId = r!.id;
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict("نقشی با این کد وجود دارد.");
        throw err;
      }
    }
    if (input.permissions.length) await tx.db.insert(rolePermissions).values(input.permissions.map((permission) => ({ roleId: roleId!, permission })));
    await audit(tx, { action: input.id ? "role.update" : "role.create", entityType: "role", entityId: roleId!, before, after: input });
    return roleId!;
  });
}

// ── Customers ───────────────────────────────────────────────────────────────

export async function createCustomer(ctx: Ctx, input: { phone: string; fullName: string; type?: "INDIVIDUAL" | "COMPANY"; companyName?: string | null; nationalId?: string | null; economicCode?: string | null; email?: string | null; notes?: string | null }) {
  assertCan(ctx, "customer.manage");
  const phone = normalizePhone(input.phone);
  if (!phone) throw validation("شماره موبایل معتبر نیست.");
  try {
    const [row] = await ctx.db.insert(customers).values({ ...input, phone }).returning();
    await audit(ctx, { action: "customer.create", entityType: "customer", entityId: row!.id, after: row });
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("مشتری با این شماره قبلاً ثبت شده است.");
    throw err;
  }
}

export async function updateCustomer(ctx: Ctx, customerId: string, input: { fullName?: string; type?: "INDIVIDUAL" | "COMPANY"; companyName?: string | null; nationalId?: string | null; economicCode?: string | null; email?: string | null; notes?: string | null; discountPct?: number; creditLimit?: number }) {
  if (ctx.actor.kind === "customer") {
    if (ctx.actor.customerId !== customerId) throw notFound("مشتری");
    if (input.discountPct !== undefined || input.creditLimit !== undefined || input.notes !== undefined) throw validation("این فیلدها قابل ویرایش نیست.");
  } else {
    assertCan(ctx, "customer.manage");
    if (input.discountPct !== undefined || input.creditLimit !== undefined) assertCan(ctx, "order.price.override");
  }
  if (input.discountPct !== undefined && (input.discountPct < 0 || input.discountPct > 100)) throw validation("درصد تخفیف نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const [before] = await tx.db.select().from(customers).where(eq(customers.id, customerId)).for("update");
    if (!before) throw notFound("مشتری");
    const [row] = await tx.db.update(customers).set(input).where(eq(customers.id, customerId)).returning();
    if (input.fullName && before.userId) await tx.db.update(users).set({ fullName: input.fullName }).where(eq(users.id, before.userId));
    await audit(tx, { action: "customer.update", entityType: "customer", entityId: customerId, before, after: input });
    return row!;
  });
}

export async function saveAddress(ctx: Ctx, input: { id?: string; title: string; province: string; city: string; line: string; postalCode?: string | null; recipientName: string; recipientPhone: string; isDefault?: boolean }) {
  const actor = requireCustomer(ctx);
  const phone = normalizePhone(input.recipientPhone);
  if (!phone) throw validation("شماره تحویل‌گیرنده معتبر نیست.");
  if (input.postalCode && !/^\d{10}$/.test(input.postalCode)) throw validation("کد پستی باید ۱۰ رقم باشد.");
  return inTx(ctx, async (tx) => {
    if (input.isDefault) await tx.db.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, actor.customerId));
    const values = { ...input, recipientPhone: phone, customerId: actor.customerId, postalCode: input.postalCode ?? null, isDefault: !!input.isDefault };
    if (input.id) {
      const [row] = await tx.db.update(addresses).set(values).where(and(eq(addresses.id, input.id), eq(addresses.customerId, actor.customerId))).returning();
      if (!row) throw notFound("آدرس");
      return row;
    }
    const [row] = await tx.db.insert(addresses).values(values).returning();
    return row!;
  });
}

export async function deleteAddress(ctx: Ctx, id: string) {
  const actor = requireCustomer(ctx);
  await ctx.db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.customerId, actor.customerId)));
}

export async function rolesByIds(ctx: Ctx, ids: string[]) {
  return ids.length ? ctx.db.select().from(roles).where(inArray(roles.id, ids)) : [];
}

// ── Customer directory ──────────────────────────────────────────────────────

/** Customers with order stats; searchable by name, company or phone. */
export async function listCustomers(ctx: Ctx, f: { q?: string; page?: number; pageSize?: number } = {}) {
  assertCanAny(ctx, "customer.view", "order.create", "quote.manage");
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const page = Math.max(1, f.page ?? 1);
  const conds = [];
  if (f.q?.trim()) {
    const q = normalizeFa(f.q);
    const digits = toEnDigits(q).replace(/\D/g, "");
    conds.push(or(ilike(customers.fullName, `%${q}%`), ilike(customers.companyName, `%${q}%`), digits.length >= 3 ? ilike(customers.phone, `%${digits}%`) : undefined));
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await ctx.db
    .select({
      c: customers,
      orderCount: sql<number>`(select count(*) from orders o where o.customer_id = ${customers.id} and o.status <> 'CANCELLED')::int`,
      revenue: sql<number>`coalesce((select sum(o.total) from orders o where o.customer_id = ${customers.id} and o.status <> 'CANCELLED'), 0)::float`,
      balance: sql<number>`coalesce((select sum(o.total - (o.paid_amount - o.refunded_amount)) from orders o where o.customer_id = ${customers.id} and o.status not in ('CANCELLED','PENDING_REVIEW')), 0)::float`,
      lastOrderAt: sql<Date | null>`(select max(o.placed_at) from orders o where o.customer_id = ${customers.id})`,
    })
    .from(customers)
    .where(where)
    .orderBy(desc(sql`coalesce((select max(o.placed_at) from orders o where o.customer_id = ${customers.id}), ${customers.createdAt})`))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = (await ctx.db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where)) as [{ total: number }];
  return { rows, total, page, pageSize };
}

export async function customerDetail(ctx: Ctx, id: string) {
  assertCan(ctx, "customer.view");
  const [c] = await ctx.db.select().from(customers).where(eq(customers.id, id));
  if (!c) throw notFound("مشتری");
  const addrs = await ctx.db.select().from(addresses).where(eq(addresses.customerId, id));
  const recent = await ctx.db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.placedAt)).limit(50);
  return { customer: c, addresses: addrs, orders: recent };
}

// ── Staff directory ─────────────────────────────────────────────────────────

export async function listEmployees(ctx: Ctx) {
  assertCanAny(ctx, "employee.view", "role.manage");
  const rows = await ctx.db
    .select({ e: employees, fullName: users.fullName, phone: users.phone, lastLoginAt: users.lastLoginAt })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .orderBy(desc(employees.isActive), employees.personnelCode);
  const links = await ctx.db.select({ employeeId: employeeRoles.employeeId, roleId: employeeRoles.roleId }).from(employeeRoles);
  return rows.map((r) => ({ ...r, roleIds: links.filter((l) => l.employeeId === r.e.id).map((l) => l.roleId) }));
}

export async function listRoles(ctx: Ctx) {
  assertCanAny(ctx, "employee.view", "role.manage");
  const rs = await ctx.db.select().from(roles).orderBy(roles.name);
  const perms = await ctx.db.select().from(rolePermissions);
  const members = await ctx.db.select({ roleId: employeeRoles.roleId, n: sql<number>`count(*)::int` }).from(employeeRoles).groupBy(employeeRoles.roleId);
  return rs.map((r) => ({ ...r, permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permission), members: members.find((m) => m.roleId === r.id)?.n ?? 0 }));
}
