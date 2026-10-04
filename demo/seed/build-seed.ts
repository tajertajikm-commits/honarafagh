/**
 * Builds the static demo's initial database: runs the real migrations and the
 * real reference + demo seed (the same code the production seed uses) against
 * an in-memory PGlite, then dumps the data directory to a tarball that the
 * browser loads on first visit and on "reset demo".
 *
 *   tsx demo/seed/build-seed.ts <out.tgz>
 */
process.env.WORKER_INLINE = "false";
process.env.DEMO_MODE = "true";
process.env.OTP_PROVIDER = "fake";
process.env.SMS_PROVIDER = "fake";
process.env.PAYMENT_PROVIDER = "fake";
process.env.APP_URL = process.env.DEMO_APP_URL ?? "https://example.com/printing-demo";

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/server/db/schema";
import { setStorageDriver } from "@/server/integrations/storage";
import { DatabaseStorage, DEMO_SQL } from "../runtime/blob-storage";
import { SYNC_SQL } from "../runtime/sync-sql";

/** Migrations without pg_trgm (only used for search indexes; not bundled in the browser build). */
export function demoMigrationSql(root: string): string {
  const journal = JSON.parse(readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const statements: string[] = [];
  for (const e of journal.entries) {
    const text = readFileSync(path.join(root, "drizzle", `${e.tag}.sql`), "utf8");
    for (const st of text.split("--> statement-breakpoint")) {
      const s = st.trim();
      if (!s) continue;
      if (/pg_trgm|gin_trgm_ops/.test(s)) {
        // A breakpoint chunk may hold several statements; keep the ones that don't need the extension.
        const kept = s.split(/;\s*\n/).filter((x) => x.trim() && !/pg_trgm|gin_trgm_ops/.test(x));
        if (kept.length) statements.push(kept.join(";\n") + ";");
        continue;
      }
      statements.push(s.endsWith(";") ? s : `${s};`);
    }
  }
  return statements.join("\n");
}

async function main() {
  const out = process.argv[2] ?? "demo/.build/seed.tgz";
  const root = path.resolve(__dirname, "../..");
  const started = Date.now();
  const pg = await PGlite.create();
  await pg.exec("SET TIME ZONE 'UTC';");
  await pg.exec(demoMigrationSql(root));
  await pg.exec(DEMO_SQL);
  const db = drizzle({ client: pg, schema, casing: "snake_case" });
  (globalThis as unknown as { __honarDb: unknown }).__honarDb = db;
  setStorageDriver(new DatabaseStorage());

  const { seedReference } = await import("@/server/seed/seed-reference");
  const { seedDemo } = await import("@/server/seed/seed-demo");
  const { drainOutbox } = await import("@/server/events/worker");
  console.info("[demo-seed] reference data…");
  // Clean by default (no made-up customers, orders, suppliers or paper stock); DEMO_SAMPLES=1 adds them.
  const samples = process.env.DEMO_SAMPLES === "1";
  const ref = await seedReference(db as never, { staffPassword: process.env.SEED_STAFF_PASSWORD ?? "honar1405", samples });
  if (samples) {
    console.info("[demo-seed] sample scenario…");
    await seedDemo(db as never, ref);
  }
  await drainOutbox(100);
  await pg.query(`INSERT INTO demo_meta (key, value) VALUES ('seeded_at', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [new Date().toISOString()]);
  await pg.exec(SYNC_SQL); // change capture for the shared (PHP-synced) demo — after the seed, so the seed is not a change
  await pg.exec("VACUUM FULL");
  await pg.exec("CHECKPOINT");
  const dump = await pg.dumpDataDir("gzip");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await dump.arrayBuffer()));
  console.info(`[demo-seed] wrote ${out} (${Math.round(dump.size / 1024)} KB) in ${Math.round((Date.now() - started) / 1000)}s`);
  await pg.close();
}

if (process.argv[1] && /build-seed/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("[demo-seed] failed", err);
    process.exit(1);
  });
}
