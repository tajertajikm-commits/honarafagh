import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { loadStaffActor } from "@/server/auth/sessions";
import { createCtx, type Ctx } from "@/server/core/context";
import { type ReferenceIds, seedReference } from "@/server/seed/seed-reference";

/** Drops and recreates the test schema, migrates, and seeds reference data. */
export async function resetTestDb(): Promise<ReferenceIds> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("_test")) throw new Error(`refusing to reset non-test database: ${url}`);
  const db = getDb();
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return seedReference(db, { staffPassword: "test-password" });
}

export async function staffCtx(ref: ReferenceIds, code: string): Promise<Ctx> {
  const e = ref.employees.get(code);
  if (!e) throw new Error(`no employee ${code}`);
  const actor = await loadStaffActor(getDb(), e.userId);
  if (!actor) throw new Error("actor not loaded");
  return createCtx(actor);
}

export const MANAGER = "E001";
export const SALES = "E002";
export const ACCOUNTANT = "E003";
export const WAREHOUSE = "E004";
export const DESIGNER = "E005";
export const PREPRESS = "E006";
export const OFFSET_OP = "E007";
export const DIGITAL_OP = "E008";
export const CUTTER = "E009";
export const BINDER = "E010";
export const QC = "E011";
export const SHIPPING = "E012";
