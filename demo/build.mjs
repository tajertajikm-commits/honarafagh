#!/usr/bin/env node
/**
 * Builds the self-contained STATIC DEMO (no server, no database, no Node on
 * the host) and packs it as demo-dist/printing-house-demo.zip.
 *
 *   node demo/build.mjs [--base=/printing-demo] [--skip-seed] [--no-zip]
 *
 * How it works (production code is not modified by this script):
 *  1. demo/seed/build-seed.ts runs the real migrations + seed on PGlite and
 *     dumps the database  → demo/seed.tgz (loaded by the browser).
 *  2. The repository is copied to demo/.build/site; its src/app is replaced by
 *     generated thin client wrappers around the original pages/layouts
 *     (moved to src/app-original) — see demo/runtime/render.tsx.
 *  3. `next build --webpack` with output:"export" and the demo aliases
 *     (env, db client, storage, next/headers …) → demo/.build/site/out
 *  4. out/ is zipped so that extracting it into public_html/<folder>/ works.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const BASE = String(args.base ?? process.env.DEMO_BASE_PATH ?? "/printing-demo").replace(/\/+$/, "");
const buildDir = path.join(root, "demo/.build");
const site = path.join(buildDir, "site");
const seedFile = path.join(buildDir, "seed.tgz");
const distDir = path.join(root, "demo-dist");
const zipName = "printing-house-demo.zip";

const log = (m) => console.info(`[demo] ${m}`);
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: "inherit", ...opts });

// ── 1. seed snapshot ────────────────────────────────────────────────────────
if (!args["skip-seed"] || !existsSync(seedFile)) {
  log("building seed snapshot (real migrations + seed on PGlite)…");
  run(path.join(root, "node_modules/.bin/tsx"), ["demo/seed/build-seed.ts", seedFile], { cwd: root });
}
const version = `${statSync(seedFile).mtimeMs.toString(36).replace(".", "")}`;

// ── 2. demo site tree ───────────────────────────────────────────────────────
log(`preparing site in ${path.relative(root, site)} (base path "${BASE || "/"}")`);
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const f of ["src", "public", "tsconfig.json", "postcss.config.mjs", "package.json"]) cpSync(path.join(root, f), path.join(site, f), { recursive: true });
cpSync(path.join(root, "demo/runtime"), path.join(site, "demo/runtime"), { recursive: true });
symlinkSync(path.join(root, "node_modules"), path.join(site, "node_modules"), "dir");

const appSrc = path.join(site, "src/app");
const appOrig = path.join(site, "src/app-original");
cpSync(appSrc, appOrig, { recursive: true });
rmSync(appSrc, { recursive: true, force: true });
mkdirSync(appSrc, { recursive: true });

// Next's compiler rejects these specifiers in client code before aliases apply,
// so the build copy imports the demo shims directly (repository source untouched).
function rewriteSpecifiers(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      rewriteSpecifiers(full);
      continue;
    }
    if (!/\.(tsx?|mts)$/.test(name)) continue;
    const src = readFileSync(full, "utf8");
    let next = src;
    for (const [from, to] of SPECIFIERS) next = next.replaceAll(`"${from}"`, `"${to}"`);
    if (next !== src) writeFileSync(full, next);
  }
}
const SPECIFIERS = [
  ["server-only", "@demo/shims/empty"],
  ["next/headers", "@demo/shims/next-headers"],
  ["next/navigation", "@demo/shims/next-navigation"],
  ["next/link", "@demo/shims/next-link"],
  ["next/server", "@demo/shims/next-server"],
  ["node:crypto", "@demo/shims/crypto"],
  ["node:util", "@demo/shims/misc"],
];
rewriteSpecifiers(path.join(site, "src"));
// Server infrastructure → in-browser equivalents (PGlite database, in-database files, fixed demo env).
const OVERRIDES = {
  "src/server/config/env.ts": "@demo/env",
  "src/server/db/client.ts": "@demo/db-client",
  "src/server/integrations/storage/index.ts": "@demo/storage",
};
for (const [file, target] of Object.entries(OVERRIDES)) writeFileSync(path.join(site, file), `// Static demo build: replaced by ${target}\nexport * from "${target}";\n`);

const staticRoutes = [];
const dynamicRoutes = [];

/** Folder that stands in for a dynamic segment ("_x" folders are private in the App Router). */
const PLACEHOLDER = "item";
/** "(store)/account/orders/[id]" → { out: "(store)/account/orders/item", url: "/account/orders/item", param: "id" } */
function mapDir(rel) {
  let param = null;
  const segs = rel.split("/").filter(Boolean).map((s) => {
    const m = /^\[(\w+)\]$/.exec(s);
    if (m) {
      param = m[1];
      return PLACEHOLDER;
    }
    if (/^\[\.\.\./.test(s)) throw new Error(`catch-all route not supported in demo: ${rel}`);
    return s;
  });
  const url = "/" + segs.filter((s) => !/^\(.*\)$/.test(s)).join("/");
  return { out: segs.join("/"), url: url === "/" ? "/" : url, param };
}

const importPath = (rel, file) => `@/app-original/${rel ? `${rel}/` : ""}${file}`;

function walk(rel = "") {
  const dir = path.join(appOrig, rel);
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const childRel = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) {
      if (childRel === "api" || childRel === "fonts") continue;
      walk(childRel);
      continue;
    }
    const { out, url, param } = mapDir(rel);
    const outDir = path.join(appSrc, out);
    if (name === "page.tsx") {
      mkdirSync(outDir, { recursive: true });
      (param ? dynamicRoutes : staticRoutes).push(url);
      // Page titles: copy the metadata object literal (importing the page here would pull client code into the server graph).
      const meta = /export const metadata(?::\s*Metadata)?\s*=\s*(\{[\s\S]*?\});/.exec(readFileSync(full, "utf8"))?.[1];
      writeFileSync(
        path.join(outDir, "page.tsx"),
        `${meta ? `export const metadata = ${meta};\n` : ""}import Client from "./page.client";\n\nexport default function Page() {\n  return <Client />;\n}\n`,
      );
      writeFileSync(
        path.join(outDir, "page.client.tsx"),
        `"use client";\nimport Page from "${importPath(rel, "page")}";\nimport { DemoPage } from "@demo/render";\n\nexport default function Client() {\n  return <DemoPage page={Page as never}${param ? ` param="${param}"` : ""} />;\n}\n`,
      );
    } else if (name === "layout.tsx" && rel !== "") {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, "layout.tsx"), `import Client from "./layout.client";\n\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <Client>{children}</Client>;\n}\n`);
      writeFileSync(
        path.join(outDir, "layout.client.tsx"),
        `"use client";\nimport Layout from "${importPath(rel, "layout")}";\nimport { DemoLayout } from "@demo/render";\n\nexport default function Client({ children }: { children: React.ReactNode }) {\n  return <DemoLayout layout={Layout as never}>{children}</DemoLayout>;\n}\n`,
      );
    }
  }
}
walk();

