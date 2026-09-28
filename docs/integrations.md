# Integrations

Every external system sits behind an interface in `src/server/integrations/*`
and is selected by environment variables. Nothing is reported as "live" unless
it is actually configured, and even then it is shown as *configured* (not
verified) in `/panel/settings`.

## SMS / OTP: `integrations/sms`

| Provider | Selection | Notes |
|---|---|---|
| `FakeSmsProvider` | `OTP_PROVIDER=fake`, `SMS_PROVIDER=fake` | Logs messages. In development/demo the OTP is returned to the login form so the flow is testable. Forbidden in production unless `DEMO_MODE=true` |
| `SmsIrProvider` | `OTP_PROVIDER=smsir` / `SMS_PROVIDER=smsir` | OTP via `POST https://api.sms.ir/v1/send/verify` (template id plus parameter `SMSIR_OTP_PARAM_NAME`). Notifications via `/v1/send/bulk` from `SMSIR_LINE_NUMBER`. Header `X-API-KEY` |

**Status:** implemented to the published SMS.ir REST API, **not tested against a
live account.** To go live you need an API key, an approved verification
template containing the code parameter, and a line number.

OTP security: 5-digit code stored only as an HMAC (keyed by `SESSION_SECRET`),
2-minute expiry, 5 verification attempts, one code per phone per minute (6 per
hour) and per-IP limits on requesting and verifying.

## Online payment: `integrations/payment`

| Provider | Selection | Notes |
|---|---|---|
| Fake gateway | `PAYMENT_PROVIDER=fake` | An internal sandbox page (`/payment/sandbox`) that can succeed or fail. Clearly labelled; production requires `DEMO_MODE=true` |
| Zarinpal v4 | `PAYMENT_PROVIDER=zarinpal`, `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX` | `payment/request.json` → redirect to `StartPay/{authority}` → callback `/api/v1/payments/callback/zarinpal` → `payment/verify.json`. The callback locks the payment row and is idempotent (unique authority/ref id), so double callbacks cannot double-credit |

**Status:** implemented; **not tested with a real merchant id.** Amounts are sent
in rial.

## File storage: `integrations/storage`

`local` (default) writes under `STORAGE_LOCAL_DIR` with random keys and never
overwrites. `s3` targets any S3-compatible service (`S3_*` variables). The S3
adapter loads `@aws-sdk/client-s3` lazily; **install it** (`pnpm add @aws-sdk/client-s3`)
before enabling. Files are always served through the authorised route
`/api/v1/files/:id`.

## Accounting: `integrations/accounting`

- `internal` (default): finance lives in this platform; accounting events are marked *skipped*.
- `holoo`: the adapter boundary exists. Order, payment and refund events are recorded in `integration_links` with status **QUEUED** and the message "not implemented". **No Holoo API calls are made.** Holoo does not publish a public web API; implementing it needs the owner's Holoo version, its web service/API documentation and credentials (`HOLOO_BASE_URL`, `HOLOO_API_KEY`). Once available, only `HolooAccountingAdapter` needs to be written. Queued events can then be replayed.

## Delivery: `integrations/delivery`

A provider-independent registry. `ManualDeliveryProvider` covers the in-house
courier, pickup and external carriers where staff type the tracking code. An
automated carrier (e.g. a post or courier company API) implements `book()` and
`track()` and is selected per delivery method (`provider_code`).

## Notifications

Domain events go through the outbox to the notification dispatcher. Persian
templates (`notification_templates`) are stored per event and channel (SMS,
in-app), and deliveries are deduplicated per event/recipient/channel. The
worker retries failures with backoff.
