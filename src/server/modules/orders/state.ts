import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  materialRequirements,
  orderEvents,
  orderItems,
  orders,
  productionJobs,
  productionTasks,
  shipments,
} from "@/server/db/schema";
import { type Ctx, actorUserId } from "@/server/core/context";
import { emit } from "@/server/events/outbox";
import { isRequirementSatisfied } from "@/server/modules/inventory/service";

type Order = typeof orders.$inferSelect;
type Item = typeof orderItems.$inferSelect;
type FileStatus = Order["fileStatus"];

export async function orderEvent(
  ctx: Ctx,
  e: { orderId: string; orderItemId?: string | null; domain: string; type: string; from?: string | null; to?: string | null; message?: string | null; visibleToCustomer?: boolean },
) {
  await ctx.db.insert(orderEvents).values({
    orderId: e.orderId,
    orderItemId: e.orderItemId ?? null,
    domain: e.domain,
    type: e.type,
    fromState: e.from ?? null,
    toState: e.to ?? null,
    message: e.message ?? null,
    visibleToCustomer: e.visibleToCustomer ?? false,
    actorId: actorUserId(ctx),
  });
}

// ── Pure derivations (unit-tested) ──────────────────────────────────────────

export function derivePaymentStatus(total: number, paid: number, refunded: number): Order["paymentStatus"] {
  const net = paid - refunded;
  if (refunded > 0 && net <= 0) return "REFUNDED";
  if (net <= 0) return total === 0 ? "PAID" : "UNPAID";
  if (net < total) return "PARTIALLY_PAID";
  if (net === total) return "PAID";
  return "OVERPAID";
}

const FILE_PRECEDENCE: FileStatus[] = ["NEEDS_REVISION", "AWAITING_FILE", "IN_DESIGN", "UNDER_REVIEW", "AWAITING_CUSTOMER_APPROVAL", "APPROVED", "NOT_REQUIRED"];
export function deriveFileStatus(items: Pick<Item, "fileStatus">[]): FileStatus {
  if (items.length === 0) return "NOT_REQUIRED";
  const all = items.map((i) => i.fileStatus);
  if (all.every((s) => s === "NOT_REQUIRED")) return "NOT_REQUIRED";
  if (all.every((s) => s === "APPROVED" || s === "NOT_REQUIRED")) return "APPROVED";
  return FILE_PRECEDENCE.find((s) => all.includes(s)) ?? "UNDER_REVIEW";
}

export function deriveProcurementStatus(reqs: Pick<typeof materialRequirements.$inferSelect, "quantityRequired" | "quantityReserved" | "quantityIssued" | "status">[]): Order["procurementStatus"] {
  const active = reqs.filter((r) => r.status !== "RELEASED");
  if (active.length === 0) return reqs.length ? "NOT_REQUIRED" : "NOT_EVALUATED";
  if (active.every((r) => r.quantityIssued + 1e-6 >= r.quantityRequired)) return "ISSUED";
  if (active.every((r) => isRequirementSatisfied(r))) return "RESERVED";
  if (active.some((r) => r.quantityReserved + r.quantityIssued > 0)) return "PARTIALLY_RESERVED";
  return "WAITING_FOR_MATERIAL";
}

export function deriveProductionStatus(items: Pick<Item, "productionStatus">[], hasJobs: boolean): Order["productionStatus"] {
  if (items.length === 0) return "CANCELLED";
  const s = items.map((i) => i.productionStatus);
  if (s.every((x) => x === "COMPLETED")) return "COMPLETED";
  if (s.includes("BLOCKED")) return "BLOCKED";
  if (s.includes("IN_PROGRESS") || s.includes("COMPLETED")) return "IN_PROGRESS";
  if (hasJobs) return "WAITING";
  return "NOT_STARTED";
}

export function deriveQcStatus(items: Pick<Item, "qcStatus">[]): Order["qcStatus"] {
  const s = items.map((i) => i.qcStatus);
  if (s.includes("IN_REWORK")) return "IN_REWORK";
  if (s.includes("FAILED")) return "FAILED";
  if (s.length > 0 && s.every((x) => x === "PASSED")) return "PASSED";
  return "PENDING";
}

