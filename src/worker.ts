/**
 * Background worker: dispatches the transactional outbox (notifications,
 * accounting sync) and runs periodic jobs. Run with `pnpm worker`.
 * Several instances may run concurrently (SKIP LOCKED).
 */
import { closeDb } from "@/server/db/client";
import { PERIODIC_JOBS } from "@/server/events/jobs";
import { processOutboxBatch } from "@/server/events/worker";

let stopping = false;

async function outboxLoop() {
  while (!stopping) {
    const n = await processOutboxBatch(50).catch((err) => {
      console.error("[worker] outbox batch failed", err);
      return 0;
    });
    if (n === 0) await new Promise((r) => setTimeout(r, 2000));
  }
}

function startPeriodic() {
  for (const job of PERIODIC_JOBS) {
    const tick = () => job.run().catch((err) => console.error(`[worker] ${job.name} failed`, err));
    void tick();
    setInterval(tick, job.everyMs).unref();
  }
}

async function main() {
  console.info("[worker] started");
  startPeriodic();
  await outboxLoop();
  await closeDb();
  console.info("[worker] stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}

void main();
