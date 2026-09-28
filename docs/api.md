# HTTP API (`/api/v1`)

A single catch-all route (`src/app/api/v1/[...path]/route.ts`) dispatches to a
typed router (`src/server/http/router.ts`). Each route declares:

- **auth**: `public`, `customer`, `staff` or `any` (customer or staff). Permission checks happen inside the domain services.
- **body / query**: Zod schemas. Invalid input returns `400 VALIDATION` with field issues.
- URL `:id` parameters must be UUIDs.

Conventions:

- JSON in and out. Success is `{ "data": … }`; errors are `{ "error": { "code", "message", "details" } }`. Messages are Persian and user-facing. Codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`, `INSUFFICIENT_STOCK`, `RATE_LIMITED` (with `Retry-After`).
- Authentication uses cookies: `ha_session` (customer), `ha_staff` (staff), `ha_cart` (guest cart).
- Mutations require a same-origin `Origin`/`Referer`.
- Money is in rial. Idempotency keys (`idempotencyKey`) are accepted on checkout, payments, refunds, goods receipts and material issues.

## Routes

**Auth & account**: `POST auth/otp/request`, `POST auth/otp/verify`, `POST auth/logout`,
`POST staff/auth/login`, `POST staff/auth/logout`, `POST account/addresses`,
`DELETE account/addresses/:id`, `PATCH customers/:id` (customers: own profile).

**Catalog & pricing**: `GET catalog/categories`, `GET catalog/products`,
`GET catalog/products/by-slug/:slug`, `POST pricing/quote` (public price, rate
limited), `POST pricing/staff-quote`, `POST pricing/simulate`,
`GET pricing/rule-sets`, `GET|PUT pricing/versions/:id`,
`POST pricing/versions/:id/draft|publish|discard`,
`POST catalog/products`, `PUT catalog/products/:id`,
`POST catalog/products/:id/active`, `POST catalog/categories`.

**Cart & checkout**: `GET cart`, `POST cart/items`, `PATCH|DELETE cart/items/:id`, `POST checkout`.

**Orders**: `GET orders`, `GET orders/:id` (scoped to the caller), `GET track` (number +
phone, public, rate limited), `POST orders` (manual order), `POST orders/:id/confirm|hold|resume|cancel|priority|discount|deposit|force-status|reorder|change-requests`,
`POST order-items/:id/price`, `POST change-requests/:id/resolve`.

**Files & artwork**: `POST uploads` (multipart; sniffed and size-checked),
`GET files/:id` (authorised download/inline), `POST order-items/:itemId/artwork`,
`POST artwork/:id/review|send-proof` (staff), `POST artwork/:id/decision` (customer).

**Payments**: `POST orders/:id/pay` (online), `GET payments/callback/:provider`
(gateway return; idempotent), `POST orders/:id/payments` (manual; customer
transfer receipts go to approval), `POST payments/:id/approve|reject`,
`POST orders/:id/refunds`.

**Production**: `GET production/my-queue|board|schedule`, `GET production/tasks/:id`,
`POST production/tasks/:id/start|pause|resume|complete|issues|inspection|assign|skip|cancel`,
`POST production/issues/:id/resolve`, `POST production/jobs/:id/priority|reopen`.

**Inventory & procurement**: `POST inventory/requirements/:id/reserve|release|issue|return`,
`POST inventory/receive|adjust|write-off`, `POST procurement/requests`,
`POST procurement/requests/:id/cancel`, `POST procurement/purchase-orders`,
`POST procurement/purchase-orders/:id/submit|cancel|receive`, `POST procurement/suppliers`.

**Delivery**: `POST orders/:id/shipments`, `POST shipments/:id/assign|dispatch|complete|fail|cancel`.

**Sales**: `POST inquiries`, `POST inquiries/:id/status`, `POST quotes`,
`POST quotes/:id/send|accept|reject`.

**Machines**: `POST machines`, `POST machines/:id/status`,
`POST machines/:id/maintenance`, `POST maintenance/:id/start|complete|cancel`.

**People & admin**: `GET|POST customers`, `POST employees`, `PATCH employees/:id`,
`PUT employees/:id/roles`, `POST employees/:id/password`, `POST roles`,
`GET workflows`, `GET|PUT workflows/:id`, `POST workflows/:id/draft|activate`,
`PUT settings/:key`.

**Platform**: `GET search` (staff global search), `GET notifications`, `POST notifications/read`.
