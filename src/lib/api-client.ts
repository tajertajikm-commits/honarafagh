/** Thin client for /api/v1. Throws ApiError with the server's user-facing message. */
import { withBase } from "./base-path";
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Tells the API which UI is calling, so routes open to both staff and customers
 * use the matching session when a browser holds both (see SURFACE_HEADER).
 */
export function surfaceHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return { "X-Honar-Surface": /(^|\/)panel(\/|$)/.test(window.location.pathname) ? "panel" : "store" };
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(withBase(`/api/v1/${path.replace(/^\//, "")}`), {
    method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
    headers: init.form ? surfaceHeaders() : { "Content-Type": "application/json", ...surfaceHeaders() },
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
    signal: init.signal,
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; details?: unknown } } | null;
  if (!res.ok || !json || json.error) {
    const e = json?.error;
    throw new ApiError(e?.message ?? "ارتباط با سرور برقرار نشد.", e?.code ?? "NETWORK", res.status, e?.details);
  }
  return json.data as T;
}

export function newIdempotencyKey() {
  return crypto.randomUUID().replace(/-/g, "");
}
