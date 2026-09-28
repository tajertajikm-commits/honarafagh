export interface PaymentRequestInput {
  paymentId: string;
  amountRial: number;
  description: string;
  callbackUrl: string;
  mobile?: string;
}

export interface PaymentRequestResult {
  authority: string;
  redirectUrl: string;
}

export type VerifyResult =
  | { ok: true; refId: string; cardPanMasked?: string; raw: Record<string, unknown> }
  | { ok: false; reason: string; raw: Record<string, unknown> };

/** Online payment gateway contract. Amounts are always rial. */
export interface PaymentProvider {
  readonly name: string;
  readonly isLive: boolean;
  request(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  /** Reads the provider-specific callback query into (authority, success flag). */
  parseCallback(query: URLSearchParams): { authority: string | null; success: boolean };
  verify(input: { authority: string; amountRial: number }): Promise<VerifyResult>;
}
