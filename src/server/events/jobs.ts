import { lt, or, isNotNull } from "drizzle-orm";
import { otpChallenges, rateLimits, sessions } from "@/server/db/schema";
import { systemCtx } from "@/server/core/context";

/** Periodic maintenance run by the worker process. */
export const PERIODIC_JOBS = [
  {
    name: "cleanup",
    everyMs: 6 * 60 * 60_000,
    run: async () => {
      const ctx = systemCtx("cleanup");
      const cutoff = new Date(Date.now() - 7 * 86_400_000);
      await ctx.db.delete(otpChallenges).where(lt(otpChallenges.createdAt, cutoff));
      await ctx.db.delete(sessions).where(or(lt(sessions.expiresAt, new Date()), isNotNull(sessions.revokedAt)));
      await ctx.db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date()));
    },
  },
];
