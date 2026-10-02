# Testing

| Layer | Tool | Command | Database |
|---|---|---|---|
| Unit | Vitest | `pnpm test` | none |
| Integration | Vitest | `pnpm test` | `honar_test` (reset automatically; refuses any DB without `_test`) |
| End-to-end | Playwright | `pnpm test:e2e` | the dev database, seeded (`pnpm db:reset && pnpm db:seed`) |

## Unit (34 tests)

- `pricing-engine.test.ts`: imposition, offset vs digital costing, operations, markup, urgency, discounts, rounding, VAT, method selection.
- `workflow.test.ts`: station plans (required stations, normalisation), phase readiness, derived order status, quality return targets, blocked reasons.

## Integration (36 tests)

- `workflows.test.ts`: the full **Digital** flow (customer → Labafi approval with station plan → artwork review → every station → Labafi QC → packaging → shipping → customer stage) and the full **Offset** flow (approval → litho ‖ paper → quotes → Hamed chooses supplier → press → priority with charge → print → Hamed print QC → post-press → Hamed final QC → packaging → shipping), plus permissions (who may approve, QC, choose suppliers), partial station plans, QC rejection and rework, design requests, reject / needs-info, pricing before payment, per-process queues and customer isolation.
- `payments-pricing.test.ts`: store checkout (server re-pricing, idempotency, a mixed cart split into one order per process), payment callbacks, transfer receipts, refunds, official/unofficial invoices with immutable snapshots, discount allocation, pricing versions.
- `seed.test.ts`, `actor-resolution.test.ts`.

## End-to-end (6 tests, `tests/e2e`)

- `workflows.spec.ts`: Digital and Offset flows through the real UI, each step logged in as the person who does it; the customer sees only the simplified stage; public tracking by code + phone; role isolation.
- `customer.spec.ts`: store purchase (configure → cart → OTP → checkout → sandbox payment) and a mobile account check.

Run against a freshly seeded database (`pnpm db:reset && pnpm db:seed`): the tests mutate data, and the OTP cooldown applies per phone.

Static demo: `pnpm demo:test` (see `demo/tests/playwright.config.ts`).

## Other checks

`pnpm typecheck` (strict), `pnpm lint` (ESLint 9 + Next + React compiler rules; zero
warnings), `pnpm build`.
