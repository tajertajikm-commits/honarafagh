import type { OtpProvider, SmsProvider } from "./types";

/**
 * Development/demo provider. Nothing leaves the server; the latest code per
 * phone is kept in memory so the demo UI and tests can read it.
 */
const lastCodes = new Map<string, { code: string; at: number }>();

export class FakeOtpProvider implements OtpProvider {
  readonly name = "fake";
  async sendOtp(phone: string, code: string) {
    lastCodes.set(phone, { code, at: Date.now() });
    console.info(`[otp:fake] ${phone} → ${code}`);
  }
}

export function peekFakeOtp(phone: string): string | null {
  return lastCodes.get(phone)?.code ?? null;
}

export class FakeSmsProvider implements SmsProvider {
  readonly name = "fake";
  async send(phone: string, text: string) {
    console.info(`[sms:fake] ${phone}: ${text}`);
    return { messageId: null };
  }
}
