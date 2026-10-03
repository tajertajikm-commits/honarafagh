# Static demo (no server, no database)

A self-contained **demo** of the whole platform: storefront, customer account and every
internal workspace. It is plain static files that run entirely in the visitor's browser.
You can host it in a sub-folder of any shared host (cPanel `public_html`) with no
database, Node.js, cron, Redis, Docker or API keys.

> This is **not** the production deployment. Production runs on Next.js + PostgreSQL
> ([setup.md](setup.md)). The demo reuses the production code as it is: nothing was
> removed or simplified to make it.


## Shared data on PHP hosts

`demo/sync.php` (copied into the export) turns the demo into a shared one when the host runs PHP:

- Each tab runs the app on an in-memory PGlite: seed snapshot plus every change in the shared log.
- Writes are captured row by row by triggers (`demo/runtime/sync-sql.ts`) and pushed right after each request (`demo/runtime/sync.ts`).
- Other tabs pull every 3 seconds and re-render, but never while someone is typing or has a dialog open.
- The PHP side is an append-only log with optimistic concurrency (`base` must equal `head`, otherwise 409 → pull, then push again).
- Sessions are per tab (sessionStorage), so different users can work side by side in one browser.
- "Reset demo" clears the shared log for everyone.
- Without PHP the endpoint is missing and the demo falls back to the per-browser mode described below.

## Download

`demo-dist/printing-house-demo.zip` in this repository (about 15 MB):
<https://github.com/tajertajikm-commits/honarafagh/blob/claude/dreamy-brahmagupta-btpy8q/demo-dist/printing-house-demo.zip>
Open the link and click **Download raw file**.

## Deploy on cPanel

1. **File Manager** → `public_html` → **+ Folder** → `printing-demo`.
2. Open `public_html/printing-demo/` → **Upload** → `printing-house-demo.zip`.
3. Right-click the ZIP → **Extract** into `public_html/printing-demo/`.
   `index.html`, `_next/`, `demo/` and `.htaccess` must sit **directly** inside
   `printing-demo/`, not in a nested folder. You can then delete the ZIP.
4. Open `https://YOUR-DOMAIN/printing-demo/`.

The first visit downloads a database snapshot of about 8 MB and prepares it (a few
seconds, with a progress screen). Later visits start instantly.

The included `.htaccess` sets the `.wasm`/`.tgz` MIME types, compression, caching and the
404 page. Hosts that ignore `.htaccess` still work, as long as they serve `.wasm` as
`application/wasm`.

### A different folder name

The ZIP is built for `/printing-demo/`. For another folder (or the domain root), rebuild it:

```bash
pnpm install
node demo/build.mjs --base=/my-folder     # or --base=  for the domain root
# → demo-dist/printing-house-demo.zip
```

## URL structure

| URL | What |
|---|---|
| `/printing-demo/` | Storefront home |
| `/printing-demo/products/`, `/printing-demo/p/item/?__id=business-card` | Catalogue and product configurator |
| `/printing-demo/cart/`, `/checkout/`, `/payment/sandbox/`, `/payment/result/` | Purchase flow |
| `/printing-demo/login/` | Customer OTP login |
| `/printing-demo/account/…` | Customer account (orders, invoices, profile) |
| `/printing-demo/panel/login/` | Staff login |
| `/printing-demo/panel/…` | Staff panel (my work, dashboard, Digital/Offset queues, orders, accounting, …) |

Static hosting cannot answer `/orders/<id>` without server rewrites. Each detail page is
therefore exported once, as `…/item/`, and the id travels as `?__id=<id>`. Links do this
automatically.

## Logging in

### Customers (OTP)

1. **ورود** → enter **any** Iranian mobile number (for example `09351234567`) → **دریافت کد تأیید**.
2. The code is shown on screen: **«حالت نمایشی — کد تأیید: 48372»**. It also appears
   in the DEMO MODE panel under "OTPs".
3. Enter it. A new number creates a new customer, with its own profile, cart, orders,
   quotes and notifications.

This is the real OTP code path (`src/server/auth/otp.ts`):

* A new random 5-digit code is generated for every request.
* Codes expire after **2 minutes**.
* At most **5 attempts** per code.
* A new code can be requested **once per minute** per number (6 per hour).

Only the delivery is simulated: the fake SMS provider (`src/server/integrations/sms/fake.ts`)
records the code instead of sending it. The code is echoed back only when
`OTP_PROVIDER=fake` **and** (`NODE_ENV≠production` or `DEMO_MODE=true`). With
`OTP_PROVIDER=smsir` (production) the code is never exposed.

The seeded customers `09121111111`, `09122222222` … `09126666666` already have orders.
They log in the same way.

### Staff (demo identities)

Log in at `/panel/login/` with password **`honar1405`** for all accounts, or use the
**DEMO MODE** panel (bottom-left) to switch role with one click:

| Mobile | Name | Role(s) |
|---|---|---|
| 09120000001 | مهدی تاجر تاجیک | Manager (مدیرعامل), sees everything |
| 09120000002 | سارا محمدی | Sales |
| 09120000003 | رضا کریمی | Accountant |
| 09120000004 | علی احمدی | Warehouse + Procurement |
| 09120000005 | نگار حسینی | Designer |
| 09120000006 | امیر رستمی | Prepress + Lithography |
| 09120000007 | حسن مرادی | Offset operator |
| 09120000008 | مریم صادقی | Digital operator |
| 09120000009 | جواد نوری | Cutting, Lamination, UV |
| 09120000010 | کاوه یزدانی | Binding, Finishing, Packaging |
| 09120000011 | فاطمه رحمانی | Quality control |
| 09120000012 | بهروز قاسمی | Shipping |

