import { randomUUID } from "node:crypto";
import { appUrl } from "@/server/config/env";
import type { PaymentProvider } from "./types";

/** Authorities the sandbox page marked as "declined by the bank". */
const declined = new Set<string>();

/**
 * Demo gateway: redirects to an internal page that simulates the bank
 * (success / failure / cancel). Never moves money. Clearly labelled in the UI.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly isLive = false;

  async request(input: { paymentId: string; amountRial: number; callbackUrl: string }) {
    const authority = `FAKE-${randomUUID()}`;
    const url = appUrl("/payment/sandbox");
    url.searchParams.set("authority", authority);
    url.searchParams.set("amount", String(input.amountRial));
    url.searchParams.set("callback", input.callbackUrl);
    return { authority, redirectUrl: url.toString() };
  }

  /** Status=OK → paid, Status=FAIL → the bank declines at verification, anything else → cancelled by the customer. */
  parseCallback(query: URLSearchParams) {
    const authority = query.get("Authority");
    const status = query.get("Status");
    if (authority && status === "FAIL") declined.add(authority);
    return { authority, success: status === "OK" || status === "FAIL" };
  }

  async verify({ authority }: { authority: string; amountRial: number }) {
    if (!authority.startsWith("FAKE-")) return { ok: false as const, reason: "invalid authority", raw: {} };
    if (declined.delete(authority)) return { ok: false as const, reason: "declined by bank (simulated)", raw: { sandbox: true, declined: true } };
    return { ok: true as const, refId: `R${Date.now()}${Math.floor(Math.random() * 1000)}`, cardPanMasked: "6037-99**-****-1234", raw: { sandbox: true } };
  }
}
