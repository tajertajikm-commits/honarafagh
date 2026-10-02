/**
 * Builds the self-contained server package: Next.js standalone server +
 * embedded PostgreSQL (PGlite) + a seeded demo database. One folder, no
 * database server; runs anywhere with Node.js 20+ (e.g. cPanel «Setup Node.js App»).
 *
 *   node scripts/build-server-package.mjs   → demo-dist/honarafagh-server.zip
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".build-server");
const pkg = path.join(out, "honarafagh-server");
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, env: { ...process.env, ...env } });
const log = (m) => console.info(`[server-package] ${m}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(pkg, { recursive: true });

log("building Next.js (standalone)…");
rmSync(path.join(root, ".next"), { recursive: true, force: true });
run("pnpm", ["build"], { NEXT_OUTPUT: "standalone" });
cpSync(path.join(root, ".next/standalone"), pkg, { recursive: true });
cpSync(path.join(root, ".next/static"), path.join(pkg, ".next/static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(pkg, "public"), { recursive: true });
// PGlite loads its WebAssembly and data files at runtime: ship the whole package.
const pglite = path.join(root, "node_modules/@electric-sql/pglite");
rmSync(path.join(pkg, "node_modules/@electric-sql/pglite"), { recursive: true, force: true });
cpSync(pglite, path.join(pkg, "node_modules/@electric-sql/pglite"), { recursive: true, dereference: true });
for (const f of [".env", ".env.local"]) rmSync(path.join(pkg, f), { force: true });
rmSync(path.join(pkg, "storage"), { recursive: true, force: true });
rmSync(path.join(pkg, ".data"), { recursive: true, force: true });

log("seeding the demo database…");
const seedEnv = { DATABASE_URL: `pglite:${path.join(pkg, "seed-db")}`, STORAGE_LOCAL_DIR: path.join(pkg, "seed-files"), DEMO_MODE: "true", NODE_ENV: "development", WORKER_INLINE: "false" };
run("pnpm", ["db:migrate"], seedEnv);
run("pnpm", ["db:seed"], seedEnv);
run("node", ["-e", `const {PGlite}=require("@electric-sql/pglite");(async()=>{const d=new PGlite(${JSON.stringify(path.join(pkg, "seed-db"))});await d.exec("CREATE TABLE IF NOT EXISTS demo_meta (key text primary key, value text not null); INSERT INTO demo_meta VALUES ('seeded_at', '"+new Date().toISOString()+"') ON CONFLICT (key) DO UPDATE SET value = excluded.value;");await d.close();})()`]);

for (const f of ["app.js", "seed-install.js", "reset-demo.js", "config.env.example", "README.txt"]) cpSync(path.join(root, "deploy/server", f), path.join(pkg, f));
writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "honarafagh-server", private: true, main: "app.js", scripts: { start: "node app.js" }, engines: { node: ">=20" } }, null, 2));

mkdirSync(path.join(root, "demo-dist"), { recursive: true });
const zip = path.join(root, "demo-dist/honarafagh-server.zip");
rmSync(zip, { force: true });
log("zipping…");
execFileSync("zip", ["-qr", "-y", zip, "honarafagh-server"], { cwd: out, stdio: "inherit" });
log(`done → ${path.relative(root, zip)}`);
if (!existsSync(zip)) process.exit(1);
