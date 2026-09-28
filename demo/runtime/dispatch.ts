/**
 * The static demo's "server": every /api/v1 request is answered in the
 * browser by the production route table and dispatcher (same validation,
 * auth, permissions and domain services) running against PGlite.
 */
import type { NextRequest } from "next/server";
import { ROUTES } from "@/server/http/api";
import { createDispatcher } from "@/server/http/router";
import { drainOutbox } from "@/server/events/worker";
import { demoReady, flushDb } from "./boot";
import { allCookies, BASE_PATH, deleteCookie, readCookie, writeCookie } from "./cookies";

const dispatcher = createDispatcher(ROUTES);

/** Serialise requests: one PGlite connection, and handlers assume request isolation. */
let queue: Promise<unknown> = Promise.resolve();

export function isApiUrl(url: URL): boolean {
  if (url.origin !== window.location.origin) return false;
  return url.pathname.startsWith(`${BASE_PATH}/api/v1/`) || url.pathname.startsWith("/api/v1/");
}

function apiSegments(url: URL): string[] {
  const p = url.pathname.startsWith(`${BASE_PATH}/api/v1/`) ? url.pathname.slice(BASE_PATH.length + "/api/v1/".length) : url.pathname.slice("/api/v1/".length);
  return p.split("/").filter(Boolean);
}

export async function demoApi(input: { url: URL; method: string; headers?: HeadersInit; body?: BodyInit | null }): Promise<Response> {
  const run = async () => {
    await demoReady();
    const headers = new Headers(input.headers);
    headers.set("user-agent", navigator.userAgent);
    const body = input.body ?? null;
    const req = {
      method: input.method.toUpperCase(),
      url: input.url.toString(),
      nextUrl: input.url,
      headers,
      cookies: {
        get: (name: string) => {
          const value = readCookie(name);
          return value === undefined ? undefined : { name, value };
        },
        getAll: () => allCookies(),
        has: (name: string) => readCookie(name) !== undefined,
      },
      json: async () => JSON.parse(typeof body === "string" ? body : await new Response(body).text()),
      text: async () => (typeof body === "string" ? body : new Response(body).text()),
      formData: async () => (body instanceof FormData ? body : new Response(body).formData()),
    } as unknown as NextRequest;
    const res = await dispatcher(req, { params: Promise.resolve({ path: apiSegments(input.url) }) });
    applyCookies(res);
    // What the worker process does in production: deliver notifications / accounting events
    // right after the request, inside the queue so it never interleaves with another request.
    // Of the GET routes only the gateway callbacks write.
    if (req.method !== "GET" || input.url.pathname.includes("/callback/")) {
      await drainOutbox(10).catch((err) => console.error("[demo] outbox", err));
      await flushDb();
    }
    return res;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** Session cookies set by the real handlers (NextResponse.cookies) → document.cookie. */
function applyCookies(res: Response) {
  const jar = (res as Response & { cookies?: { getAll(): { name: string; value: string; expires?: Date | number; maxAge?: number }[] } }).cookies;
  if (!jar) return;
  for (const c of jar.getAll()) {
    const expires = c.maxAge !== undefined ? Date.now() + c.maxAge * 1000 : c.expires;
    if (!c.value || (expires !== undefined && new Date(expires).getTime() <= Date.now())) deleteCookie(c.name);
    else writeCookie(c.name, c.value, expires);
  }
}
