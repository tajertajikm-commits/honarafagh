import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { Pool } from "pg";
import { env } from "@/server/config/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
export type Transaction = PgTransaction<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything that can run queries: the root database or an open transaction. */
export type Executor = Database | Transaction;

const globalForDb = globalThis as unknown as { __honarPool?: Pool; __honarDb?: Database };

function createPool() {
  const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
  pool.on("error", (err) => console.error("[db] idle client error", err));
  return pool;
}

export function getPool(): Pool {
  if (!globalForDb.__honarPool) globalForDb.__honarPool = createPool();
  return globalForDb.__honarPool;
}

export function getDb(): Database {
  if (!globalForDb.__honarDb) globalForDb.__honarDb = drizzle(getPool(), { schema, casing: "snake_case" });
  return globalForDb.__honarDb;
}

export async function closeDb() {
  await globalForDb.__honarPool?.end();
  globalForDb.__honarPool = undefined;
  globalForDb.__honarDb = undefined;
}

export { schema };
