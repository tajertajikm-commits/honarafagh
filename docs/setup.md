# Setup and deployment

## Local development

```bash
# Node 22+, pnpm 10, PostgreSQL 16
createuser -P honar          # password: honar (or adjust DATABASE_URL)
createdb -O honar honar
createdb -O honar honar_test # for the test suite
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed                 # clean start; db:seed:samples adds sample data
pnpm dev
```

`pnpm db:reset` drops and re-migrates the database named in `DATABASE_URL`. It
refuses to run with `NODE_ENV=production` unless `--force` is passed.

The seed creates reference data: 5 machines (including 1-, 4- and 8-colour presses), the material
list at zero stock (store pricing uses it), store products with options, a published pricing version,
7 roles and the 7 staff members, shipping methods, notification templates, and seller and invoice
settings. There are no customers, orders, suppliers or stock. `pnpm db:seed:samples` adds sample
suppliers, stock, 6 customers and about 23 orders covering every stage of both flows.

## Single-server mode (embedded database)

`DATABASE_URL=pglite:./data/db` runs PostgreSQL embedded in the app process (PGlite),
persisted to that folder. Migrations and seed work the same (`pnpm db:migrate`, `pnpm db:seed`).
Only one process may open the folder: keep `WORKER_INLINE=true` and stop the app before running
scripts. Suitable for the shared demo and a small installation. Use a real PostgreSQL server
for production at scale. `node scripts/build-server-package.mjs` builds the ready-to-upload
package (`demo-dist/honarafagh-server.zip`).

## Production

1. Provision PostgreSQL 16 (with `pg_trgm`, created by migration 0000) and persistent storage for uploads, or S3.
2. Set the environment (see [environment](environment.md)): `NODE_ENV=production`, a real `SESSION_SECRET`, `APP_URL` (https), `WORKER_INLINE=false`, and real providers (or `DEMO_MODE=true` for a demo site).
3. Build and migrate:
   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm db:migrate
   pnpm db:seed                    # first install only (clean, no sample data)
   ```
4. Run two processes (systemd, PM2, or two containers from the same image):
   ```bash
   pnpm start      # web (port 3000, behind an https reverse proxy)
   pnpm worker     # outbox dispatcher + periodic jobs
   ```
   Several web instances are safe: the worker claims outbox rows with `SKIP LOCKED`, and all state changes are transactional. With more than one web instance, use S3 storage or a shared volume.
5. Point the Zarinpal callback domain at `APP_URL`. The callback path is `/api/v1/payments/callback/zarinpal`.
6. Change the demo staff passwords, or create real employees and deactivate the demo ones, in `/panel/employees`.

Backups: the database holds everything, including audit and ledger. Back up
PostgreSQL (e.g. `pg_dump` nightly plus WAL archiving) and the upload storage.
