/** Static demo: `next/headers` backed by document.cookie (read in the browser). */
import { allCookies, deleteCookie, readCookie, writeCookie } from "../cookies";

export async function cookies() {
  return {
    get(name: string) {
      const value = readCookie(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return allCookies();
    },
    has(name: string) {
      return readCookie(name) !== undefined;
    },
    set(name: string, value: string, opts?: { expires?: Date | number }) {
      writeCookie(name, value, opts?.expires);
    },
    delete(name: string) {
      deleteCookie(name);
    },
  };
}

export async function headers() {
  return new Headers(typeof navigator !== "undefined" ? { "user-agent": navigator.userAgent } : {});
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
