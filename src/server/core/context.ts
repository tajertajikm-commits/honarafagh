import { randomUUID } from "node:crypto";
import { type Executor, getDb, type Transaction } from "@/server/db/client";
import type { Permission } from "@/server/auth/permissions";
import { AppError, forbidden } from "./errors";

export type StaffActor = {
  kind: "staff";
  userId: string;
  employeeId: string;
  name: string;
  permissions: ReadonlySet<Permission>;
  roleCodes: readonly string[];
  roleNames: readonly string[];
};
export type CustomerActor = { kind: "customer"; userId: string; customerId: string; name: string };
export type SystemActor = { kind: "system"; name: string };
export type AnonymousActor = { kind: "anonymous" };
export type Actor = StaffActor | CustomerActor | SystemActor | AnonymousActor;

export interface Ctx {
  actor: Actor;
  db: Executor;
  /** True when `db` is an open transaction. */
  inTx: boolean;
  requestId: string;
  ip?: string;
  userAgent?: string;
  /** Callbacks to run after the outermost transaction commits. */
  afterCommit?: (() => void | Promise<void>)[];
}

export function createCtx(actor: Actor, meta: { ip?: string; userAgent?: string; requestId?: string } = {}): Ctx {
  return { actor, db: getDb(), inTx: false, requestId: meta.requestId ?? randomUUID(), ip: meta.ip, userAgent: meta.userAgent };
}

export const systemCtx = (name = "system") => createCtx({ kind: "system", name });

/**
 * Runs `fn` inside a transaction. Nested calls join the outer transaction,
 * so services compose without worrying about who opened it.
 */
export async function inTx<T>(ctx: Ctx, fn: (tx: Ctx & { db: Transaction }) => Promise<T>): Promise<T> {
  if (ctx.inTx) return fn(ctx as Ctx & { db: Transaction });
  const afterCommit: (() => void | Promise<void>)[] = [];
  const result = await getDb().transaction(async (tx) => fn({ ...ctx, db: tx, inTx: true, afterCommit }));
  for (const cb of afterCommit) {
    try {
      await cb();
    } catch (err) {
      console.error("[afterCommit] callback failed", err);
    }
  }
  return result;
}

export function onCommit(ctx: Ctx, cb: () => void | Promise<void>) {
  if (ctx.afterCommit) ctx.afterCommit.push(cb);
  else void Promise.resolve().then(cb);
}

// ── Authorization helpers ───────────────────────────────────────────────────

export function isStaff(actor: Actor): actor is StaffActor {
  return actor.kind === "staff";
}

export function can(ctx: Ctx, permission: Permission): boolean {
  if (ctx.actor.kind === "system") return true;
  return ctx.actor.kind === "staff" && ctx.actor.permissions.has(permission);
}

export function assertCan(ctx: Ctx, ...permissions: Permission[]): asserts ctx is Ctx & { actor: StaffActor | SystemActor } {
  if (ctx.actor.kind === "anonymous" || ctx.actor.kind === "customer") {
    throw ctx.actor.kind === "anonymous" ? new AppError("UNAUTHENTICATED", "ابتدا وارد شوید.") : forbidden();
  }
  for (const p of permissions) if (!can(ctx, p)) throw forbidden();
}

export function assertCanAny(ctx: Ctx, ...permissions: Permission[]) {
  if (!permissions.some((p) => can(ctx, p))) {
    throw ctx.actor.kind === "anonymous" ? new AppError("UNAUTHENTICATED", "ابتدا وارد شوید.") : forbidden();
  }
}

export function requireCustomer(ctx: Ctx): CustomerActor {
  if (ctx.actor.kind !== "customer") throw new AppError("UNAUTHENTICATED", "برای ادامه وارد حساب کاربری شوید.");
  return ctx.actor;
}

export function actorUserId(ctx: Ctx): string | null {
  return ctx.actor.kind === "staff" || ctx.actor.kind === "customer" ? ctx.actor.userId : null;
}

export function actorLabel(actor: Actor): string {
  switch (actor.kind) {
    case "staff":
    case "customer":
      return actor.name;
    case "system":
      return `system:${actor.name}`;
    default:
      return "anonymous";
  }
}
