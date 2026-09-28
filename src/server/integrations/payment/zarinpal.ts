import { AppError } from "@/server/core/errors";
import type { PaymentProvider, PaymentRequestInput, VerifyResult } from "./types";

/**
 * Zarinpal REST v4 (https://www.zarinpal.com/docs/paymentGateway/).
 * Implemented against the public documentation; requires ZARINPAL_MERCHANT_ID
 * and has not been exercised against the live or sandbox gateway here.
 */
export class ZarinpalProvider implements PaymentProvider {
  readonly name = "zarinpal";
  readonly isLive: boolean;
  private readonly apiBase: string;
  private readonly startPayBase: string;

  constructor(private readonly merchantId: string, sandbox: boolean) {
    this.isLive = !sandbox;
    const host = sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
    this.apiBase = `${host}/pg/v4/payment`;
    this.startPayBase = `${host}/pg/StartPay`;
  }

  private async post(path: string, body: Record<string, unknown>) {
    let res: Response;
    try {
      res = await fetch(`${this.apiBase}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ merchant_id: this.merchantId, ...body }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new AppError("PAYMENT_ERROR", "ارتباط با درگاه پرداخت برقرار نشد.", { cause: String(err) });
    }
    return (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> | unknown[]; errors?: unknown };
  }

  async request(input: PaymentRequestInput) {
    const json = await this.post("request.json", {
      amount: input.amountRial,
      currency: "IRR",
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: input.mobile ? { mobile: input.mobile } : undefined,
    });
    const data = json.data as { code?: number; authority?: string } | undefined;
    if (!data || data.code !== 100 || !data.authority) {
      throw new AppError("PAYMENT_ERROR", "درخواست پرداخت توسط درگاه پذیرفته نشد.", { errors: json.errors });
    }
    return { authority: data.authority, redirectUrl: `${this.startPayBase}/${data.authority}` };
  }

  parseCallback(query: URLSearchParams) {
    return { authority: query.get("Authority"), success: query.get("Status") === "OK" };
  }

  async verify({ authority, amountRial }: { authority: string; amountRial: number }): Promise<VerifyResult> {
    const json = await this.post("verify.json", { amount: amountRial, currency: "IRR", authority });
    const data = json.data as { code?: number; ref_id?: number | string; card_pan?: string } | undefined;
    // 100 = verified now, 101 = already verified earlier (idempotent)
    if (data && (data.code === 100 || data.code === 101) && data.ref_id != null) {
      return { ok: true, refId: String(data.ref_id), cardPanMasked: data.card_pan, raw: data as Record<string, unknown> };
    }
    return { ok: false, reason: "verification failed", raw: { data: json.data, errors: json.errors } as Record<string, unknown> };
  }
}
