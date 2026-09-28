import { sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { AppError } from "@/server/core/errors";

/**
 * Fixed-window counter in Postgres, shared by every app instance.
 * Used for authentication and OTP where limits must hold across restarts.
 */
export async function hitRateLimit(db: Executor, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const res = await db.execute<{ count: number; reset_at: Date }>(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE rate_limits.reset_at END
    RETURNING count, reset_at`);
  const row = res.rows[0]!;
  const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  return { allowed: Number(row.count) <= limit, retryAfter };
}

export async function enforceRateLimit(db: Executor, key: string, limit: number, windowSeconds: number, message = "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.") {
  const r = await hitRateLimit(db, key, limit, windowSeconds);
  if (!r.allowed) throw new AppError("RATE_LIMITED", message, { retryAfter: r.retryAfter });
}
