/**
 * Entry point of the self-contained server package (cPanel «Setup Node.js App»
 * startup file, or `node app.js` on any server with Node.js 20+).
 *
 * Settings come from environment variables, or from `config.env` next to this
 * file. The embedded database lives in ./data/db and is shared by everyone
 * who opens the site: customers, staff and the manager see the same orders.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
process.chdir(root);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnvFile(path.join(root, "config.env"));

const defaults = {
  NODE_ENV: "production",
  DATABASE_URL: "pglite:./data/db",
  DEMO_MODE: "true",
  WORKER_INLINE: "true",
  OTP_PROVIDER: "fake",
  SMS_PROVIDER: "fake",
  PAYMENT_PROVIDER: "fake",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./data/files",
  ACCOUNTING_PROVIDER: "internal",
  HOSTNAME: "0.0.0.0",
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;

// A random session secret, created once and kept with the data (never shipped in the package).
if (!process.env.SESSION_SECRET) {
  const file = path.join(root, "data", ".session-secret");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), { mode: 0o600 });
  process.env.SESSION_SECRET = fs.readFileSync(file, "utf8").trim();
}
if (!process.env.APP_URL) {
  console.warn("[honar] APP_URL is not set (e.g. https://demo.example.com); links in messages will point to localhost.");
  process.env.APP_URL = `http://localhost:${process.env.PORT || 3000}`;
}

// Sub-path builds (e.g. /printing-demo): some hosts (Passenger) strip the prefix before the
// request reaches the app, others don't. Accept both by restoring a missing prefix.
const base = (process.env.NEXT_PUBLIC_BASE_PATH || require("./base-path.json").basePath || "").replace(/\/+$/, "");
if (base) {
  const http = require("node:http");
  const createServer = http.createServer;
  http.createServer = function (...args) {
    const server = createServer.apply(this, args);
    const listeners = server.listeners("request");
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url !== base && !req.url.startsWith(base + "/") && !req.url.startsWith(base + "?")) req.url = base + (req.url === "/" ? "" : req.url);
      for (const l of listeners) l.call(server, req, res);
    });
    return server;
  };
}

const { installSeed } = require("./seed-install.js");

installSeed(root)
  .then(() => require("./server.js"))
  .catch((err) => {
    console.error("[honar] could not prepare the database", err);
    process.exit(1);
  });
