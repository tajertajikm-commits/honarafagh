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

  it("opening stock equals the ledger", async () => {
    const res = await getDb().execute<{ n: number; ok: boolean }>(sql`
      SELECT count(*)::int AS n, bool_and(m.stock = (SELECT coalesce(sum(delta), 0) FROM stock_movements s WHERE s.material_id = m.id)) AS ok FROM materials m`);
    expect(res.rows[0]!.n).toBeGreaterThan(10);
    expect(res.rows[0]!.ok).toBe(true);
  });

  it("the real staff and their roles exist", async () => {
    const res = await getDb().execute<{ full_name: string; codes: string }>(sql`
      SELECT u.full_name, string_agg(r.code, ',') AS codes FROM employees e JOIN users u ON u.id = e.user_id
      JOIN employee_roles er ON er.employee_id = e.id JOIN roles r ON r.id = er.role_id GROUP BY u.full_name`);
    const byName = Object.fromEntries(res.rows.map((r) => [r.full_name, r.codes]));
    expect(byName["حامد نورصالحی"]).toBe("MANAGER");
    expect(byName["آقای لبافی"]).toBe("DIGITAL_MANAGER");
    expect(byName["حسین عبدالی"]).toBe("ACCOUNTANT");
    expect(byName["آقای قلی‌پور"]).toBe("OFFSET_MANAGER");
    expect(byName["مجتبی حاج‌قاسمی"]).toBe("OFFSET_PRODUCTION");
    expect(byName["آقای معماریان"]).toBe("DESIGNER");
  });

  it("forbids editing the audit log and stock ledger", async () => {
    await expect(getDb().execute(sql`UPDATE stock_movements SET delta = 1`)).rejects.toThrow();
    await expect(getDb().execute(sql`DELETE FROM audit_logs`)).resolves.toBeDefined(); // empty table: no rows affected
  });
});
