/**
 * Static hosting cannot serve /panel/orders/<uuid> without server rewrites, so
 * each dynamic route is exported once as a placeholder page ("item") and the real
 * value travels in the query string (?__id=…). Links, router calls and
 * redirects are rewritten transparently; the pages receive normal `params`.
 */
import { DYNAMIC_ROUTES, STATIC_ROUTES } from "./routes.generated";
import { BASE_PATH } from "./cookies";

export const DYNAMIC_PARAM = "__id";
/** Must match PLACEHOLDER in demo/build.mjs. */
export const PLACEHOLDER = "item";

function clean(p: string) {
  const s = p.replace(/\/+$/, "");
  return s === "" ? "/" : s;
}

/** "/panel/orders/abc?x=1#h" → "/panel/orders/item/?x=1&__id=abc#h" (other paths unchanged). */
export function toDemoPath(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const [beforeHash, hash] = href.split("#", 2) as [string, string | undefined];
  const [rawPath, query] = beforeHash.split("?", 2) as [string, string | undefined];
  let path = clean(rawPath);
  if (BASE_PATH && (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`))) path = clean(path.slice(BASE_PATH.length) || "/");
  if (STATIC_ROUTES.includes(path)) return href;
  const segs = path.split("/").filter(Boolean);
  for (const pattern of DYNAMIC_ROUTES) {
    const ps = pattern.split("/").filter(Boolean);
    if (ps.length !== segs.length) continue;
    let value: string | null = null;
    let ok = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i] === PLACEHOLDER) {
        if (segs[i] === PLACEHOLDER) {
          ok = false; // already rewritten
          break;
        }
        value = decodeURIComponent(segs[i]!);
      } else if (ps[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (!ok || value === null) continue;
    const q = new URLSearchParams(query ?? "");
    q.set(DYNAMIC_PARAM, value);
    return `/${ps.join("/")}/?${q.toString()}${hash ? `#${hash}` : ""}`;
  }
  return href;
}

/** Internal path of the current location (without base path). */
export function currentPath(): string {
  const p = window.location.pathname;
  return clean(BASE_PATH && p.startsWith(BASE_PATH) ? p.slice(BASE_PATH.length) || "/" : p);
}
