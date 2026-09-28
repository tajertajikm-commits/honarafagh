# Environment variables

All variables are validated at startup by `src/server/config/env.ts` (Zod). The
app refuses to start with invalid or inconsistent configuration. `.env.example`
is the complete, commented template. **Never commit real secrets.**

| Variable | Default | Required when | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | | `production` enables secure cookies and the production checks below |
| `DATABASE_URL` | `postgres://honar:honar@localhost:5432/honar` | always in production | PostgreSQL connection string |
| `APP_URL` | `http://localhost:3000` | production | Public base URL: payment callbacks and links in SMS |
| `SESSION_SECRET` | dev placeholder | **production** (≥ 32 chars) | HMAC key for OTP hashes. Production rejects the placeholder. Generate with `openssl rand -base64 48` |
| `DEMO_MODE` | `false` | | Shows demo hints; allows fake OTP/payment providers in production |
| `WORKER_INLINE` | `false` | | Runs the outbox dispatcher and jobs inside the web process (dev). Set `false` in production and run `pnpm worker` |
| `BUSINESS_TIMEZONE` | `Asia/Tehran` | | Business day calculations |
| `OTP_PROVIDER` | `fake` | | `fake` or `smsir` |
| `SMS_PROVIDER` | `fake` | | `fake` or `smsir` (notifications) |
| `SMSIR_API_KEY` | | `*_PROVIDER=smsir` | SMS.ir API key |
| `SMSIR_OTP_TEMPLATE_ID` | | `OTP_PROVIDER=smsir` | Approved verification template id |
| `SMSIR_OTP_PARAM_NAME` | `CODE` | | Template parameter that receives the code |
| `SMSIR_LINE_NUMBER` | | `SMS_PROVIDER=smsir` | Sender line for notifications |
| `PAYMENT_PROVIDER` | `fake` | | `fake` or `zarinpal` |
| `ZARINPAL_MERCHANT_ID` | | `PAYMENT_PROVIDER=zarinpal` | Merchant id |
| `ZARINPAL_SANDBOX` | `false` | | `true` uses `sandbox.zarinpal.com` |
| `STORAGE_DRIVER` | `local` | | `local` or `s3` |
| `STORAGE_LOCAL_DIR` | `./storage` | | Local upload directory (keep it outside `public/`, on persistent storage) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | | `STORAGE_DRIVER=s3` (bucket) | S3-compatible storage (also install `@aws-sdk/client-s3`) |
| `UPLOAD_MAX_BYTES` | 150 MB | | Max artwork upload size (images are capped lower) |
| `ACCOUNTING_PROVIDER` | `internal` | | `internal` or `holoo` (queues events; see [integrations](integrations.md)) |
| `HOLOO_BASE_URL`, `HOLOO_API_KEY` | | `ACCOUNTING_PROVIDER=holoo` (base URL) | Holoo connection, once the API is specified |
| `SEED_STAFF_PASSWORD` | `honar1405` | | Seed only: password for demo staff accounts |

Production guards:

- `SESSION_SECRET` must not be the development default.
- `OTP_PROVIDER=fake` or `PAYMENT_PROVIDER=fake` are rejected unless `DEMO_MODE=true`.
- Each provider's credentials are required as soon as that provider is selected.
