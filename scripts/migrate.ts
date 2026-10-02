import { closeDb, migrateDb } from "@/server/db/client";

async function main() {
  await migrateDb();
  console.info("[migrate] database is up to date");
}

main()
  .catch((err) => {
    console.error("[migrate] failed", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
