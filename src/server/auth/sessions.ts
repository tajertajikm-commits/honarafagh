import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { employeeRoles, employees, rolePermissions, roles, sessions, users, customers } from "@/server/db/schema";
import type { CustomerActor, StaffActor } from "@/server/core/context";
import { isPermission, type Permission } from "./permissions";
import { newToken, sha256 } from "./tokens";

export const SESSION_TTL = {
  STAFF: 12 * 60 * 60 * 1000,
  CUSTOMER: 30 * 24 * 60 * 60 * 1000,
} as const;

export type SessionKind = keyof typeof SESSION_TTL;

export async function createSession(db: Executor, userId: string, kind: SessionKind, meta: { ip?: string; userAgent?: string } = {}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL[kind]);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, kind, expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 400) });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  return { token, expiresAt };
}

export async function revokeSession(db: Executor, token: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
}

export async function revokeAllSessions(db: Executor, userId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Returns the active session's user id, sliding `lastSeenAt` at most every 5 minutes. */
export async function resolveSession(db: Executor, token: string, kind: SessionKind): Promise<{ userId: string } | null> {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId, lastSeenAt: sessions.lastSeenAt, isActive: users.isActive })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), eq(sessions.kind, kind), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.isActive) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await db.update(sessions).set({ lastSeenAt: sql`now()` }).where(eq(sessions.id, row.id));
  }
  return { userId: row.userId };
}

export async function loadStaffActor(db: Executor, userId: string): Promise<StaffActor | null> {
  const [emp] = await db
    .select({ employeeId: employees.id, name: users.fullName, active: employees.isActive })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(eq(employees.userId, userId))
    .limit(1);
  if (!emp || !emp.active) return null;
  const roleRows = await db
    .select({ roleId: roles.id, code: roles.code, name: roles.name })
    .from(employeeRoles)
    .innerJoin(roles, eq(roles.id, employeeRoles.roleId))
    .where(eq(employeeRoles.employeeId, emp.employeeId));
  const roleIds = roleRows.map((r) => r.roleId);
  const perms = roleIds.length
    ? await db.select({ permission: rolePermissions.permission }).from(rolePermissions).where(sql`${rolePermissions.roleId} IN ${roleIds}`)
    : [];
  const permissions = new Set<Permission>(perms.map((p) => p.permission).filter(isPermission));
  return {
    kind: "staff",
    userId,
    employeeId: emp.employeeId,
    name: emp.name,
    permissions,
    roleCodes: roleRows.map((r) => r.code),
    roleNames: roleRows.map((r) => r.name),
  };
}

export async function loadCustomerActor(db: Executor, userId: string): Promise<CustomerActor | null> {
  const [c] = await db.select({ id: customers.id, name: customers.fullName }).from(customers).where(eq(customers.userId, userId)).limit(1);
  return c ? { kind: "customer", userId, customerId: c.id, name: c.name } : null;
}
