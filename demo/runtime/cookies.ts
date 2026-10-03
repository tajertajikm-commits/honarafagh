/**
 * Demo sessions live in ordinary (non-HttpOnly) cookies scoped to the demo's
 * base path. The real build uses HttpOnly cookies set by the server.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Shared (PHP-synced) demo: sessions are kept per browser tab (sessionStorage),
 * so the customer can be signed in in one tab and Labafi or Hamed in others.
 */
const TAB_MODE_KEY = "honar-demo:tab-cookies";
const TAB_PREFIX = "honar-demo:cookie:";
const tabMode = () => {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(TAB_MODE_KEY) === "1";
  } catch {
    return false;
  }
};
export function setTabCookies(on: boolean) {
  try {
    if (on) sessionStorage.setItem(TAB_MODE_KEY, "1");
    else sessionStorage.removeItem(TAB_MODE_KEY);
  } catch {
    /* ignore */
  }
}
function tabRead(): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)!;
      if (!k.startsWith(TAB_PREFIX)) continue;
      const { v, e } = JSON.parse(sessionStorage.getItem(k)!) as { v: string; e?: number };
      if (e !== undefined && e <= Date.now()) sessionStorage.removeItem(k);
      else out.push({ name: k.slice(TAB_PREFIX.length), value: v });
    }
  } catch {
    /* ignore */
  }
  return out;
}
export function clearTabCookies() {
  for (const c of tabRead()) sessionStorage.removeItem(TAB_PREFIX + c.name);
}

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  if (tabMode()) return tabRead().find((c) => c.name === name)?.value;
  for (const part of document.cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function allCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
  if (tabMode()) return tabRead();
  return document.cookie
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return { name: p.slice(0, i), value: decodeURIComponent(p.slice(i + 1)) };
    });
}

export function writeCookie(name: string, value: string, expires?: Date | number) {
  if (tabMode()) {
    sessionStorage.setItem(TAB_PREFIX + name, JSON.stringify({ v: value, e: expires !== undefined ? new Date(expires).getTime() : undefined }));
    return;
  }
  const path = `${BASE_PATH}/`;
  const exp = expires !== undefined ? `; expires=${new Date(expires).toUTCString()}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}${exp}; samesite=lax`;
}

export function deleteCookie(name: string) {
  if (tabMode()) {
    sessionStorage.removeItem(TAB_PREFIX + name);
    return;
  }
  document.cookie = `${name}=; path=${BASE_PATH}/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
}
