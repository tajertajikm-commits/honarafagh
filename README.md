# هنر آفاق — Printing House Operating Platform

A Persian/RTL-first platform that runs a printing house end to end: the
customer store and configurator, versioned dynamic pricing, quotations, a
multi-domain order engine, configurable production workflows (separate Offset
and Digital), capacity scheduling, transaction-based inventory, procurement,
QC and rework, delivery, finance, role-based workspaces, audit and reports.

## Quick start

```bash
# Requirements: Node 22+, pnpm 10, PostgreSQL 16
cp .env.example .env          # defaults run in demo mode with fake providers
pnpm install
pnpm db:migrate               # applies drizzle/*.sql
pnpm db:seed                  # reference data + demo orders in every state
pnpm dev                      # http://localhost:3000
```

| Where | Login |
|---|---|
| Store `/login` | any demo customer mobile, e.g. `09121111111`; in demo mode the OTP is shown on screen (fake SMS provider) |
| Staff panel `/panel/login` | `09120000001` (manager) … `09120000012`, password `honar1405` (override with `SEED_STAFF_PASSWORD`) |

Demo staff: 01 manager, 02 sales, 03 accountant, 04 warehouse + procurement,
05 designer, 06 prepress/plates, 07 offset operator, 08 digital operator,
09 cutting/lamination/UV, 10 binding/finishing/packaging, 11 QC, 12 shipping.

### Static demo (no server)

[`demo-dist/printing-house-demo.zip`](demo-dist/printing-house-demo.zip) is a self-contained demo of
the whole platform that runs in the browser (PostgreSQL as WebAssembly, stored in
IndexedDB). Extract it into `public_html/printing-demo/` and open `https://your-domain/printing-demo/`:
no database, Node.js or API keys needed. See [docs/static-demo.md](docs/static-demo.md).

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js app |
| `pnpm worker` | Outbox dispatcher + periodic jobs (run separately in production, `WORKER_INLINE=false`) |
| `pnpm typecheck` / `pnpm lint` | TypeScript strict / ESLint |
| `pnpm test` | Unit + integration tests (Vitest, uses database `honar_test`) |
| `pnpm test:e2e` | Playwright end-to-end tests (desktop + mobile) |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Database lifecycle (`db:seed --reference-only` skips demo orders) |

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Workflow engine](docs/workflows.md) · [Offset workflow](docs/offset-workflow.md) · [Digital workflow](docs/digital-workflow.md)
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
| Holoo accounting | Adapter boundary only. Events are queued; **no Holoo API calls are made** until the API specification and credentials are available |
| Delivery providers | Manual/internal courier implemented; external providers plug into the delivery provider registry |

Fonts: the Abar Low font files were provided by the owner. Confirm the font
licence before publishing this repository publicly.
