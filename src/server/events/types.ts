/**
 * Domain events published through the transactional outbox.
 * Payloads carry identifiers only; handlers load current state.
 */
export interface DomainEvents {
  OrderSubmitted: { orderId: string };
  OrderApproved: { orderId: string };
  OrderNeedsInfo: { orderId: string; note: string };
  OrderRejected: { orderId: string; note: string };
  CustomerReplied: { orderId: string };
  OrderPriced: { orderId: string };
  OrderCancelled: { orderId: string; reason: string };
  ArtworkUploaded: { orderId: string };
  ArtworkNeedsCorrection: { orderId: string; note: string };
  DesignAssigned: { orderId: string; designerUserId: string | null };
  QualityCheckNeeded: { orderId: string; stepKey: string };
  PaperDecisionNeeded: { orderId: string };
  OrderReady: { orderId: string };
  OrderShipped: { orderId: string };
  OrderDelivered: { orderId: string };
  PaymentReceived: { orderId: string; paymentId: string; amount: number };
  PaymentRefunded: { orderId: string; paymentId: string; amount: number };
  PaymentAwaitingApproval: { orderId: string; paymentId: string };
  InvoiceIssued: { orderId: string; invoiceId: string };
}
export type DomainEventType = keyof DomainEvents;
