import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { resetTestDb } from "../helpers/db";

describe("reference seed", () => {
  beforeAll(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("creates opening stock through the ledger", async () => {
    const db = getDb();
    const res = await db.execute<{ n: number; ok: boolean }>(sql`
      SELECT count(*)::int AS n,
             bool_and(s.on_hand = (SELECT coalesce(sum(on_hand_delta),0) FROM inventory_transactions t WHERE t.material_id = s.material_id AND t.location_id = s.location_id)) AS ok
      FROM stock_levels s`);
    expect(res.rows[0]!.n).toBeGreaterThan(10);
    expect(res.rows[0]!.ok).toBe(true);
  });

  it("forbids editing the inventory ledger", async () => {
    await expect(getDb().execute(sql`UPDATE inventory_transactions SET quantity = 1`)).rejects.toThrow();
    await expect(getDb().execute(sql`DELETE FROM audit_logs`)).resolves.toBeDefined(); // empty table: no rows affected
  });
});
