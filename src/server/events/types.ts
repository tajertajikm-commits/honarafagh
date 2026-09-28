/**
 * Domain events published through the transactional outbox.
 * Payloads carry identifiers only; handlers load current state.
 */
export interface DomainEvents {
  OrderPlaced: { orderId: string };
  OrderConfirmed: { orderId: string };
  OrderCancelled: { orderId: string; reason: string };
  OrderReady: { orderId: string };
  OrderCompleted: { orderId: string };
  PaymentReceived: { orderId: string; paymentId: string; amount: number };
  PaymentRefunded: { orderId: string; paymentId: string; amount: number };
  PaymentAwaitingApproval: { orderId: string; paymentId: string };
  ProofSent: { orderId: string; orderItemId: string; versionId: string };
  ArtworkApproved: { orderId: string; orderItemId: string; versionId: string };
  ProductionStarted: { orderId: string };
  ProductionCompleted: { orderId: string };
  QcFailed: { orderId: string; taskId: string; inspectionId: string };
  IssueReported: { orderId: string; taskId: string; issueId: string };
  MaterialShortage: { materialId: string; requestId: string; orderId: string | null };
  StockLow: { materialId: string };
  DeliveryAssigned: { orderId: string; shipmentId: string };
  DeliveryDispatched: { orderId: string; shipmentId: string };
  DeliveryCompleted: { orderId: string; shipmentId: string };
  DeliveryFailed: { orderId: string; shipmentId: string };
  QuoteSent: { quoteId: string };
  InquiryReceived: { inquiryId: string };
}
export type DomainEventType = keyof DomainEvents;
