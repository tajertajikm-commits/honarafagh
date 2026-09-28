/**
 * Browser stand-in for the subset of `node:crypto` the domain code uses
 * (static demo build only). Pure-JS hashes from @noble/hashes; randomness
 * from Web Crypto.
 */
import { hmac as nobleHmac } from "@noble/hashes/hmac.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import "../buffer-patch";

type Input = string | Uint8Array | ArrayBufferView;

const enc = new TextEncoder();
function bytes(x: Input): Uint8Array {
  if (typeof x === "string") return enc.encode(x);
  if (x instanceof Uint8Array) return x;
  return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
}
function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function encode(b: Uint8Array, encoding?: string): string | Buffer {
  const buf = Buffer.from(b);
  return encoding ? buf.toString(encoding as BufferEncoding) : buf;
}
function assertSha256(alg: string) {
  if (alg.toLowerCase() !== "sha256") throw new Error(`demo crypto: unsupported algorithm ${alg}`);
}

export function createHash(alg: string) {
  assertSha256(alg);
  const parts: Uint8Array[] = [];
  const h = {
    update(d: Input) {
      parts.push(bytes(d));
      return h;
    },
    digest(encoding?: string) {
      return encode(sha256(concat(parts)), encoding) as never;
    },
  };
  return h;
}

export function createHmac(alg: string, key: Input) {
  assertSha256(alg);
  const parts: Uint8Array[] = [];
  const h = {
    update(d: Input) {
      parts.push(bytes(d));
      return h;
    },
    digest(encoding?: string) {
      return encode(nobleHmac(sha256, bytes(key), concat(parts)), encoding) as never;
    },
  };
  return h;
}

export function randomBytes(n: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n)));
}

export function randomInt(min: number, max?: number): number {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  const range = max - min;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  let v: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    v = buf[0]!;
  } while (v >= limit);
  return min + (v % range);
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError("Input buffers must have the same byte length");
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

export function scrypt(password: Input, salt: Input, keylen: number, opts: { N?: number; r?: number; p?: number } | ((e: Error | null, k?: Buffer) => void), cb?: (e: Error | null, k?: Buffer) => void) {
  const callback = typeof opts === "function" ? opts : cb!;
  const o = typeof opts === "function" ? {} : opts;
  scryptAsync(bytes(password), bytes(salt), { N: o.N ?? 16384, r: o.r ?? 8, p: o.p ?? 1, dkLen: keylen })
    .then((k) => callback(null, Buffer.from(k)))
    .catch((e: Error) => callback(e));
}

const nodeCrypto = { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual, scrypt };
export default nodeCrypto;
