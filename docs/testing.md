# Testing

| Layer | Tool | Command | Database |
|---|---|---|---|
| Unit | Vitest | `pnpm test` | none |
| Integration | Vitest | `pnpm test` | `honar_test` (reset automatically; refuses any DB without `_test`) |
| End-to-end | Playwright | `pnpm test:e2e` | the dev database, seeded (`pnpm db:reset && pnpm db:seed`) |

## Unit (48 tests)

- `pricing-engine.test.ts`: imposition and fit count, offset vs digital costing, plates/make-ready/waste, stock sheet yield, operations by every basis, markup tiers, urgency, discounts, minimum order, rounding, VAT, method selection, validation errors.
- `workflow-graph.test.ts`: condition evaluation, pruning with transitive dependencies, parallel branches, readiness with drying lag, rework paths, template validation (cycles, unknown dependencies, QC targets).
- `scheduling.test.ts`: work calendar (Tehran time, rollover, Thursday half-day, Friday off), dependencies, spreading across machines by priority, maintenance windows, gates clearing later (paper arriving), late detection, missing machine types.

## Integration (41 tests)

- `seed.test.ts`: reference data integrity.
- `inventory.test.ts`: every transaction type, partial reservation plus a shortage request, allocation on receipt, the append-only ledger, and a **10-way concurrent reservation race** that never over-reserves.
- `order-lifecycle.test.ts`: the full scenario of 100 notebooks with the design service: price snapshot, confirmation, reservations, proof rejected/approved, parallel gates, printing with pause/block/resume, consumption and waste, drying lag, final QC rejection and rework, **back-flushed operation supplies**, a delivery blocked until settled, partial and full delivery, completion only when delivered and paid, a customer-safe timeline and audit. Also an offset order through the flowchart workflow, and cancellation rules.
- `payments-pricing.test.ts`: online payment callback idempotency, manual payment approval, refunds, deposit gate, pricing versions (immutability, publish permission, snapshots unaffected), quotes.
- `delivery-rules.test.ts`: the settlement gate (open balance blocked; customer credit limit; manager override; setting switch; fully paid).

## End-to-end (8 tests)

- Customer (desktop): browse → configure → cart → OTP login → checkout → sandbox payment → order page → tracking.
- Customer (mobile, Pixel 7): demo customer's order history and a proof awaiting approval.
- Staff (desktop):
  - Manager: login → control center → manual order with live pricing.
  - Warehouse: issue reserved material → receive a purchase order → ledger.
  - Operator: start and finish a step at the station.
  - Operator: forbidden from other workspaces and APIs.
  - Accountant: settles a balance.
  - Shipping: creates and hands over the shipment, and the order completes.

E2E tests mutate the demo data; reseed afterwards.

## Other checks

`pnpm typecheck` (strict), `pnpm lint` (ESLint 9 + Next + React compiler rules; zero
warnings), `pnpm build`.
