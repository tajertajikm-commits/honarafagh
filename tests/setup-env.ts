process.env.DATABASE_URL ??= "postgres://honar:honar@localhost:5432/honar_test";
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.OTP_PROVIDER = "fake";
process.env.PAYMENT_PROVIDER = "fake";
process.env.SMS_PROVIDER = "fake";
process.env.STORAGE_LOCAL_DIR = "./storage-test";
process.env.WORKER_INLINE = "false";
