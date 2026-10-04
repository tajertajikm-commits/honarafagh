import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { customers, employees, orderEvents, orderItems, orders, payments, priorityChanges, qualityApprovals, users } from "@/server/db/schema";
import { type Ctx, can, requireCustomer } from "@/server/core/context";
import { notFound } from "@/server/core/errors";
import { invoicesForOrder } from "@/server/modules/finance/invoices";
import { lithoOf, procurementOf } from "@/server/modules/offset/service";
import { orderSteps } from "@/server/modules/queues/service";
import { shipmentOf, SHIPPING_METHOD_LABEL } from "@/server/modules/shipping/service";
import { customerStatus, CUSTOMER_CODE_RE } from "@/lib/order-status";
import { normalizeFa, normalizePhone, toEnDigits } from "@/lib/persian";
import { approvalsOf } from "./approval";
import { artworkOf } from "./artwork";
import { loadOrderByCode, loadOrder, worksOnType, type Order } from "./state";
import { getSetting } from "@/server/modules/settings/service";

// ── Lists ───────────────────────────────────────────────────────────────────

export type OrderTab = "approval" | "active" | "ready" | "closed" | "all";
const TAB_STATUSES: Record<OrderTab, Order["status"][] | null> = {
  approval: ["WAITING_APPROVAL", "NEEDS_INFO"],
  active: ["APPROVED", "IN_PRODUCTION"],
  ready: ["READY", "SHIPPING"],
  closed: ["DELIVERED", "REJECTED", "CANCELLED"],
  all: null,
};

/** Orders the staff member may see (all, or only their production type). */
export async function listOrders(ctx: Ctx, f: { tab?: OrderTab; type?: "DIGITAL" | "OFFSET"; q?: string; limit?: number } = {}) {
  const conds: SQL[] = [];
  const types = (["DIGITAL", "OFFSET"] as const).filter((t) => worksOnType(ctx, t));
  const all = can(ctx, "order.view") || can(ctx, "payment.view") || can(ctx, "invoice.manage");
  if (!all && types.length === 0) return { rows: [], counts: { approval: 0, active: 0, ready: 0, closed: 0, all: 0 } };
  if (!all) conds.push(inArray(orders.productionType, [...types]));
  if (f.type) conds.push(eq(orders.productionType, f.type));
  const statuses = TAB_STATUSES[f.tab ?? "all"];
  if (statuses) conds.push(inArray(orders.status, statuses));
  const q = f.q ? toEnDigits(normalizeFa(f.q.trim())) : "";
  if (q) {
    const code = CUSTOMER_CODE_RE.exec(q);
    const phone = normalizePhone(q);
    conds.push(or(ilike(orders.code, `%${q.toUpperCase()}%`), ilike(orders.title, `%${q}%`), ilike(customers.fullName, `%${q}%`), ilike(customers.companyName, `%${q}%`), code ? eq(customers.code, Number(code[1])) : sql`false`, phone ? eq(customers.phone, phone) : sql`false`)!);
  }
  const rows = await ctx.db
    .select({ order: orders, customerName: customers.fullName, customerCode: customers.code, companyName: customers.companyName })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.isPriority), desc(orders.createdAt))
    .limit(f.limit ?? 100);
  const counts = await ctx.db
    .select({ status: orders.status, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(all ? undefined : inArray(orders.productionType, [...types]))
    .groupBy(orders.status);
  const tabCount = (tab: OrderTab) => counts.filter((c) => !TAB_STATUSES[tab] || TAB_STATUSES[tab]!.includes(c.status)).reduce((s, c) => s + c.n, 0);
  return { rows, counts: { approval: tabCount("approval"), active: tabCount("active"), ready: tabCount("ready"), closed: tabCount("closed"), all: tabCount("all") } };
}

// ── Staff: complete order ───────────────────────────────────────────────────

/** Everything about one order, by its code (O-1042-0019). */
export async function staffOrder(ctx: Ctx, code: string) {
  const order = await loadOrderByCode(ctx, code);
  const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, order.customerId));
  const [items, approvals, artwork, steps, quality, payRows, invoices, shipment, priority, events] = await Promise.all([
    ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.lineNo)),
    approvalsOf(ctx, order.id),
    artworkOf(ctx, order.id),
    orderSteps(ctx, order.id),
    ctx.db.select({ q: qualityApprovals, approverName: users.fullName }).from(qualityApprovals).innerJoin(users, eq(users.id, qualityApprovals.approverId)).where(eq(qualityApprovals.orderId, order.id)).orderBy(asc(qualityApprovals.createdAt)),
    ctx.db.select({ payment: payments, byName: users.fullName }).from(payments).leftJoin(users, eq(users.id, payments.createdBy)).where(eq(payments.orderId, order.id)).orderBy(asc(payments.createdAt)),
    invoicesForOrder(ctx, order.id),
    shipmentOf(ctx, order.id),
    ctx.db.select({ change: priorityChanges, byName: users.fullName }).from(priorityChanges).innerJoin(users, eq(users.id, priorityChanges.changedBy)).where(eq(priorityChanges.orderId, order.id)).orderBy(asc(priorityChanges.createdAt)),
    ctx.db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(desc(orderEvents.createdAt)),
  ]);
  const offset = order.productionType === "OFFSET" ? { procurement: await procurementOf(ctx, order.id), litho: await lithoOf(ctx, order.id) } : null;
  let designerName: string | null = null;
  if (order.designerId) {
    const [d] = await ctx.db.select({ name: users.fullName }).from(employees).innerJoin(users, eq(users.id, employees.userId)).where(eq(employees.id, order.designerId));
    designerName = d?.name ?? null;
  }
  return { order, customer: customer!, items, approvals, artwork, steps, quality, payments: payRows, invoices, shipment, priority, events, offset, designerName };
}
export type StaffOrder = Awaited<ReturnType<typeof staffOrder>>;

