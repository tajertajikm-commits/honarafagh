import { sql } from "drizzle-orm";
import { closeDb, getDb, migrateDb } from "@/server/db/client";

/** Drops everything and re-applies migrations. Refuses to run in production. */
async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) throw new Error("refusing to reset a production database");
  const db = getDb();
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await migrateDb();
  console.info("[reset] database recreated");
}

main()
  .catch((err) => {
    console.error("[reset] failed", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
