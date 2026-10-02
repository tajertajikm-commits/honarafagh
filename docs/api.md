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
- Money is in rial. Idempotency keys (`idempotencyKey`) are accepted on checkout, custom orders, payments and refunds.

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

**Orders**: `GET orders`, `GET orders/:id`, `GET track?code&phone` (public, rate limited),
`POST orders/custom`, `POST orders/:id/reply|cancel|artwork` (customer or staff),
`POST orders/:id/approve|reject|request-info|price|priority` (staff).

**Artwork & design**: `POST uploads`, `GET files/:id`, `POST artwork/:id/review`, `POST orders/:id/design/start|complete`.

**Production**: `GET queues/digital|offset`, `GET my-work`, `POST steps/:id/start|complete|quality|machine|assign`.

**Offset procurement**: `POST orders/:id/paper-quotes`, `DELETE paper-quotes/:id`, `POST orders/:id/paper-decision`, `POST orders/:id/paper-received`, `PUT orders/:id/litho`.

**Shipping**: `POST orders/:id/dispatch`, `POST orders/:id/delivered`.

**Payments & invoices**: `POST orders/:id/pay` (online), `GET payments/callback/:provider`, `POST orders/:id/payments` (manual; customer transfer receipts await approval), `POST payments/:id/approve|reject`, `POST orders/:id/refunds`, `POST orders/:id/invoices`, `POST invoices/:id/void`.

**People & admin**: `GET|POST customers`, `POST employees`, `PATCH employees/:id`,
`PUT employees/:id/roles`, `POST employees/:id/password`, `POST roles`,
`POST materials`, `POST materials/:id/stock`, `POST suppliers`, `PUT settings/:key`.

**Platform**: `GET search` (staff global search), `GET notifications`, `POST notifications/read`.
