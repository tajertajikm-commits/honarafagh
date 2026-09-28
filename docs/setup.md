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
pnpm db:seed                 # --reference-only for an empty business
pnpm dev
```

`pnpm db:reset` drops and re-migrates the database named in `DATABASE_URL`. It
refuses to run with `NODE_ENV=production` unless `--force` is passed.

The seed creates reference data (methods, machine and step types, 13 machines,
materials and stock, suppliers, 6 products with options, a published pricing
version, Offset and Digital workflows, 18 roles, 12 employees, delivery
methods, notification templates) and a demo scenario: 6 customers,
backdated completed orders for reports, and live orders in every state
(shortage with a purchase order, printing, QC rework, waiting for file, ready,
out for delivery, proof awaiting approval, blocked prepress), plus an inquiry, a
sent quote and scheduled maintenance.

## Production

1. Provision PostgreSQL 16 (with `pg_trgm`, created by migration 0000) and persistent storage for uploads, or S3.
2. Set the environment (see [environment](environment.md)): `NODE_ENV=production`, a real `SESSION_SECRET`, `APP_URL` (https), `WORKER_INLINE=false`, and real providers (or `DEMO_MODE=true` for a demo site).
3. Build and migrate:
   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm db:migrate
   pnpm db:seed --reference-only   # first install only
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
