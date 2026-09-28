/**
 * Static demo stand-in for `@/server/config/env`. Fixed demo configuration:
 * fake OTP/SMS/payment providers, in-browser database and storage. There are
 * no secrets here — the HMAC key below only protects demo OTP hashes that
 * never leave the visitor's own browser.
 */
import { BASE_PATH } from "./cookies";

export type Env = {
  NODE_ENV: "development" | "test" | "production";
  DATABASE_URL: string;
  APP_URL: string;
  SESSION_SECRET: string;
  DEMO_MODE: boolean;
  WORKER_INLINE: boolean;
  BUSINESS_TIMEZONE: string;
  OTP_PROVIDER: "fake" | "smsir";
  SMS_PROVIDER: "fake" | "smsir";
  SMSIR_API_KEY?: string;
  SMSIR_OTP_TEMPLATE_ID?: number;
  SMSIR_OTP_PARAM_NAME: string;
  SMSIR_LINE_NUMBER?: string;
  PAYMENT_PROVIDER: "fake" | "zarinpal";
  ZARINPAL_MERCHANT_ID?: string;
  ZARINPAL_SANDBOX: boolean;
  STORAGE_DRIVER: "local" | "s3";
  STORAGE_LOCAL_DIR: string;
  S3_ENDPOINT?: string;
  S3_REGION: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  UPLOAD_MAX_BYTES: number;
  ACCOUNTING_PROVIDER: "internal" | "holoo";
  HOLOO_BASE_URL?: string;
  HOLOO_API_KEY?: string;
};

export function env(): Env {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return {
    NODE_ENV: "development",
    DATABASE_URL: "pglite://browser",
    APP_URL: `${origin}${BASE_PATH}`,
    SESSION_SECRET: "static-demo-key-not-a-secret-values-stay-in-browser",
    DEMO_MODE: true,
    // The outbox is drained by the demo dispatcher after each request (never concurrently with one).
    WORKER_INLINE: false,
    BUSINESS_TIMEZONE: "Asia/Tehran",
    OTP_PROVIDER: "fake",
    SMS_PROVIDER: "fake",
    SMSIR_OTP_PARAM_NAME: "CODE",
    PAYMENT_PROVIDER: "fake",
    ZARINPAL_SANDBOX: true,
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: "browser",
    S3_REGION: "us-east-1",
    UPLOAD_MAX_BYTES: 25 * 1024 * 1024,
    ACCOUNTING_PROVIDER: "internal",
  };
}

export function appUrl(path: string): URL {
  return new URL(env().APP_URL.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`));
}

export function resetEnvCache() {}
