import { AppError } from "@/server/core/errors";
import type { OtpProvider, SmsProvider } from "./types";

/**
 * SMS.ir REST API v1 (https://api.sms.ir). Credentials come from the
 * environment; see docs/integrations.md. Not exercised against the live
 * service in this repository — requires an account, API key and an approved
 * verification template.
 */
const BASE_URL = "https://api.sms.ir/v1";

interface SmsIrResponse {
  status: number;
  message: string;
  data?: { messageId?: number; packId?: string; messageIds?: number[] } | null;
}

async function call(apiKey: string, path: string, body: unknown): Promise<SmsIrResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/plain", "X-API-KEY": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError("INTEGRATION_ERROR", "ارسال پیامک ممکن نشد.", { provider: "smsir", cause: String(err) });
  }
  const json = (await res.json().catch(() => null)) as SmsIrResponse | null;
  if (!res.ok || !json || json.status !== 1) {
    throw new AppError("INTEGRATION_ERROR", "ارسال پیامک ممکن نشد.", { provider: "smsir", httpStatus: res.status, status: json?.status, message: json?.message });
  }
  return json;
}

export class SmsIrOtpProvider implements OtpProvider {
  readonly name = "smsir";
  constructor(private readonly cfg: { apiKey: string; templateId: number; paramName: string }) {}

  async sendOtp(phone: string, code: string) {
    await call(this.cfg.apiKey, "/send/verify", {
      mobile: phone,
      templateId: this.cfg.templateId,
      parameters: [{ name: this.cfg.paramName, value: code }],
    });
  }
}

export class SmsIrSmsProvider implements SmsProvider {
  readonly name = "smsir";
  constructor(private readonly cfg: { apiKey: string; lineNumber: string }) {}

  async send(phone: string, text: string) {
    const json = await call(this.cfg.apiKey, "/send/bulk", {
      lineNumber: Number(this.cfg.lineNumber),
      messageText: text,
      mobiles: [phone],
    });
    const id = json.data?.messageIds?.[0] ?? json.data?.messageId;
    return { messageId: id != null ? String(id) : null };
  }
}
