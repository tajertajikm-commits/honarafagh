import { auditLogs } from "@/server/db/schema";
import { type Ctx, actorLabel, actorUserId } from "@/server/core/context";

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
