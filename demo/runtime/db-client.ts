/**
 * Static demo stand-in for `@/server/db/client`: the same Drizzle API, backed
 * by PGlite (PostgreSQL compiled to WebAssembly) persisted in IndexedDB.
 * The instance is created by ./boot before any page or API code runs.
 */
import * as schema from "@/server/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Schema = typeof schema;
export type Database = any;
export type Transaction = any;
export type Executor = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const g = globalThis as unknown as { __honarDb?: Database };

export function getDb(): Database {
  if (!g.__honarDb) throw new Error("پایگاه داده نمایشی هنوز آماده نشده است.");
  return g.__honarDb;
}

export function getPool(): never {
  throw new Error("No connection pool in the static demo.");
}

export async function closeDb() {}

export { schema };