// Root layout: the original, wrapped in the demo shell.
let rootLayout = readFileSync(path.join(appOrig, "layout.tsx"), "utf8");
rootLayout = rootLayout
  .replace('import "./globals.css";', 'import "./globals.css";\nimport { DemoShell } from "@demo/DemoShell";')
  .replace("<ToastProvider>{children}</ToastProvider>", "<ToastProvider>\n          <DemoShell>{children}</DemoShell>\n        </ToastProvider>")
  .replace('title: { default: "هنر آفاق — چاپ آنلاین"', 'title: { default: "هنر آفاق — نسخه نمایشی"');
if (!rootLayout.includes("<DemoShell>")) throw new Error("root layout shape changed; update demo/build.mjs");
writeFileSync(path.join(appSrc, "layout.tsx"), rootLayout);
for (const f of ["globals.css", "icon.png", "apple-icon.png"]) cpSync(path.join(appOrig, f), path.join(appSrc, f));
cpSync(path.join(appOrig, "fonts"), path.join(appSrc, "fonts"), { recursive: true });

writeFileSync(
  path.join(site, "demo/runtime/routes.generated.ts"),
  `// Generated by demo/build.mjs\nexport const STATIC_ROUTES: string[] = ${JSON.stringify(staticRoutes.sort(), null, 2)};\nexport const DYNAMIC_ROUTES: string[] = ${JSON.stringify(dynamicRoutes.sort(), null, 2)};\n`,
);
log(`routes: ${staticRoutes.length} static, ${dynamicRoutes.length} dynamic (${dynamicRoutes.join(", ")})`);

// tsconfig: @demo/* alias
const tsconfig = JSON.parse(readFileSync(path.join(site, "tsconfig.json"), "utf8"));
tsconfig.compilerOptions.paths = { ...tsconfig.compilerOptions.paths, "@demo/*": ["./demo/runtime/*"] };
writeFileSync(path.join(site, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

cpSync(path.join(root, "demo/next.config.demo.ts"), path.join(site, "next.config.ts"));
mkdirSync(path.join(site, "public/demo"), { recursive: true });
cpSync(seedFile, path.join(site, "public/demo/seed.tgz"));
writeFileSync(path.join(site, "public/.htaccess"), readFileSync(path.join(root, "demo/static/.htaccess"), "utf8").replaceAll("{{BASE}}", BASE));

// ── 3. static export ────────────────────────────────────────────────────────
log("next build (static export)…");
run(path.join(root, "node_modules/.bin/next"), ["build", "--webpack"], {
  cwd: site,
  env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_BASE_PATH: BASE, NEXT_PUBLIC_DEMO_VERSION: version, NEXT_TELEMETRY_DISABLED: "1" },
});
const out = path.join(site, "out");
if (!existsSync(path.join(out, "index.html"))) throw new Error("export produced no index.html");
// Shared data: a small PHP endpoint (runs on any PHP host; without PHP the demo stays per-browser).
cpSync(path.join(root, "demo/static/demo/sync.php"), path.join(out, "demo/sync.php"));
writeFileSync(path.join(out, "DEMO-README.txt"), readFileSync(path.join(root, "demo/static/DEMO-README.txt"), "utf8").replaceAll("{{BASE}}", BASE || "/"));

// ── 4. zip ──────────────────────────────────────────────────────────────────
if (!args["no-zip"]) {
  mkdirSync(distDir, { recursive: true });
  const zipPath = path.join(distDir, zipName);
  rmSync(zipPath, { force: true });
  run("zip", ["-qr9X", zipPath, "."], { cwd: out });
  log(`zip → ${path.relative(root, zipPath)} (${Math.round(statSync(zipPath).size / 1024 / 1024 * 10) / 10} MB)`);
}
log("done");
