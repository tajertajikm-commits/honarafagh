import { closeDb, getDb } from "@/server/db/client";
import { drainOutbox } from "@/server/events/worker";
import { seedDemo } from "@/server/seed/seed-demo";
import { seedReference } from "@/server/seed/seed-reference";

async function main() {
  // The outbox is drained explicitly below; inline dispatch would outlive the pool.
  process.env.WORKER_INLINE = "false";
  const db = getDb();
  const withDemo = !process.argv.includes("--reference-only");
  console.info("[seed] reference data…");
  const ref = await seedReference(db, { staffPassword: process.env.SEED_STAFF_PASSWORD });
  if (withDemo) {
    console.info("[seed] demo orders…");
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
