/**
 * Static demo database lifecycle.
 *
 * - First visit: download the seed snapshot (real migrations + real seed,
 *   built with demo/seed/build-seed.ts), load it into PGlite and persist it
 *   in IndexedDB. Timestamps are shifted so the seeded business looks current.
 * - Later visits: reopen the persisted database (state survives refreshes).
 * - Reset: drop the IndexedDB database and start again from the snapshot.
 * - Only one tab writes at a time: a newly opened tab asks the others to
 *   close their database handle first (IndexedDB file images are not merged).
 */
import type { PGlite } from "@electric-sql/pglite";
import { BASE_PATH, deleteCookie } from "./cookies";

const VERSION = process.env.NEXT_PUBLIC_DEMO_VERSION ?? "dev";
const DB_NAME = `honar-demo-${VERSION}`;
const FLAG = `honar-demo:seeded:${VERSION}`;
const CHANNEL = "honar-demo";

export type BootStage = "idle" | "download" | "prepare" | "open" | "ready" | "released" | "error";
type Listener = (s: BootStage, detail?: string) => void;
const listeners = new Set<Listener>();
let stage: BootStage = "idle";
let stageDetail: string | undefined;
function setStage(s: BootStage, detail?: string) {
  stage = s;
  stageDetail = detail;
  for (const l of listeners) l(s, detail);
}
export function onBootStage(l: Listener) {
  listeners.add(l);
  l(stage, stageDetail);
  return () => listeners.delete(l);
}

let pg: PGlite | null = null;
let ready: Promise<void> | null = null;
const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
let channel: BroadcastChannel | null = null;

export function demoReady(): Promise<void> {
  if (typeof window === "undefined") return new Promise(() => {}); // never during static prerender
  ready ??= init().catch((err) => {
    console.error("[demo] boot failed", err);
    setStage("error", err instanceof Error ? err.message : String(err));
    throw err;
  });
  return ready;
}

export function isSeeded() {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

async function claimTab() {
  if (typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL);
  let waiting = 0;
  let resolveReleased: () => void = () => {};
  const released = new Promise<void>((r) => (resolveReleased = r));
  channel.onmessage = async (e: MessageEvent<{ type: string; from: string }>) => {
    const m = e.data;
    if (m.from === tabId) return;
    if (m.type === "claim" && pg) {
      channel!.postMessage({ type: "closing", from: tabId });
      const db = pg;
      pg = null;
      (globalThis as { __honarDb?: unknown }).__honarDb = undefined;
      await db.close().catch(() => {});
      channel!.postMessage({ type: "released", from: tabId });
      setStage("released");
    } else if (m.type === "closing") {
      waiting++;
    } else if (m.type === "released") {
      waiting--;
      if (waiting <= 0) resolveReleased();
    }
  };
  channel.postMessage({ type: "claim", from: tabId });
  // Give other tabs a moment to answer; wait for the ones that did.
  await new Promise((r) => setTimeout(r, 250));
  if (waiting > 0) await Promise.race([released, new Promise((r) => setTimeout(r, 4000))]);
}

async function init() {
  await claimTab();
  const [{ PGlite }, { drizzle }, schema] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("@/server/db/schema")]);
  const dataDir = `idb://${DB_NAME}`;
  if (!isSeeded()) {
    setStage("download");
    await dropDatabases();
    const res = await fetch(`${BASE_PATH}/demo/seed.tgz`, { cache: "force-cache" });
    if (!res.ok) throw new Error(`seed snapshot not found (${res.status})`);
    const blob = await res.blob();
    setStage("prepare");
    pg = await PGlite.create({ dataDir, loadDataDir: blob });
    await shiftSeedToNow(pg);
    await flushDb();
    localStorage.setItem(FLAG, "1");
  } else {
    setStage("open");
    pg = await PGlite.create({ dataDir });
  }
  (globalThis as { __honarDb?: unknown }).__honarDb = drizzle({ client: pg, schema, casing: "snake_case" });
  setStage("ready");
}

/**
 * Waits until everything written so far is in IndexedDB. PGlite's own
 * per-query sync returns early when a sync is already queued, so a write can
 * resolve before it is durable; call this before anything that may unload
 * the page (full navigations, redirects to the payment result page, …).
 */
export async function flushDb() {
  const db = pg;
  if (!db) return;
  await db.query("SELECT 1"); // drains queued statements and their pending sync
  await (db as unknown as { fs?: { syncToFs(relaxed?: boolean): Promise<void> } }).fs?.syncToFs(false);
}

/** Moves every timestamp so the snapshot's "now" becomes the visitor's now. */
async function shiftSeedToNow(db: PGlite) {
  const meta = await db.query<{ value: string }>(`SELECT value FROM demo_meta WHERE key = 'seeded_at'`);
  const seededAt = meta.rows[0] ? new Date(meta.rows[0].value).getTime() : Date.now();
  const secs = Math.round((Date.now() - seededAt) / 1000);
  if (Math.abs(secs) < 60) return;
  const cols = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'timestamp with time zone' ORDER BY table_name`,
  );
  const byTable = new Map<string, string[]>();
  for (const c of cols.rows) byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), c.column_name]);
  const stmts = ["SET session_replication_role = replica"]; // append-only triggers stay out of the way
  for (const [t, cs] of byTable) stmts.push(`UPDATE "${t}" SET ${cs.map((c) => `"${c}" = "${c}" + make_interval(secs => ${secs})`).join(", ")}`);
  stmts.push("SET session_replication_role = origin");
  stmts.push(`UPDATE demo_meta SET value = '${new Date().toISOString()}' WHERE key = 'seeded_at'`);
  await db.exec(stmts.join(";\n"));
}

async function dropDatabases() {
  const names = new Set<string>();
  try {
    for (const d of await indexedDB.databases()) if (d.name && d.name.includes("honar-demo")) names.add(d.name);
  } catch {
    /* Firefox < 126 has no databases(): fall back to the known names */
  }
  names.add(`/pglite/${DB_NAME}`);
  names.add(DB_NAME);
  await Promise.all(
    [...names].map(
      (n) =>
        new Promise<void>((resolve) => {
          const r = indexedDB.deleteDatabase(n);
          r.onsuccess = r.onerror = r.onblocked = () => resolve();
        }),
    ),
  );
}

/** "Reset demo": wipe browser data and reload into a fresh copy of the snapshot. */
export async function resetDemo() {
  channel?.postMessage({ type: "claim", from: tabId });
  if (pg) await pg.close().catch(() => {});
  pg = null;
  for (const c of ["ha_staff", "ha_session", "ha_cart"]) deleteCookie(c);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("honar-demo")) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  await dropDatabases();
  window.location.assign(new URL(`${BASE_PATH}/`, window.location.origin)); // full reload: nothing of the old session may survive
}
