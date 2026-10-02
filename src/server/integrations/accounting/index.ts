import { env } from "@/server/config/env";

/**
 * Accounting boundary: internal records → AccountingAdapter → external system.
 * The internal ledger (orders, payments) is always the source of truth; an
 * adapter only mirrors documents outward.
 */
export interface InvoiceDocument {
  invoiceId: string;
  invoiceNumber: number;
  type: "OFFICIAL" | "UNOFFICIAL";
  orderId: string;
  orderCode: string;
  customer: { id: string; code: string; name: string; phone: string | null; nationalId?: string | null; economicCode?: string | null };
  issuedAt: string;
  lines: { title: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  discount: number;
  vat: number;
  shipping: number;
  total: number;
}
export interface PaymentDocument {
  paymentId: string;
  orderCode: string;
  customerId: string;
  kind: "PAYMENT" | "REFUND";
  method: string;
  amount: number;
  reference: string | null;
  at: string;
}

export type SyncResult = { status: "SYNCED"; externalId: string } | { status: "SKIPPED"; reason: string } | { status: "QUEUED"; reason: string };

export interface AccountingAdapter {
  readonly name: string;
  syncInvoice(doc: InvoiceDocument): Promise<SyncResult>;
  syncPayment(doc: PaymentDocument): Promise<SyncResult>;
}

/** Default: the platform's own records are the books; nothing to mirror. */
export class InternalAccountingAdapter implements AccountingAdapter {
  readonly name = "internal";
  async syncInvoice() {
    return { status: "SKIPPED" as const, reason: "internal accounting" };
  }
  async syncPayment() {
    return { status: "SKIPPED" as const, reason: "internal accounting" };
  }
}

/**
 * Holoo adapter placeholder. No Holoo API specification or credentials are
 * available yet, so documents are QUEUED in integration_links with their
 * payload and can be back-filled once the adapter is implemented.
 * See docs/integrations.md → Holoo.
 */
export class HolooAccountingAdapter implements AccountingAdapter {
  readonly name = "holoo";
  constructor(private readonly cfg: { baseUrl?: string; apiKey?: string }) {}
  async syncInvoice(_doc: InvoiceDocument): Promise<SyncResult> {
    return { status: "QUEUED", reason: "Holoo adapter not implemented (awaiting API specification)" };
  }
  async syncPayment(_doc: PaymentDocument): Promise<SyncResult> {
    return { status: "QUEUED", reason: "Holoo adapter not implemented (awaiting API specification)" };
  }
}

let adapter: AccountingAdapter | undefined;
export function accountingAdapter(): AccountingAdapter {
  if (!adapter) {
    const e = env();
    adapter = e.ACCOUNTING_PROVIDER === "holoo" ? new HolooAccountingAdapter({ baseUrl: e.HOLOO_BASE_URL, apiKey: e.HOLOO_API_KEY }) : new InternalAccountingAdapter();
  }
  return adapter;
}
