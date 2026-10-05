/**
 * Shared demo data over a tiny PHP endpoint (public/demo/sync.php).
 *
 * Every browser tab runs the app on its own in-memory copy of the database
 * (seed snapshot + every change in the shared log). Writes are captured row by
 * row (see sync-sql.ts) and pushed right after each request; other tabs pull
 * new changes every few seconds and re-render. Without PHP on the host the
 * endpoint is missing and the demo falls back to per-browser data.
 */
import type { PGlite } from "@electric-sql/pglite";
import { BASE_PATH } from "./cookies";
import { enqueue } from "./queue";

export interface RemoteState { epoch: number; head: number; backup?: boolean }
interface Batch { v: number; b: { c: [string, string, string | null, string | null][]; s?: [string, string][] } }

const endpoint = () => `${BASE_PATH}/demo/sync.php`;
let db: PGlite | null = null;
let epoch = 0;
let version = 0;
let onReset: () => void = () => {};
let onChange: () => void = () => {};
let shared = false;

export const isShared = () => shared;

async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<{ status: number; body: T | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: T | null = null;
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

const SEEN_KEY = "honar-demo:shared-seen";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probeOnce(): Promise<RemoteState | null> {
  try {
    const r = await getJson<RemoteState>(`${endpoint()}?since=999999999`, undefined, 8000);
    if (r.status === 200 && r.body && typeof r.body.epoch === "number" && typeof r.body.head === "number") return r.body;
  } catch {
    /* no PHP / offline */
  }
  return null;
}

/**
 * Is the shared endpoint there (a PHP host)? Once this browser has seen the
 * shared demo, a failed probe is a network problem, not a host without PHP:
 * retry, and never quietly fall back to per-browser data (that would look
 * like the whole project disappeared).
 */
export async function probeShared(): Promise<RemoteState | null> {
  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    /* ignore */
  }
  for (let attempt = 0; attempt < (seen ? 4 : 2); attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    const r = await probeOnce();
    if (r) {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      return r;
    }
  }
  if (seen) throw new Error("ارتباط با سرور دمو برقرار نشد. اینترنت را بررسی کنید و «تلاش دوباره» را بزنید؛ داده‌ها روی سرور محفوظ است.");
  return null;
}

/** Changes made in this tab that the server has not confirmed yet. */
let unsaved = 0;
const unsavedListeners = new Set<(n: number) => void>();
export const unsavedCount = () => unsaved;
export function onUnsaved(l: (n: number) => void) {
  unsavedListeners.add(l);
  return () => unsavedListeners.delete(l);
}
function setUnsaved(n: number) {
  if (n === unsaved) return;
  unsaved = n;
  for (const l of unsavedListeners) l(n);
}

async function applyBatches(batches: Batch[]) {
  for (const batch of batches) {
    if (batch.v <= version) continue;
    await db!.transaction(async (tx) => {
      await tx.exec("SET LOCAL session_replication_role = replica");
      for (const [t, op, o, n] of batch.b.c) await tx.query("SELECT demo_apply($1, $2, $3::jsonb, $4::jsonb)", [t, op, o, n]);
      for (const [name, value] of batch.b.s ?? []) {
        await tx.query(
          "SELECT setval(format('public.%I', sequencename), $2::bigint) FROM pg_sequences WHERE schemaname = 'public' AND sequencename = $1 AND coalesce(last_value, 0) < $2::bigint",
          [name, value],
        );
      }
    });
    version = batch.v;
  }
}

/** Fetch and apply what others wrote. Returns true when something changed. */
async function pull(): Promise<boolean> {
  const r = await getJson<RemoteState & { batches: Batch[] }>(`${endpoint()}?since=${version}`);
  if (r.status !== 200 || !r.body) return false;
  if (r.body.epoch !== epoch) {
    onReset(); // someone reset the demo: start again from the seed
    return false;
  }
  const fresh = r.body.batches.filter((b) => b.v > version);
  if (!fresh.length) return false;
  await applyBatches(fresh);
  return true;
}

/** Send this tab's captured changes. */
async function push(): Promise<boolean> {
  let pulled = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = (await db!.query<{ id: string; tbl: string; op: string; o: string | null; n: string | null }>("SELECT id::text AS id, tbl, op, old::text AS o, new::text AS n FROM demo_changes ORDER BY id")).rows;
    setUnsaved(rows.length);
    if (!rows.length) return pulled;
    const seqs = (await db!.query<{ n: string; v: string }>("SELECT sequencename AS n, last_value::text AS v FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL AND sequencename <> 'demo_changes_id_seq'")).rows;
    const body = JSON.stringify({ c: rows.map((r) => [r.tbl, r.op, r.o, r.n]), s: seqs.map((s) => [s.n, s.v]) });
    const r = await getJson<{ v?: number; error?: string; epoch?: number }>(`${endpoint()}?action=push&epoch=${epoch}&base=${version}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (r.status === 200 && r.body?.v) {
      await db!.query("DELETE FROM demo_changes WHERE id <= $1::bigint", [rows[rows.length - 1]!.id]);
      version = r.body.v;
      const left = await db!.query<{ n: number }>("SELECT count(*)::int AS n FROM demo_changes");
      setUnsaved(left.rows[0]?.n ?? 0);
      return pulled;
    }
    if (r.status === 409 && r.body?.error === "reset") {
      onReset();
      return false;
    }
    if (r.status === 409) {
      // Someone wrote first: take their changes, then send ours on top.
      pulled = (await pull()) || pulled;
      continue;
    }
    console.warn("[demo sync] push failed", r.status, r.body);
    return pulled;
  }
  return pulled;
}

/** Called once the in-memory database is loaded and shifted to the shared epoch. */
export async function startShared(opts: { db: PGlite; remote: RemoteState; onReset: () => void; onChange: () => void }) {
  db = opts.db;
  epoch = opts.remote.epoch;
  version = 0;
  onReset = opts.onReset;
  onChange = opts.onChange;
  await pull();
  await opts.db.exec("DELETE FROM demo_changes"); // anything written while loading is not a user change
  shared = true; // only now: a failed boot must never be treated as a shared session (e.g. by "reset")
  window.addEventListener("beforeunload", (e) => {
    if (unsaved > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  const tick = () =>
    enqueue(async () => {
      const a = await pull().catch(() => false);
      const b = await push().catch(() => false);
      return a || b;
    }).then((changed) => changed && onChange());
  setInterval(() => void tick(), 3000);
  // Unsaved changes (the network dropped): try again sooner.
  setInterval(() => unsaved > 0 && void tick(), 1000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void tick());
}

/** Inside the request queue: make sure a write starts from the latest data… */
export async function beforeWrite() {
  if (shared) await pull().catch(() => false);
}

/** …and share it right away. */
export async function afterWrite() {
  if (!shared) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await push();
      if (unsaved === 0) return;
    } catch (err) {
      console.warn("[demo sync]", err);
    }
    await sleep(700 * (attempt + 1));
  }
}

/** "Reset demo" for everyone (the server keeps the previous data as a backup). */
export async function resetShared() {
  const r = await getJson(`${endpoint()}?action=reset`, { method: "POST" });
  if (r.status !== 200) throw new Error("بازنشانی انجام نشد.");
}

/** Swap back to the data before the last reset. */
export async function restoreShared() {
  const r = await getJson(`${endpoint()}?action=restore`, { method: "POST" });
  if (r.status !== 200) throw new Error("نسخه پشتیبانی برای بازگردانی نیست.");
}

/** Does the server hold data from before the last reset? */
export async function hasSharedBackup(): Promise<boolean> {
  const r = await probeOnce();
  return !!r?.backup;
}
