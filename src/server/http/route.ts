import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { getDb } from "@/server/db/client";
import { env } from "@/server/config/env";
import { loadCustomerActor, loadStaffActor, resolveSession } from "@/server/auth/sessions";
import { type Actor, type Ctx, createCtx } from "@/server/core/context";
import { AppError, isAppError, isCheckViolation, isUniqueViolation, pgErrorInfo } from "@/server/core/errors";
import { CUSTOMER_COOKIE, STAFF_COOKIE } from "./cookies";
import { clientIp } from "./session";

export type AuthMode = "public" | "staff" | "customer" | "any";

interface RouteOptions<B extends ZodType | undefined, Q extends ZodType | undefined> {
  auth: AuthMode;
  body?: B;
  query?: Q;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

export interface RouteArgs<B, Q> {
  ctx: Ctx;
  body: B;
  query: Q;
  params: Record<string, string>;
  req: NextRequest;
}

export async function resolveActor(req: NextRequest, mode: AuthMode): Promise<Actor> {
  const db = getDb();
  if (mode === "staff" || mode === "any") {
    const token = req.cookies.get(STAFF_COOKIE)?.value;
    if (token) {
      const s = await resolveSession(db, token, "STAFF");
      const actor = s && (await loadStaffActor(db, s.userId));
      if (actor) return actor;
    }
    if (mode === "staff") throw new AppError("UNAUTHENTICATED", "ابتدا وارد پنل شوید.");
  }
  if (mode === "customer" || mode === "any" || mode === "public") {
    const token = req.cookies.get(CUSTOMER_COOKIE)?.value;
    if (token) {
      const s = await resolveSession(db, token, "CUSTOMER");
      const actor = s && (await loadCustomerActor(db, s.userId));
      if (actor) return actor;
    }
    if (mode === "customer") throw new AppError("UNAUTHENTICATED", "برای ادامه وارد حساب کاربری شوید.");
  }
  return { kind: "anonymous" };
}

/** Blocks cross-site form/JSON posts: mutating requests must come from our own origin. */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (mobile app, server-to-server) don't send Origin; they
    // also can't ride on a victim's cookies, so this is not a CSRF vector.
    return;
  }
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new AppError("FORBIDDEN", "درخواست از مبدأ نامعتبر.");
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "اطلاعات ارسالی معتبر نیست.", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  if (isAppError(err)) {
    const headers: Record<string, string> = {};
    const retry = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
    if (err.code === "RATE_LIMITED" && retry) headers["Retry-After"] = String(retry);
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status, headers });
  }
  if (isUniqueViolation(err)) {
    return NextResponse.json({ error: { code: "CONFLICT", message: "این رکورد تکراری است.", details: { constraint: pgErrorInfo(err).constraint } } }, { status: 409 });
  }
  if (isCheckViolation(err)) {
    const constraint = pgErrorInfo(err).constraint;
    const stock = constraint?.startsWith("stock_");
    return NextResponse.json(
      { error: { code: stock ? "INSUFFICIENT_STOCK" : "INVALID_STATE", message: stock ? "موجودی کافی نیست." : "این تغییر با قواعد داده‌ها سازگار نیست.", details: { constraint } } },
      { status: 409 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." } }, { status: 500 });
}

export function route<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, R = unknown>(
  opts: RouteOptions<B, Q>,
  handler: (args: RouteArgs<Infer<B>, Infer<Q>>) => Promise<R | Response>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      assertSameOrigin(req);
      const actor = await resolveActor(req, opts.auth);
      const ctx = createCtx(actor, { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") ?? undefined });
      let body: unknown = undefined;
      if (opts.body) {
        const raw = await req.json().catch(() => {
          throw new AppError("VALIDATION", "بدنه درخواست باید JSON معتبر باشد.");
        });
        body = opts.body.parse(raw);
      }
      let query: unknown = undefined;
      if (opts.query) query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      const params = (await context.params) ?? {};
      const result = await handler({ ctx, body: body as Infer<B>, query: query as Infer<Q>, params, req });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
