import { and, desc, eq, gt, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { customers, lithographyJobs, orderEvents, orders, payments, procurementDecisions, productionSteps, shipments, supplierQuotes, suppliers } from "@/server/db/schema";
import { type Ctx, assertCan } from "@/server/core/context";
import { ACTIVE_STATUSES } from "@/server/modules/workflow/engine";
import { stationQueues, type StationQueue } from "@/server/modules/queues/service";

const ref = { id: orders.id, code: orders.code, title: orders.title, productionType: orders.productionType, customerName: customers.fullName, status: orders.status, isPriority: orders.isPriority, createdAt: orders.createdAt };

/** The station with the most work piling up (waiting + blocked), if any. */
export function bottleneck(queues: StationQueue[]): StationQueue | null {
  const load = (q: StationQueue) => q.waiting + q.blocked;
  const top = [...queues].filter((q) => q.station.kind !== "SHIPPING").sort((a, b) => load(b) - load(a))[0];
  return top && load(top) >= 2 ? top : null;
}

/**
 * The manager's control center: what needs a decision, where work is piling
 * up, and what is at risk — actionable lists, not charts.
 */
export async function controlCenter(ctx: Ctx) {
  assertCan(ctx, "dashboard.view");
  const db = ctx.db;
  const count = async (cond: ReturnType<typeof and>) => (await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(cond))[0]!.n;

  const [waitingApproval, needsInfo, digitalActive, offsetActive, digital, offset] = await Promise.all([
    db.select(ref).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(eq(orders.status, "WAITING_APPROVAL")).orderBy(desc(orders.isPriority), orders.createdAt),
    count(eq(orders.status, "NEEDS_INFO")),
    count(and(eq(orders.productionType, "DIGITAL"), inArray(orders.status, ["APPROVED", "IN_PRODUCTION"]))),
    count(and(eq(orders.productionType, "OFFSET"), inArray(orders.status, ["APPROVED", "IN_PRODUCTION"]))),
    stationQueues(ctx, "DIGITAL"),
    stationQueues(ctx, "OFFSET"),
  ]);

  const priority = await db.select(ref).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(and(eq(orders.isPriority, true), inArray(orders.status, [...ACTIVE_STATUSES, "WAITING_APPROVAL"]))).orderBy(orders.prioritySetAt);

  const quality = [...digital, ...offset].filter((q) => q.station.kind === "QUALITY").flatMap((q) => q.items.map((i) => ({ ...i, stationName: q.station.name })));

  const paperPending = await db
    .selectDistinct(ref)
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(supplierQuotes, eq(supplierQuotes.orderId, orders.id))
    .innerJoin(productionSteps, and(eq(productionSteps.orderId, orders.id), eq(productionSteps.key, "O_PAPER")))
    .leftJoin(procurementDecisions, eq(procurementDecisions.orderId, orders.id))
    .where(and(isNull(procurementDecisions.id), inArray(orders.status, [...ACTIVE_STATUSES]), sql`${productionSteps.status} <> 'DONE'`));

  const litho = await db
    .select({ order: ref, status: lithographyJobs.status, expectedAt: lithographyJobs.expectedAt, supplierName: suppliers.name })
    .from(lithographyJobs)
    .innerJoin(orders, eq(orders.id, lithographyJobs.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(suppliers, eq(suppliers.id, lithographyJobs.supplierId))
    .where(and(inArray(lithographyJobs.status, ["ORDERED", "IN_PROGRESS", "READY"]), inArray(orders.status, [...ACTIVE_STATUSES])))
    .orderBy(lithographyJobs.expectedAt);

  const readyToShip = [...digital, ...offset].filter((q) => q.station.kind === "SHIPPING").flatMap((q) => q.items.filter((i) => i.status === "READY"));
  const inTransit = await db
    .select({ order: ref, method: shipments.method, carrierName: shipments.carrierName, trackingCode: shipments.trackingCode, dispatchedAt: shipments.dispatchedAt })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(shipments.status, "DISPATCHED"))
    .orderBy(shipments.dispatchedAt);

  // Money: finished work not fully paid, custom orders without a price, payments to confirm.
  const unpaidFinished = await db
    .select({ ...ref, total: orders.total, paid: sql<number>`${orders.paidAmount} - ${orders.refundedAmount}` })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(inArray(orders.status, ["READY", "SHIPPING", "DELIVERED"]), gt(sql`${orders.total} - (${orders.paidAmount} - ${orders.refundedAmount})`, 0)))
    .orderBy(orders.readyAt);
  const unpriced = await count(and(eq(orders.kind, "CUSTOM"), isNull(orders.pricedAt), notInArray(orders.status, ["WAITING_APPROVAL", "NEEDS_INFO", "REJECTED", "CANCELLED"])));
  const paymentsToConfirm = (await db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.status, "AWAITING_APPROVAL")))[0]!.n;
  const overdue = await db
    .select(ref)
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(inArray(orders.status, [...ACTIVE_STATUSES]), lt(orders.requestedDeadline, new Date())))
    .orderBy(orders.requestedDeadline);

  const recent = await db
    .select({ id: orderEvents.id, message: orderEvents.message, createdAt: orderEvents.createdAt, actorLabel: orderEvents.actorLabel, orderId: orders.id, code: orders.code })
    .from(orderEvents)
    .innerJoin(orders, eq(orders.id, orderEvents.orderId))
    .orderBy(desc(orderEvents.createdAt))
    .limit(12);

  return {
    waitingApproval,
    needsInfo,
    digitalActive,
    offsetActive,
    digital,
    offset,
    bottlenecks: [bottleneck(digital), bottleneck(offset)].filter((b): b is StationQueue => b !== null),
    priority,
    quality,
    paperPending,
    litho,
    readyToShip,
    inTransit,
    money: { unpaidFinished, unpriced, paymentsToConfirm },
    overdue,
    recent,
  };
}
