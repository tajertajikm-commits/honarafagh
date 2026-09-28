import { randomUUID } from "node:crypto";
import { env } from "@/server/config/env";
import type { PaymentProvider } from "./types";

/**
 * Demo gateway: redirects to an internal page that simulates the bank
 * (success / cancel). Never moves money. Clearly labelled in the UI.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly isLive = false;

  async request(input: { paymentId: string; amountRial: number; callbackUrl: string }) {
    const authority = `FAKE-${randomUUID()}`;
    const url = new URL("/payment/sandbox", env().APP_URL);
    url.searchParams.set("authority", authority);
    url.searchParams.set("amount", String(input.amountRial));
    url.searchParams.set("callback", input.callbackUrl);
    return { authority, redirectUrl: url.toString() };
  }

  parseCallback(query: URLSearchParams) {
    return { authority: query.get("Authority"), success: query.get("Status") === "OK" };
  }

  async verify({ authority }: { authority: string; amountRial: number }) {
    if (!authority.startsWith("FAKE-")) return { ok: false as const, reason: "invalid authority", raw: {} };
    return { ok: true as const, refId: `R${Date.now()}${Math.floor(Math.random() * 1000)}`, cardPanMasked: "6037-99**-****-1234", raw: { sandbox: true } };
  }
}
