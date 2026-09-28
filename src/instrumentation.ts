/**
 * In development (WORKER_INLINE=true) the Next.js server also drains the
 * outbox and runs periodic jobs, so no separate worker process is needed.
 * In production run `pnpm worker` instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/server/config/env");
  if (!env().WORKER_INLINE) return;
  const { drainOutbox } = await import("@/server/events/worker");
  const { PERIODIC_JOBS } = await import("@/server/events/jobs");
  setInterval(() => void drainOutbox().catch((e) => console.error("[inline-worker]", e)), 5000).unref();
  for (const job of PERIODIC_JOBS) {
    setInterval(() => void job.run().catch((e) => console.error(`[inline-worker] ${job.name}`, e)), job.everyMs).unref();
  }
}