export function deriveDeliveryStatus(
  items: Pick<Item, "quantity" | "quantityDelivered">[],
  ships: Pick<typeof shipments.$inferSelect, "status">[],
  productionDone: boolean,
): Order["deliveryStatus"] {
  if (items.length && items.every((i) => i.quantityDelivered >= i.quantity)) return "DELIVERED";
  if (items.some((i) => i.quantityDelivered > 0)) return "PARTIALLY_DELIVERED";
  const open = ships.filter((s) => !["CANCELLED", "RETURNED"].includes(s.status));
  if (open.some((s) => s.status === "OUT_FOR_DELIVERY")) return "OUT_FOR_DELIVERY";
  if (open.some((s) => s.status === "PENDING" || s.status === "ASSIGNED")) return "SCHEDULED";
  if (open.some((s) => s.status === "FAILED")) return "FAILED";
  return productionDone ? "READY" : "NOT_READY";
}

/** Automatic order-status progression from the other domains (manual states are respected). */
export function deriveOrderStatus(current: Order["status"], d: { production: Order["productionStatus"]; delivery: Order["deliveryStatus"]; payment: Order["paymentStatus"] }): Order["status"] {
  if (["DRAFT", "PENDING_REVIEW", "ON_HOLD", "CANCELLED", "COMPLETED"].includes(current)) return current;
  const settled = d.payment === "PAID" || d.payment === "OVERPAID";
  if (d.delivery === "DELIVERED" && settled) return "COMPLETED";
  if (d.production === "COMPLETED") return "READY";
  if (d.production === "IN_PROGRESS" || d.production === "BLOCKED") return "IN_PROGRESS";
  return current === "READY" ? "IN_PROGRESS" : current;
}

// ── Persistence ─────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  IN_PROGRESS: "سفارش وارد تولید شد",
  READY: "سفارش آماده تحویل است",
  COMPLETED: "سفارش تحویل و تسویه شد",
};

/**
 * Recomputes every derived state of an order from its underlying records and
 * writes changes with timeline events. Call after any cross-domain change.
 */
export async function recomputeOrder(ctx: Ctx, orderId: string): Promise<Order> {
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new Error(`order ${orderId} not found`);
  const items = await ctx.db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "ACTIVE")));
  const reqs = await ctx.db.select().from(materialRequirements).where(eq(materialRequirements.orderId, orderId));
  const jobs = await ctx.db.select({ id: productionJobs.id }).from(productionJobs).where(and(eq(productionJobs.orderId, orderId), ne(productionJobs.status, "CANCELLED")));
  const ships = await ctx.db.select({ status: shipments.status }).from(shipments).where(eq(shipments.orderId, orderId));

  const paymentStatus = derivePaymentStatus(order.total, order.paidAmount, order.refundedAmount);
  const fileStatus = deriveFileStatus(items);
  const procurementStatus = deriveProcurementStatus(reqs.filter((r) => items.some((i) => i.id === r.orderItemId)));
  const productionStatus = order.status === "CANCELLED" ? "CANCELLED" : deriveProductionStatus(items, jobs.length > 0);
  const qcStatus = deriveQcStatus(items);
  const deliveryStatus = deriveDeliveryStatus(items, ships, productionStatus === "COMPLETED");
  const status = deriveOrderStatus(order.status, { production: productionStatus, delivery: deliveryStatus, payment: paymentStatus });

  const next = { paymentStatus, fileStatus, procurementStatus, productionStatus, qcStatus, deliveryStatus, status };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== order[k]);
  if (changed.length === 0) return order;

  const patch: Partial<Order> = { ...next };
  if (status === "READY" && order.status !== "READY" && !order.readyAt) patch.readyAt = new Date();
  if (status === "COMPLETED" && order.status !== "COMPLETED") patch.completedAt = new Date();
  await ctx.db.update(orders).set(patch).where(eq(orders.id, orderId));

  const DOMAIN: Record<keyof typeof next, string> = {
    paymentStatus: "PAYMENT",
    fileStatus: "FILE",
    procurementStatus: "PROCUREMENT",
    productionStatus: "PRODUCTION",
    qcStatus: "QC",
    deliveryStatus: "DELIVERY",
    status: "ORDER",
  };
  for (const k of changed) {
    await orderEvent(ctx, {
      orderId,
      domain: DOMAIN[k],
      type: "STATE_CHANGED",
      from: String(order[k]),
      to: String(next[k]),
      message: k === "status" ? (LABELS[next.status] ?? null) : null,
      visibleToCustomer: k === "status" && !!LABELS[next.status],
    });
  }

  if (productionStatus !== order.productionStatus) {
    if (productionStatus === "IN_PROGRESS" && ["NOT_STARTED", "WAITING"].includes(order.productionStatus)) {
      await emit(ctx, "ProductionStarted", { type: "order", id: orderId }, { orderId });
    }
    if (productionStatus === "COMPLETED") await emit(ctx, "ProductionCompleted", { type: "order", id: orderId }, { orderId });
  }
  if (status === "READY" && order.status !== "READY") await emit(ctx, "OrderReady", { type: "order", id: orderId }, { orderId });
  if (status === "COMPLETED" && order.status !== "COMPLETED") await emit(ctx, "OrderCompleted", { type: "order", id: orderId }, { orderId });
  return { ...order, ...patch };
}

