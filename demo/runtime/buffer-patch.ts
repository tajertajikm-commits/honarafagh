/**
 * The browser `buffer` polyfill predates the "base64url" encoding that the
 * auth code (session tokens, password hashes) uses. Teach it once, globally.
 */
import { Buffer as B } from "buffer";

const FLAG = "__honarBase64url";
const proto = B.prototype as unknown as Record<string, unknown>;
if (!proto[FLAG]) {
  proto[FLAG] = true;
  const toString = B.prototype.toString as (this: B, encoding?: string, start?: number, end?: number) => string;
  B.prototype.toString = function (this: B, encoding?: string, start?: number, end?: number) {
    if (encoding === "base64url") return toString.call(this, "base64", start, end).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return toString.call(this, encoding, start, end);
  } as typeof B.prototype.toString;
  const from = B.from as (...a: unknown[]) => B;
  B.from = function (value: unknown, encodingOrOffset?: unknown, length?: unknown) {
    if (typeof value === "string" && encodingOrOffset === "base64url") return from.call(B, value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return from.call(B, value, encodingOrOffset, length);
  } as typeof B.from;
  const isEncoding = B.isEncoding;
  B.isEncoding = (e: string) => e === "base64url" || isEncoding(e);
}

export {};
