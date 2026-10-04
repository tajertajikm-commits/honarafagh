# هنر آفاق — Printing House Operating Platform

A Persian/RTL-first platform that runs the Honar Afagh printing house as it actually works:
store purchases and custom orders, one approval gate with a per-order station plan,
separate Digital and Offset production flows (outsourced lithography, paper quotes with
manager approval, press assignment, mandatory manager QC), audited priority, shipping,
accounting with official and unofficial invoices, and a six-stage status for the customer.
See [docs/workflows.md](docs/workflows.md).

## Quick start

```bash
# Requirements: Node 22+, pnpm 10, PostgreSQL 16
cp .env.example .env          # defaults run in demo mode with fake providers
pnpm install
pnpm db:migrate               # applies drizzle/*.sql
pnpm db:seed                  # clean start: staff, roles, machines, store catalogue (no made-up orders, suppliers or stock)
pnpm db:seed:samples          # …or with sample customers, orders, suppliers and stock (tests, walkthroughs)
pnpm dev                      # http://localhost:3000
```

| Where | Login |
|---|---|
| Store `/login` | any demo customer mobile, e.g. `09121111111`; in demo mode the OTP is shown on screen (fake SMS provider) |
| Staff panel `/panel/login` | `09120000001` … `09120000007`, password `honar1405` (override with `SEED_STAFF_PASSWORD`) |

Demo staff (placeholder phones): 01 Hamed Noorsalehi (manager), 02 Labafi (digital manager),
03 Azad (digital operator), 04 Hossein Abdali (accountant), 05 Gholipour (lithography & offset),
06 Mojtaba Hajghasemi (offset production), 07 Memarian (design). See [permissions](docs/permissions.md).

### Shared live demo (one link for everyone)

[`demo-dist/honarafagh-server.zip`](demo-dist/honarafagh-server.zip) is the full app as one
Node.js folder with an embedded PostgreSQL (PGlite) and the seeded demo data. No database
server is needed. Upload it to any host with Node.js 20+ (cPanel «Setup Node.js App», startup
file `app.js`, set `APP_URL`) and everyone who opens the link works on the same data: the client
places an order, staff move it forward in other tabs or devices. Instructions in Persian are in
`README.txt` inside the zip. Rebuild it with `node scripts/build-server-package.mjs`.

### Static demo (no server)

[`demo-dist/printing-house-demo.zip`](demo-dist/printing-house-demo.zip) is a self-contained demo of
the whole platform that runs in the browser (PostgreSQL as WebAssembly, stored in
IndexedDB). Extract it into `public_html/printing-demo/` and open `https://your-domain/printing-demo/`:
no database, Node.js or API keys needed. On a PHP host (any cPanel) a tiny `demo/sync.php` shares the data between
everyone who opens the link: the client registers and orders on their phone, staff see it in the panel within
seconds, and each browser tab has its own sign-in. Without PHP each browser keeps its own data.
See [docs/static-demo.md](docs/static-demo.md).

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js app |
| `pnpm worker` | Outbox dispatcher + periodic jobs (run separately in production, `WORKER_INLINE=false`) |
| `pnpm typecheck` / `pnpm lint` | TypeScript strict / ESLint |
| `pnpm test` | Unit + integration tests (Vitest, uses database `honar_test`) |
| `pnpm test:e2e` | Playwright end-to-end tests (desktop + mobile) |
| `pnpm db:migrate` / `db:seed` / `db:seed:samples` / `db:reset` | Database lifecycle (`db:seed` is clean; `db:seed:samples` adds sample data) |

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Order workflow (Digital & Offset)](docs/workflows.md)
- [Pricing](docs/pricing.md)
- [Roles and permissions](docs/permissions.md)
- [Integrations](docs/integrations.md)
- [Environment variables](docs/environment.md)
- [Setup and deployment](docs/setup.md)
- [Testing](docs/testing.md)
- [HTTP API](docs/api.md)
- [Static demo (cPanel, no server)](docs/static-demo.md)

## Integration status (honest)

| Integration | Status |
|---|---|
| SMS.ir (OTP + notifications) | Implemented against the documented REST API; **not tested against a live account** (needs API key, template id, line number) |
| Zarinpal (online payment) | Implemented (REST v4 request/verify, sandbox flag); **not tested with a real merchant id** |
| S3 storage | Adapter implemented; requires installing `@aws-sdk/client-s3` and credentials |
| Holoo accounting | Adapter boundary only. Issued invoices and payments are queued; **no Holoo API calls are made** until the API specification and credentials are available |
| External lithography | Manual by design: status, supplier, dates and cost are recorded; no API |
| Shipping | Manual: method, responsible person/carrier, tracking code and status are recorded; no carrier API |
| Invoice PDF | Print-ready A4 page; PDF via the browser's «Save as PDF» (no server-side PDF renderer) |

Fonts: the Abar Low font files were provided by the owner. Confirm the font
licence before publishing this repository publicly.
