import { closeDb, getDb } from "@/server/db/client";
import { drainOutbox } from "@/server/events/worker";
import { seedDemo } from "@/server/seed/seed-demo";
import { seedReference } from "@/server/seed/seed-reference";

async function main() {
  // The outbox is drained explicitly below; inline dispatch would outlive the pool.
  process.env.WORKER_INLINE = "false";
  const db = getDb();
  // Default: a clean installation (staff, roles, machines, store catalogue, settings) without made-up
  // customers, orders, suppliers or paper stock. `--samples` adds them for tests and walkthroughs.
  const withDemo = process.argv.includes("--samples");
  console.info(`[seed] reference data${withDemo ? " + samples" : ""}…`);
  const ref = await seedReference(db, { staffPassword: process.env.SEED_STAFF_PASSWORD, samples: withDemo });
  if (withDemo) {
    console.info("[seed] sample customers and orders…");
    await seedDemo(db, ref);
    await drainOutbox(50);
  }
  console.info("[seed] done");
}

main()
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