These identities exist only in the demo seed snapshot. Production authentication
(scrypt password hashes, server-side sessions, permission checks on every API call) is
unchanged, and the demo runs through the same code.

## Payment

Checkout goes to the **sandbox gateway** page, which has three outcomes:

| Button | Result |
|---|---|
| پرداخت موفق | Payment verified; the payment is recorded on the order |
| پرداخت ناموفق (رد توسط بانک) | The bank callback returns, verification fails, the attempt is recorded as failed and the order stays unpaid |
| انصراف | Cancelled by the user; the attempt is recorded as cancelled |

The customer can retry from the order page. The gateway is the fake provider
(`src/server/integrations/payment/fake.ts`) behind the same `PaymentProvider` interface
that the real Iranian gateway adapter will implement. Callback, verify, idempotency and
the ledger entries are the production code.

## How the demo works

* **Database:** the real PostgreSQL schema and migrations run on **PGlite** (PostgreSQL
  compiled to WebAssembly). It is stored in the browser's **IndexedDB**, so data survives
  refreshes and browser restarts. All screens (storefront, customer account, every staff
  workspace) read and write this **one** database. An order placed by a customer is the
  same row that sales, prepress, operators, QC, shipping and accounting see and change.
* **Seed:** at build time, `demo/seed/build-seed.ts` runs the real migrations and the real
  seed (`seedReference` + `seedDemo`) and dumps the database to `demo/seed.tgz`.
  The seed holds products and price lists, Offset and Digital orders at every stage,
  machines and workstations, inventory, employees, suppliers, invoices and notifications.
  Inventory covers paper, cardboard, lamination film, UV, binding materials, plates and
  packaging. On the first visit, dates are shifted so that the seed looks recent.
* **API:** the real HTTP route table (`src/server/http`) runs in the browser. `fetch('/api/v1/…')`
  and uploads are intercepted and handled by the same handlers, validation, permission
  checks, domain services, workflow engine, pricing engine, outbox and notifications.
* **Pages:** server pages run client-side through thin generated wrappers
  (`demo/runtime/render.tsx`). The build pipeline is `demo/build.mjs`. The repository's
  `src/` is not modified: the build works on a copy.
* **One tab at a time:** a database can have only one writer. Opening a second tab takes
  over the data, and the first tab shows a notice.
* **Per browser:** every visitor has their own copy. Nothing is shared between visitors.

## Reset

**DEMO MODE** → **بازنشانی دمو** → confirm. This deletes the browser database, the demo
cookies and local storage, and reloads the original seed. Clearing site data in the
browser has the same effect.

The DEMO MODE panel exists only in the static demo build (`demo/runtime/DemoShell.tsx`,
injected by `demo/build.mjs`). It is not part of the production app.

## What is simulated

| Area | In the demo |
|---|---|
| SMS / OTP | Fake provider; the code is shown on screen |
| Bank gateway | Sandbox page (success / failed / cancelled) |
| Holoo accounting | Sync jobs are queued in the outbox but not sent (fake adapter) |
| File storage | Uploaded files are kept inside the browser database |
| Background worker / cron | Outbox jobs run inline right after each request |
| Email / external couriers | Not sent; in-app notifications only |

Everything else runs the real production code in the browser:

* customer accounts and carts
* pricing, checkout, orders, invoices and payments ledger
* orders in every stage of the Digital and Offset flows
* QC, packaging, delivery
* inventory reservations and consumption
* employees and permissions
* notifications and reports

## What needs real integrations in production

* **SMS.ir** (`OTP_PROVIDER=smsir`, `SMSIR_API_KEY`, template id). See [integrations.md](integrations.md).
* **Zarinpal payment gateway** (`PAYMENT_PROVIDER=zarinpal`, merchant id). The adapter is implemented but has not been tested with a real merchant.
* **Holoo** (connector credentials; the adapter interface is ready but not connected).
* **PostgreSQL**, **object storage** (S3-compatible or local disk), and the **worker**
  process for the outbox and scheduled jobs. See [setup.md](setup.md).

## Limits of the demo

* The first load needs a modern browser with WebAssembly and IndexedDB. Private windows
  in some browsers discard IndexedDB when closed.
* Heavy pages (home page start prices, reports) take a moment on slow phones: PostgreSQL
  runs in the browser.
* Trigram (`pg_trgm`) search indexes are skipped. Search still works, just without those
  indexes.

## Rebuilding and testing

```bash
pnpm demo:build                     # seed + static export + ZIP  (= node demo/build.mjs)
node demo/build.mjs --skip-seed     # reuse demo/.build/seed.tgz
pnpm demo:typecheck
# serve it under the sub-folder, as a host would:
mkdir -p demo/.build/serve && ln -sfn ../site/out demo/.build/serve/printing-demo
python3 -m http.server 4173 --directory demo/.build/serve &
pnpm demo:test                      # journey + coverage under /printing-demo/
```