// ── Customer ────────────────────────────────────────────────────────────────

export async function customerOrders(ctx: Ctx) {
  const actor = requireCustomer(ctx);
  const rows = await ctx.db.select().from(orders).where(eq(orders.customerId, actor.customerId)).orderBy(desc(orders.createdAt));
  return rows.map((o) => ({ ...o, customer: customerStatus(o.status, o.artworkStatus) }));
}

/**
 * The customer's view of one order: summary, simplified status and history,
 * messages, files, payments and invoices. No internal workflow details.
 */
export async function customerOrder(ctx: Ctx, orderId: string) {
  requireCustomer(ctx);
  const order = await loadOrder(ctx, orderId);
  const [items, events, artwork, payRows, invoices, shipment] = await Promise.all([
    ctx.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.lineNo)),
    ctx.db.select({ id: orderEvents.id, domain: orderEvents.domain, type: orderEvents.type, message: orderEvents.message, createdAt: orderEvents.createdAt }).from(orderEvents).where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.visibleToCustomer, true))).orderBy(asc(orderEvents.createdAt)),
    artworkOf(ctx, order.id),
    ctx.db.select({ id: payments.id, kind: payments.kind, method: payments.method, status: payments.status, amount: payments.amount, createdAt: payments.createdAt, rejectionReason: payments.rejectionReason }).from(payments).where(and(eq(payments.orderId, order.id), inArray(payments.status, ["CONFIRMED", "AWAITING_APPROVAL", "REJECTED"]))).orderBy(asc(payments.createdAt)),
    invoicesForOrder(ctx, order.id),
    shipmentOf(ctx, order.id),
  ]);
  return {
    order,
    status: customerStatus(order.status, order.artworkStatus),
    items,
    events,
    artwork,
    payments: payRows,
    invoices: invoices.filter((i) => i.status === "ISSUED").map((i) => ({ id: i.id, number: i.number, type: i.type, total: i.total, issuedAt: i.issuedAt })),
    shipment: shipment ? { method: SHIPPING_METHOD_LABEL[shipment.shipment.method], carrierName: shipment.shipment.carrierName, trackingCode: shipment.shipment.trackingCode, dispatchedAt: shipment.shipment.dispatchedAt, deliveredAt: shipment.shipment.deliveredAt } : null,
  };
}
export type CustomerOrder = Awaited<ReturnType<typeof customerOrder>>;

/** Public tracking by order code + the phone number on the order. */
export async function trackOrder(ctx: Ctx, rawCode: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  const code = toEnDigits(rawCode).trim().toUpperCase();
  if (!phone) throw notFound("سفارش");
  const [o] = await ctx.db.select({ order: orders, phone: customers.phone }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(eq(orders.code, code));
  if (!o || o.phone !== phone) throw notFound("سفارش");
  const events = await ctx.db.select({ message: orderEvents.message, createdAt: orderEvents.createdAt }).from(orderEvents).where(and(eq(orderEvents.orderId, o.order.id), eq(orderEvents.visibleToCustomer, true), eq(orderEvents.domain, "ORDER"))).orderBy(asc(orderEvents.createdAt));
  const businessPhone = (await getSetting(ctx.db, "business")).phone || null;
  return { code: o.order.code, title: o.order.title, productionType: o.order.productionType, createdAt: o.order.createdAt, status: customerStatus(o.order.status, o.order.artworkStatus), events, businessPhone };
}

