import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PGlite } from "@electric-sql/pglite";
import type * as PgliteModule from "@electric-sql/pglite";
import type * as DrizzleLiteModule from "drizzle-orm/pglite";
import { Pool } from "pg";
import { env } from "@/server/config/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
export type Transaction = PgTransaction<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything that can run queries: the root database or an open transaction. */
export type Executor = Database | Transaction;

const globalForDb = globalThis as unknown as { __honarPool?: Pool; __honarDb?: Database; __honarLite?: PGlite };

/**
 * `DATABASE_URL=pglite:./data/db` runs an embedded PostgreSQL (PGlite) in this
 * process, persisted to that folder: a single-server deployment (demo or a
 * small shop) with no database server. Only one process may open the folder,
 * so keep `WORKER_INLINE=true` and stop the app before running scripts.
 */
export const pgliteDir = () => (env().DATABASE_URL.startsWith("pglite:") ? env().DATABASE_URL.slice("pglite:".length) : null);

function createPool() {
  const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  pool.on("error", (err) => console.error("[db] idle client error", err));
  return pool;
}

export function getPool(): Pool {
  if (pgliteDir()) throw new Error("No connection pool with the embedded (pglite) database.");
  if (!globalForDb.__honarPool) globalForDb.__honarPool = createPool();
  return globalForDb.__honarPool;
}

function createLiteDb(dir: string): Database {
  // Loaded lazily so the regular Postgres deployment never pulls in PGlite.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof PgliteModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle: drizzleLite } = require("drizzle-orm/pglite") as typeof DrizzleLiteModule;
  const client = new PGlite(dir);
  globalForDb.__honarLite = client;
  return drizzleLite(client, { schema, casing: "snake_case" }) as unknown as Database;
}

export function getDb(): Database {
  if (!globalForDb.__honarDb) {
    const dir = pgliteDir();
    globalForDb.__honarDb = dir ? createLiteDb(dir) : drizzle(getPool(), { schema, casing: "snake_case" });
  }
  return globalForDb.__honarDb;
}

export async function closeDb() {
  await globalForDb.__honarPool?.end();
  await globalForDb.__honarLite?.close();
  globalForDb.__honarPool = undefined;
  globalForDb.__honarLite = undefined;
  globalForDb.__honarDb = undefined;
}

/** Applies drizzle/*.sql with the migrator that matches the driver. */
export async function migrateDb(migrationsFolder = "./drizzle") {
  if (pgliteDir()) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(getDb() as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(getDb(), { migrationsFolder });
  }
}

export { schema };
