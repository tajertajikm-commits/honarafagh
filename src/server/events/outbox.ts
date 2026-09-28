import { outboxEvents } from "@/server/db/schema";
import { type Ctx, onCommit } from "@/server/core/context";
import { env } from "@/server/config/env";
import type { DomainEventType, DomainEvents } from "./types";

type Kicker = () => Promise<void>;
let kicker: Kicker | null = null;

/** The worker module registers itself so inline dispatch can run after commit. */
export function registerOutboxKicker(fn: Kicker) {
  kicker = fn;
}

export async function emit<T extends DomainEventType>(
  ctx: Ctx,
  type: T,
  aggregate: { type: string; id: string },
  payload: DomainEvents[T],
) {
  await ctx.db.insert(outboxEvents).values({
    type,
    aggregateType: aggregate.type,
    aggregateId: aggregate.id,
    payload: payload as unknown as Record<string, unknown>,
  });
  if (env().WORKER_INLINE && kicker) {
    const k = kicker;
    onCommit(ctx, () => {
      // fire-and-forget: never block the request on notifications
      void k().catch((err) => console.error("[outbox] inline dispatch failed", err));
    });
  }
}
