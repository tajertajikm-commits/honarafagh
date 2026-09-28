import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().default("postgres://honar:honar@localhost:5432/honar"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    SESSION_SECRET: z.string().min(32).default("dev-only-insecure-session-secret-change-me-please"),
    DEMO_MODE: bool,
    WORKER_INLINE: bool,
    BUSINESS_TIMEZONE: z.string().default("Asia/Tehran"),

    OTP_PROVIDER: z.enum(["fake", "smsir"]).default("fake"),
    SMS_PROVIDER: z.enum(["fake", "smsir"]).default("fake"),
    SMSIR_API_KEY: z.string().optional(),
    SMSIR_OTP_TEMPLATE_ID: z.coerce.number().int().optional(),
    SMSIR_OTP_PARAM_NAME: z.string().default("CODE"),
    SMSIR_LINE_NUMBER: z.string().optional(),

    PAYMENT_PROVIDER: z.enum(["fake", "zarinpal"]).default("fake"),
    ZARINPAL_MERCHANT_ID: z.string().optional(),
    ZARINPAL_SANDBOX: bool,

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default("./storage"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(150 * 1024 * 1024),

    ACCOUNTING_PROVIDER: z.enum(["internal", "holoo"]).default("internal"),
    HOLOO_BASE_URL: z.string().optional(),
    HOLOO_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const req = (cond: boolean, key: string, why: string) => {
      if (cond) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when ${why}` });
    };
    req(env.OTP_PROVIDER === "smsir" && !env.SMSIR_API_KEY, "SMSIR_API_KEY", "OTP_PROVIDER=smsir");
    req(env.OTP_PROVIDER === "smsir" && !env.SMSIR_OTP_TEMPLATE_ID, "SMSIR_OTP_TEMPLATE_ID", "OTP_PROVIDER=smsir");
    req(env.SMS_PROVIDER === "smsir" && !env.SMSIR_API_KEY, "SMSIR_API_KEY", "SMS_PROVIDER=smsir");
    req(env.SMS_PROVIDER === "smsir" && !env.SMSIR_LINE_NUMBER, "SMSIR_LINE_NUMBER", "SMS_PROVIDER=smsir");
    req(env.PAYMENT_PROVIDER === "zarinpal" && !env.ZARINPAL_MERCHANT_ID, "ZARINPAL_MERCHANT_ID", "PAYMENT_PROVIDER=zarinpal");
    req(env.STORAGE_DRIVER === "s3" && !env.S3_BUCKET, "S3_BUCKET", "STORAGE_DRIVER=s3");
    req(env.ACCOUNTING_PROVIDER === "holoo" && !env.HOLOO_BASE_URL, "HOLOO_BASE_URL", "ACCOUNTING_PROVIDER=holoo");
    if (env.NODE_ENV === "production" && env.SESSION_SECRET.startsWith("dev-only")) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "SESSION_SECRET must be set in production" });
    }
    if (env.NODE_ENV === "production" && !env.DEMO_MODE && (env.OTP_PROVIDER === "fake" || env.PAYMENT_PROVIDER === "fake")) {
      ctx.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "Fake OTP/payment providers are only allowed in production when DEMO_MODE=true" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}
