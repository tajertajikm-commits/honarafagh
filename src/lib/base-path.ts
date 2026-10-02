/**
 * The app may be served under a sub-path (e.g. https://example.com/printing-demo),
 * set at build time with NEXT_PUBLIC_BASE_PATH. Next.js prefixes <Link>, router and
 * redirects itself; use this for raw URLs (fetch, XHR, <a href>, images).
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//") || path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
