import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "@/server/db/client";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.info("[migrate] database is up to date");
}

main()
  .catch((err) => {
    console.error("[migrate] failed", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
