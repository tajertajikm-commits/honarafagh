/**
 * Puts the seeded demo database (and its sample files) in place on first start
 * and moves every timestamp so the seed's "now" becomes the real now: orders
 * look as recent as when the package was built.
 */
const fs = require("node:fs");
const path = require("node:path");

async function shiftToNow(dir) {
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite(dir);
  try {
    const meta = await db.query(`SELECT value FROM demo_meta WHERE key = 'seeded_at'`);
    const seededAt = meta.rows[0] ? new Date(meta.rows[0].value).getTime() : Date.now();
    const secs = Math.round((Date.now() - seededAt) / 1000);
    if (Math.abs(secs) < 60) return;
    const cols = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'timestamp with time zone' ORDER BY table_name`,
    );
    const byTable = new Map();
    for (const c of cols.rows) byTable.set(c.table_name, [...(byTable.get(c.table_name) || []), c.column_name]);
    const stmts = ["SET session_replication_role = replica"]; // append-only triggers stay out of the way
    for (const [t, cs] of byTable) stmts.push(`UPDATE "${t}" SET ${cs.map((c) => `"${c}" = "${c}" + make_interval(secs => ${secs})`).join(", ")}`);
    stmts.push("SET session_replication_role = origin");
    stmts.push(`UPDATE demo_meta SET value = '${new Date().toISOString()}' WHERE key = 'seeded_at'`);
    await db.exec(stmts.join(";\n"));
  } finally {
    await db.close();
  }
}

async function installSeed(root, { force = false } = {}) {
  const db = path.join(root, "data", "db");
  const files = path.join(root, "data", "files");
  if (force) {
    fs.rmSync(db, { recursive: true, force: true });
    fs.rmSync(files, { recursive: true, force: true });
  }
  if (fs.existsSync(db)) return;
  fs.mkdirSync(path.dirname(db), { recursive: true });
  fs.cpSync(path.join(root, "seed-db"), db, { recursive: true });
  if (fs.existsSync(path.join(root, "seed-files"))) fs.cpSync(path.join(root, "seed-files"), files, { recursive: true });
  await shiftToNow(db);
  console.info("[honar] demo database created from the seed");
}

module.exports = { installSeed };
