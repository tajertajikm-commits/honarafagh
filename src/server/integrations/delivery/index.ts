/**
 * Delivery providers. Internal couriers and pickup need no adapter; external
 * carriers plug in here. MANUAL means staff enter the carrier's tracking code
 * by hand — no API calls are made (and none are claimed).
 */
export interface DeliveryProvider {
  readonly code: string;
  readonly name: string;
  readonly automated: boolean;
  /** Books a shipment with the carrier; returns a tracking code if the carrier issues one. */
  book(input: { shipmentId: string; recipientName: string; recipientPhone: string; address: string }): Promise<{ trackingCode: string | null }>;
  trackingUrl(trackingCode: string): string | null;
}

export class ManualDeliveryProvider implements DeliveryProvider {
  readonly code = "MANUAL";
  readonly name = "ثبت دستی";
  readonly automated = false;
  async book() {
    return { trackingCode: null };
  }
  trackingUrl() {
    return null;
  }
}

const registry = new Map<string, DeliveryProvider>([["MANUAL", new ManualDeliveryProvider()]]);

export function deliveryProvider(code: string | null | undefined): DeliveryProvider | null {
  return code ? (registry.get(code) ?? null) : null;
}

export function registerDeliveryProvider(p: DeliveryProvider) {
  registry.set(p.code, p);
}
