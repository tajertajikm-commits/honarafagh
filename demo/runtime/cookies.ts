/**
 * Demo sessions live in ordinary (non-HttpOnly) cookies scoped to the demo's
 * base path. The real build uses HttpOnly cookies set by the server.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function allCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
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
  const path = `${BASE_PATH}/`;
  const exp = expires !== undefined ? `; expires=${new Date(expires).toUTCString()}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}${exp}; samesite=lax`;
}

export function deleteCookie(name: string) {
  document.cookie = `${name}=; path=${BASE_PATH}/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
}
