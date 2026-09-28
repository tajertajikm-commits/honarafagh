import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { auditLogs } from "@/server/db/schema";
import { type Ctx, actorLabel, actorUserId, assertCan } from "@/server/core/context";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  extra?: Record<string, unknown>;
}

/**
 * Writes an audit record in the caller's transaction, so the record exists
 * if and only if the change was committed.
 */
export async function audit(ctx: Ctx, entry: AuditEntry) {
  await ctx.db.insert(auditLogs).values({
    actorUserId: actorUserId(ctx),
    actorLabel: actorLabel(ctx.actor),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before === undefined ? null : toJson(entry.before),
    after: entry.after === undefined ? null : toJson(entry.after),
    context: {
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...entry.extra,
    },
  });
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/** Only keep keys whose values changed — keeps audit rows readable. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const nv = after[key];
    const ov = before[key];
    if (JSON.stringify(nv) !== JSON.stringify(ov)) {
      b[key] = ov;
      a[key] = nv;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

export interface AuditFilters { entityType?: string; entityId?: string; action?: string; actor?: string; from?: Date; page?: number; pageSize?: number }

/** Read side of the (append-only) audit log. */
export async function listAudit(ctx: Ctx, f: AuditFilters = {}) {
  assertCan(ctx, "audit.view");
  const conds = [];
  if (f.entityType) conds.push(eq(auditLogs.entityType, f.entityType));
  if (f.entityId) conds.push(eq(auditLogs.entityId, f.entityId));
  if (f.action) conds.push(like(auditLogs.action, `${f.action.replace(/[%_]/g, "")}%`));
  if (f.actor) conds.push(eq(auditLogs.actorUserId, f.actor));
  if (f.from) conds.push(gte(auditLogs.createdAt, f.from));
  const where = conds.length ? and(...conds) : undefined;
  const pageSize = Math.min(f.pageSize ?? 50, 200);
  const page = Math.max(1, f.page ?? 1);
  const rows = await ctx.db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.id)).limit(pageSize).offset((page - 1) * pageSize);
  const [{ total }] = (await ctx.db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where)) as [{ total: number }];
  const entityTypes = (await ctx.db.selectDistinct({ t: auditLogs.entityType }).from(auditLogs)).map((r) => r.t).sort();
  return { rows, total, page, pageSize, entityTypes };
}
