import { env } from "@/server/config/env";
import { FakePaymentProvider } from "./fake";
import type { PaymentProvider } from "./types";
import { ZarinpalProvider } from "./zarinpal";

const providers = new Map<string, PaymentProvider>();

export function paymentProvider(name?: string): PaymentProvider {
  const e = env();
  const key = name ?? e.PAYMENT_PROVIDER;
  let p = providers.get(key);
  if (!p) {
    p = key === "zarinpal" ? new ZarinpalProvider(e.ZARINPAL_MERCHANT_ID ?? "", !!e.ZARINPAL_SANDBOX) : new FakePaymentProvider();
    providers.set(key, p);
  }
  return p;
}

export type { PaymentProvider };
