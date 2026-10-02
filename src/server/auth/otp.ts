import { randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { customers, otpChallenges, users } from "@/server/db/schema";
import { env } from "@/server/config/env";
import { AppError, validation } from "@/server/core/errors";
import { otpProvider } from "@/server/integrations/sms";
import { normalizePhone } from "@/lib/persian";
import { enforceRateLimit } from "./rate-limit";
import { hmac, safeEqualHex } from "./tokens";

export const OTP_TTL_SECONDS = 120;
export const OTP_MAX_ATTEMPTS = 5;
const CODE_LENGTH = 5;

const codeHash = (phone: string, code: string) => hmac(`otp:${phone}:${code}`);

export async function requestOtp(db: Executor, rawPhone: string, ip?: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw validation("شماره موبایل معتبر نیست.");
  // Demo mode (fake SMS, code shown on screen): short cooldown so a live walkthrough never stalls.
  const demo = env().DEMO_MODE && env().OTP_PROVIDER === "fake";
  await enforceRateLimit(db, `otp:phone:${phone}`, 1, demo ? 5 : 60, demo ? "چند ثانیه صبر کنید." : "برای دریافت کد جدید یک دقیقه صبر کنید.");
  await enforceRateLimit(db, `otp:phone-hour:${phone}`, demo ? 120 : 6, 3600);
  if (ip) await enforceRateLimit(db, `otp:ip:${ip}`, demo ? 600 : 30, 3600);

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  await db.insert(otpChallenges).values({
    phone,
    codeHash: codeHash(phone, code),
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    ip,
  });
  await otpProvider().sendOtp(phone, code);
  const e = env();
  // The code is only ever echoed back with the fake provider outside real production.
  const exposeCode = e.OTP_PROVIDER === "fake" && (e.NODE_ENV !== "production" || e.DEMO_MODE);
  return { phone, expiresIn: OTP_TTL_SECONDS, devCode: exposeCode ? code : undefined };
}

/** Verifies the code and returns the (possibly new) customer user id. */
export async function verifyOtp(db: Executor, rawPhone: string, code: string, ip?: string): Promise<{ userId: string; isNew: boolean }> {
  const phone = normalizePhone(rawPhone);
  if (!phone || !/^\d{4,8}$/.test(code)) throw validation("کد وارد شده معتبر نیست.");
  if (ip) await enforceRateLimit(db, `otp-verify:ip:${ip}`, 60, 3600);

  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge) throw new AppError("VALIDATION", "کد منقضی شده است. دوباره درخواست کنید.");
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AppError("RATE_LIMITED", "تعداد تلاش‌ها بیش از حد مجاز است. کد جدید درخواست کنید.");

  // Count the attempt atomically before comparing to prevent parallel guessing.
  const [bumped] = await db
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(and(eq(otpChallenges.id, challenge.id), sql`${otpChallenges.attempts} < ${OTP_MAX_ATTEMPTS}`))
    .returning({ attempts: otpChallenges.attempts });
  if (!bumped) throw new AppError("RATE_LIMITED", "تعداد تلاش‌ها بیش از حد مجاز است. کد جدید درخواست کنید.");
  if (!safeEqualHex(codeHash(phone, code), challenge.codeHash)) throw validation("کد وارد شده صحیح نیست.");

  const [consumed] = await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (!consumed) throw validation("این کد قبلاً استفاده شده است.");

  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(and(eq(users.phone, phone), eq(users.kind, "CUSTOMER"))).limit(1);
    let isNew = false;
    if (!user) {
      [user] = await tx.insert(users).values({ phone, kind: "CUSTOMER" }).onConflictDoNothing().returning();
      if (!user) [user] = await tx.select().from(users).where(and(eq(users.phone, phone), eq(users.kind, "CUSTOMER"))).limit(1);
      isNew = true;
    }
    if (!user!.isActive) throw new AppError("FORBIDDEN", "حساب کاربری غیرفعال است.");
    // Link an existing customer record (e.g. created by sales) or create one.
    const [existing] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1);
    if (existing && !existing.userId) await tx.update(customers).set({ userId: user!.id }).where(eq(customers.id, existing.id));
    if (!existing) await tx.insert(customers).values({ phone, fullName: user!.fullName || "", userId: user!.id });
    return { userId: user!.id, isNew: isNew && !existing };
  });
}
