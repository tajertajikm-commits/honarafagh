import { sql } from "drizzle-orm";
import { outboxEvents } from "@/server/db/schema";
import { systemCtx } from "@/server/core/context";
import { dispatchAccounting } from "@/server/modules/notifications/accounting";
import { dispatchNotifications } from "@/server/modules/notifications/service";
import { registerOutboxKicker } from "./outbox";

type Row = typeof outboxEvents.$inferSelect;
const MAX_ATTEMPTS = 8;
const handlers: ((ctx: ReturnType<typeof systemCtx>, e: Row) => Promise<void>)[] = [
  (ctx, e) => dispatchNotifications(ctx, e),
  (ctx, e) => dispatchAccounting(ctx, e),
];

let running = false;

/**
 * Claims a batch with FOR UPDATE SKIP LOCKED (safe with several workers),
 * runs every handler, and retries failures with exponential backoff.
 * Handlers are idempotent (dedupe keys / upserts) so retries are safe.
 */
export async function processOutboxBatch(limit = 20): Promise<number> {
  const ctx = systemCtx("outbox");
  const claimed = await ctx.db.execute<Row>(sql`
    UPDATE outbox_events SET status = 'PROCESSING', locked_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM outbox_events
      WHERE (status = 'PENDING' AND available_at <= now())
         OR (status = 'PROCESSING' AND locked_at < now() - interval '5 minutes')
      ORDER BY id LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, type, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId", payload, status, attempts`);
  for (const e of claimed.rows) {
    try {
      for (const h of handlers) await h(ctx, e);
      await ctx.db.execute(sql`UPDATE outbox_events SET status = 'DONE', processed_at = now(), last_error = NULL WHERE id = ${e.id}`);
    } catch (err) {
      const attempts = Number(e.attempts);
      const failed = attempts >= MAX_ATTEMPTS;
      const delayMin = Math.min(60, 2 ** attempts);
      console.error(`[outbox] event ${e.id} (${e.type}) failed (attempt ${attempts})`, err);
      await ctx.db.execute(sql`
        UPDATE outbox_events SET status = ${failed ? "FAILED" : "PENDING"}, last_error = ${String(err).slice(0, 1000)},
          available_at = now() + make_interval(mins => ${delayMin})
        WHERE id = ${e.id}`);
    }
  }
  return claimed.rows.length;
}

/** Drains the outbox (used inline in development and by the worker loop). */
export async function drainOutbox(maxBatches = 10) {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < maxBatches; i++) if ((await processOutboxBatch()) === 0) break;
  } finally {
    running = false;
  }
}

registerOutboxKicker(() => drainOutbox());