const FILE_WORK = ["DESIGN", "PREPRESS"];

/** Recomputes derived item statuses from its production tasks. */
export async function recomputeItemProduction(ctx: Ctx, orderItemId: string) {
  const [job] = await ctx.db.select().from(productionJobs).where(eq(productionJobs.orderItemId, orderItemId));
  if (!job) return;
  const tasks = await ctx.db.select().from(productionTasks).where(eq(productionTasks.jobId, job.id));
  const current = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) {
    const c = current.get(t.stepKey);
    if (!c || t.attempt > c.attempt) current.set(t.stepKey, t);
  }
  const cur = [...current.values()];
  const work = cur.filter((t) => !t.gate);
  const done = (s: string) => ["COMPLETED", "SKIPPED", "CANCELLED"].includes(s);
  let productionStatus: Item["productionStatus"];
  if (job.status === "CANCELLED") productionStatus = "CANCELLED";
  else if (cur.every((t) => done(t.status))) productionStatus = "COMPLETED";
  else if (cur.some((t) => t.status === "BLOCKED")) productionStatus = "BLOCKED";
  // Design and prepress are file preparation; production starts with plates / printing / finishing.
  else if (work.filter((t) => !FILE_WORK.includes(t.stepTypeCode)).some((t) => ["IN_PROGRESS", "PAUSED", "COMPLETED"].includes(t.status))) productionStatus = "IN_PROGRESS";
  else productionStatus = "WAITING";

  const qcTasks = tasks.filter((t) => t.isQc);
  const reworking = cur.some((t) => t.attempt > 1 && !done(t.status));
  const finalQc = cur.filter((t) => t.isQc).sort((a, b) => b.sortOrder - a.sortOrder)[0];
  const qcStatus: Item["qcStatus"] = reworking ? "IN_REWORK" : finalQc && finalQc.status === "COMPLETED" && qcTasks.length ? "PASSED" : "PENDING";

  const packaging = cur.find((t) => t.stepTypeCode === "PACKAGING");
  const quantityProduced = productionStatus === "COMPLETED" ? (packaging?.quantityCompleted || job.quantity) : 0;

  const jobStatus: typeof job.status =
    job.status === "CANCELLED" ? "CANCELLED" : productionStatus === "COMPLETED" ? "COMPLETED" : productionStatus === "WAITING" ? "RELEASED" : "IN_PROGRESS";
  if (jobStatus !== job.status) {
    await ctx.db
      .update(productionJobs)
      .set({
        status: jobStatus,
        startedAt: job.startedAt ?? (jobStatus === "IN_PROGRESS" ? new Date() : null),
        completedAt: jobStatus === "COMPLETED" ? new Date() : null,
      })
      .where(eq(productionJobs.id, job.id));
  }
  await ctx.db.update(orderItems).set({ productionStatus, qcStatus, quantityProduced }).where(eq(orderItems.id, orderItemId));
}

export async function orderIdsForItems(ctx: Ctx, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const rows = await ctx.db.selectDistinct({ orderId: orderItems.orderId }).from(orderItems).where(inArray(orderItems.id, itemIds));
  return rows.map((r) => r.orderId);
}

export async function lockOrder(ctx: Ctx, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return o ?? null;
}

export const bumpOrderVersion = (ctx: Ctx, orderId: string) =>
  ctx.db.update(orders).set({ version: sql`${orders.version} + 1` }).where(eq(orders.id, orderId));
