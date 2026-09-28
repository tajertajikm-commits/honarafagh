import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { AppError, validation } from "@/server/core/errors";
import { normalizePhone } from "@/lib/persian";
import { verifyPassword } from "./password";
import { enforceRateLimit } from "./rate-limit";

// Equalise timing for unknown users.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function authenticateStaff(db: Executor, rawPhone: string, password: string, ip?: string): Promise<{ userId: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone || !password) throw validation("شماره موبایل یا رمز عبور نادرست است.");
  await enforceRateLimit(db, `login:${phone}`, 8, 15 * 60, "تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه بعد دوباره تلاش کنید.");
  if (ip) await enforceRateLimit(db, `login-ip:${ip}`, 40, 15 * 60);
  const [user] = await db.select().from(users).where(and(eq(users.phone, phone), eq(users.kind, "EMPLOYEE"))).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError("UNAUTHENTICATED", "شماره موبایل یا رمز عبور نادرست است.");
  if (!user.isActive) throw new AppError("FORBIDDEN", "حساب کاربری غیرفعال است.");
  return { userId: user.id };
}
