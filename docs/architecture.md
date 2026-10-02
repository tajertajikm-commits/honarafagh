# Architecture

## Stack

- **Next.js 16 (App Router, React 19, Turbopack)**: storefront, staff panel and a single versioned HTTP API (`/api/v1/*`), all in one deployable.
- **TypeScript (strict, `noUncheckedIndexedAccess`)** end to end.
- **PostgreSQL 16 + Drizzle ORM** (SQL migrations in `drizzle/`). Integrity lives in the database: CHECK constraints, partial unique indexes, generated columns and append-only triggers.
- **Tailwind CSS v4** with design tokens (`src/app/globals.css`), RTL through logical properties, light/dark themes, and the provided Abar Low fonts.
- **Zod** validates every input (env, API bodies, JSON configuration such as pricing rules, product specs and workflow steps).
- **Vitest** for unit and integration tests (against a real Postgres) and **Playwright** for end-to-end tests.

## Layers

```
src/app/(store)        customer website (mobile-first)
src/app/panel          staff workspaces (desktop-first), server components
src/app/api/v1/[...]   single catch-all → typed router (src/server/http/router.ts)
src/components         UI kit (ui/), brand/, store/, panel/
src/server
  config/env.ts        validated environment
  core/                Ctx (actor, db, tx, request metadata), errors
  auth/                permissions catalog, sessions, OTP, passwords, rate limits
  http/                router, route helpers, API route modules, page session helpers
  modules/<domain>/    domain services (the only place business rules live)
  integrations/        sms, payment, storage, accounting, delivery (provider interfaces)
  events/              transactional outbox + worker
  db/                  schema, client
  seed/                reference data + demo scenario
```

### One service layer for every entry point

REST handlers, server components, the worker and the seed all call the same
domain services with a `Ctx`:

```ts
interface Ctx { actor; db; inTx; requestId; ip; userAgent; afterCommit }
```

- `assertCan(ctx, "inventory.issue")` enforces **action permissions in the service**, never only in the UI.
- `inTx(ctx, fn)` opens a transaction or joins the current one, so services compose atomically. A confirmed order's reservations, events, audit rows and outbox messages commit or roll back together.
- `audit(ctx, …)` writes the audit row inside the same transaction.
- `emit(ctx, event)` writes to the outbox inside the same transaction. Side effects (SMS, accounting sync) run after commit.

### Order state is multi-domain

An order carries independent state domains: `status`, `paymentStatus`,
`fileStatus`, `procurementStatus`, `productionStatus`, `qcStatus` and
`deliveryStatus`. Each is **derived** from its own records (payments, artwork
versions, material requirements, production tasks, QC inspections, shipments)
by pure functions in `orders/state.ts`, then recomputed after every change.
The overall status only reaches `COMPLETED` when the order is delivered **and**
paid. Every derived change writes an `order_event`, which feeds the customer
timeline and the staff history.

### Production

`workflow/engine.ts` creates one step per station the approver selected (see
[workflows](workflows.md)). Steps become `READY` when every selected step of earlier
phases is done; stations that need artwork wait for the approved file or design.
Rework creates new attempts of the same step key, so history is never
overwritten.

### Scheduling

`scheduling/` runs a finite-capacity list scheduler over ready and pending
tasks. It uses the configured work calendar, machine capacity, maintenance
windows and expected material arrival (purchase order dates). It produces a
projected completion time per order, late-risk flags and the machine load
shown on the control center and machines pages.

### Inventory

Stock only changes through `moveStock`, which performs a guarded atomic
`UPDATE stock_levels` and inserts an append-only `inventory_transactions`
row in the same transaction. The CHECK constraints `on_hand ≥ 0` and
`reserved ≤ on_hand` make over-reservation impossible even under concurrent
requests (covered by a 10-way race test). Requirements per order item track
required/reserved/issued/consumed/wasted/returned.

### Events and worker

Services emit to `outbox_events`. The worker (`pnpm worker`, or inline in dev)
claims batches with `FOR UPDATE SKIP LOCKED`, dispatches notifications (SMS +
in-app, deduplicated) and accounting sync, and retries with backoff. Periodic
jobs clean up sessions and OTPs.

### Security

- Opaque session tokens (only the SHA-256 hash is stored); separate cookies for staff (12 h) and customers (30 d); `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- Staff passwords use scrypt. Customer login uses OTP (HMAC-stored code, 5 attempts max, rate limited).
- Same-origin check on mutating API calls; DB-backed fixed-window rate limits on login, OTP, tracking and pricing.
- IDOR protection: every read of orders, files, payments and invoices checks ownership (customer) or permission (staff).
- Uploads: magic-byte sniffing, per-purpose allow lists, size caps, random storage keys, never overwritten, served through an authorised route.
- Drizzle parameterised queries only; React escaping; security headers in `next.config.ts`.
- Secrets only from environment variables. Production refuses to start with the default session secret or fake providers unless `DEMO_MODE=true`.

### UI

- The storefront is mobile-first, with a bottom navigation, a sticky price bar in the configurator and OTP login.
- The panel is desktop-first. Each person lands on «کارهای من» (only what they can act on now); managers land on the control center. Digital and Offset queues, accounting, customers and admin pages sit alongside it.
- Numbers use Persian digits and toman. Identifiers (phones, SKUs, tracking codes) stay Latin inside LTR isolates. The bullet `•` is the separator, because the middle dot `·` is indistinguishable from the Persian zero `۰`.
