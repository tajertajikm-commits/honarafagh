import { NextResponse, type NextRequest } from "next/server";
import type { z, ZodType } from "zod";
import { createCtx, type Ctx } from "@/server/core/context";
import { AppError } from "@/server/core/errors";
import "@/server/events/worker"; // registers inline outbox dispatch
import { assertSameOrigin, type AuthMode, errorResponse, resolveActor } from "./route";
import { clientIp } from "./session";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

export interface HandlerArgs<B, Q> {
  ctx: Ctx;
  body: B;
  query: Q;
  params: Record<string, string>;
  req: NextRequest;
}

export interface RouteDef {
  method: Method;
  path: string;
  auth: AuthMode;
  body?: ZodType;
  query?: ZodType;
  /** Raw body (multipart uploads) — skips JSON parsing. */
  raw?: boolean;
  handler: (args: HandlerArgs<never, never>) => Promise<unknown>;
}

function def<B extends ZodType | undefined, Q extends ZodType | undefined>(
  method: Method,
  path: string,
  opts: { auth: AuthMode; body?: B; query?: Q; raw?: boolean },
  handler: (args: HandlerArgs<Infer<B>, Infer<Q>>) => Promise<unknown>,
): RouteDef {
  return { method, path, ...opts, handler: handler as RouteDef["handler"] };
}

export const api = {
  get: <Q extends ZodType | undefined = undefined>(path: string, opts: { auth: AuthMode; query?: Q }, h: (a: HandlerArgs<undefined, Infer<Q>>) => Promise<unknown>) => def<undefined, Q>("GET", path, opts, h),
  post: <B extends ZodType | undefined = undefined>(path: string, opts: { auth: AuthMode; body?: B; raw?: boolean }, h: (a: HandlerArgs<Infer<B>, undefined>) => Promise<unknown>) => def<B, undefined>("POST", path, opts, h),
  patch: <B extends ZodType | undefined = undefined>(path: string, opts: { auth: AuthMode; body?: B }, h: (a: HandlerArgs<Infer<B>, undefined>) => Promise<unknown>) => def<B, undefined>("PATCH", path, opts, h),
  put: <B extends ZodType | undefined = undefined>(path: string, opts: { auth: AuthMode; body?: B }, h: (a: HandlerArgs<Infer<B>, undefined>) => Promise<unknown>) => def<B, undefined>("PUT", path, opts, h),
  delete: (path: string, opts: { auth: AuthMode }, h: (a: HandlerArgs<undefined, undefined>) => Promise<unknown>) => def<undefined, undefined>("DELETE", path, opts, h),
};

function match(pattern: string, segments: string[]): Record<string, string> | null {
  const parts = pattern.split("/").filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const s = segments[i]!;
    if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(s);
    else if (p !== s) return null;
  }
  return params;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDispatcher(routes: RouteDef[]) {
  return async (req: NextRequest, context: { params: Promise<{ path?: string[] }> }) => {
    try {
      const segments = (await context.params).path ?? [];
      let params: Record<string, string> | null = null;
      let route: RouteDef | undefined;
      let methodMismatch = false;
      for (const r of routes) {
        const m = match(r.path, segments);
        if (!m) continue;
        if (r.method !== req.method) {
          methodMismatch = true;
          continue;
        }
        route = r;
        params = m;
        break;
      }
      if (!route || !params) {
        return NextResponse.json({ error: { code: methodMismatch ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", message: "مسیر API پیدا نشد." } }, { status: methodMismatch ? 405 : 404 });
      }
      // Path ids are UUIDs everywhere; reject anything else early (also blocks malformed-id probing).
      for (const [k, v] of Object.entries(params)) if (k.endsWith("id") || k === "id") if (!UUID.test(v)) throw new AppError("NOT_FOUND", "پیدا نشد.");
      assertSameOrigin(req);
      const actor = await resolveActor(req, route.auth);
      const ctx = createCtx(actor, { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") ?? undefined });
      let body: unknown = undefined;
      if (route.body && !route.raw) {
        const rawBody = await req.json().catch(() => {
          throw new AppError("VALIDATION", "بدنه درخواست باید JSON معتبر باشد.");
        });
        body = route.body.parse(rawBody);
      }
      const query = route.query ? route.query.parse(Object.fromEntries(req.nextUrl.searchParams)) : undefined;
      const result = await route.handler({ ctx, body: body as never, query: query as never, params, req });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
