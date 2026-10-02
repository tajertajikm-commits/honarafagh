import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { customers, employees, lithographyJobs, machines, orders, payments, procurementDecisions, productionSteps, supplierQuotes, users } from "@/server/db/schema";
import { type Ctx, assertCanAny, can } from "@/server/core/context";
import { worksOnType } from "@/server/modules/orders/state";
import { LITHO_LABEL } from "@/server/modules/offset/service";
import { ACTIVE_STATUSES, blockedReason } from "@/server/modules/workflow/engine";
import { APPROVE_PERMISSION, QUEUE_PERMISSION, station, stationsOf, type ProductionType, type Station } from "@/server/modules/workflow/stations";

export interface QueueOrder {
  id: string;
  code: string;
  title: string;
  quantity: number | null;
  productionType: ProductionType;
  isPriority: boolean;
  prioritySetAt: Date | null;
  customerName: string;
  artworkStatus: string;
  requestedDeadline: Date | null;
}

export interface QueueItem {
  stepId: string;
  key: string;
  status: "WAITING" | "READY" | "IN_PROGRESS" | "DONE";
  readyAt: Date | null;
  startedAt: Date | null;
  reworkCount: number;
  machineId: string | null;
  machineName: string | null;
  machineCategory: string | null;
  assigneeName: string | null;
  order: QueueOrder;
  /** Why it cannot start yet. */
  blocked: string | null;
  /** Station-specific state (paper quotes, lithography status). */
  detail: string | null;
}

export interface StationQueue {
  station: Station;
  working: number;
  waiting: number;
  priority: number;
  blocked: number;
  /** Selected for active orders but earlier steps are not done yet. */
  upcoming: number;
  items: QueueItem[];
}

/** Priority first (in the order it was granted), then first come first served. */
export function queueOrder(a: QueueItem, b: QueueItem): number {
  if (a.status !== b.status && (a.status === "IN_PROGRESS" || b.status === "IN_PROGRESS")) return a.status === "IN_PROGRESS" ? -1 : 1;
  if (a.order.isPriority !== b.order.isPriority) return a.order.isPriority ? -1 : 1;
  if (a.order.isPriority && b.order.isPriority) return (a.order.prioritySetAt?.getTime() ?? 0) - (b.order.prioritySetAt?.getTime() ?? 0);
  return (a.readyAt?.getTime() ?? 0) - (b.readyAt?.getTime() ?? 0);
}

async function loadItems(ctx: Ctx, where: { type?: ProductionType; keys?: string[]; statuses?: QueueItem["status"][] }): Promise<QueueItem[]> {
  const conds = [inArray(orders.status, [...ACTIVE_STATUSES])];
  if (where.type) conds.push(eq(orders.productionType, where.type));
  if (where.keys) conds.push(inArray(productionSteps.key, where.keys.length ? where.keys : ["-"]));
  if (where.statuses) conds.push(inArray(productionSteps.status, where.statuses));
  const rows = await ctx.db
    .select({
      step: productionSteps,
      order: {
        id: orders.id,
        code: orders.code,
        title: orders.title,
        quantity: orders.quantity,
        productionType: orders.productionType,
        isPriority: orders.isPriority,
        prioritySetAt: orders.prioritySetAt,
        artworkStatus: orders.artworkStatus,
        requestedDeadline: orders.requestedDeadline,
      },
      customerName: customers.fullName,
      machineName: machines.name,
      machineCategory: machines.category,
      assigneeName: users.fullName,
    })
    .from(productionSteps)
    .innerJoin(orders, eq(orders.id, productionSteps.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(machines, eq(machines.id, productionSteps.machineId))
    .leftJoin(employees, eq(employees.id, productionSteps.assigneeId))
    .leftJoin(users, eq(users.id, employees.userId))
    .where(and(...conds));
  const orderIds = [...new Set(rows.map((r) => r.order.id))];
  const details = await stationDetails(ctx, rows.filter((r) => r.step.key === "O_PAPER" || r.step.key === "O_LITHO").map((r) => r.order.id));
  return rows
    .map((r) => ({
      stepId: r.step.id,
      key: r.step.key,
      status: r.step.status,
      readyAt: r.step.readyAt,
      startedAt: r.step.startedAt,
      reworkCount: r.step.reworkCount,
      machineId: r.step.machineId,
      machineName: r.machineName,
      machineCategory: r.machineCategory,
      assigneeName: r.assigneeName,
      order: { ...r.order, customerName: r.customerName },
      blocked: blockedReason(r.step, r.order),
      detail: r.step.key === "O_PAPER" ? (details.paper.get(r.order.id) ?? "در انتظار استعلام قیمت") : r.step.key === "O_LITHO" ? (details.litho.get(r.order.id) ?? LITHO_LABEL.NOT_ORDERED) : null,
    }))
    .filter((i) => orderIds.includes(i.order.id))
    .sort(queueOrder);
}

async function stationDetails(ctx: Ctx, orderIds: string[]) {
  const paper = new Map<string, string>();
  const litho = new Map<string, string>();
  if (orderIds.length === 0) return { paper, litho };
  const quoteCounts = await ctx.db.select({ orderId: supplierQuotes.orderId, n: sql<number>`count(*)::int` }).from(supplierQuotes).where(inArray(supplierQuotes.orderId, orderIds)).groupBy(supplierQuotes.orderId);
  const decided = new Set((await ctx.db.select({ orderId: procurementDecisions.orderId }).from(procurementDecisions).where(inArray(procurementDecisions.orderId, orderIds))).map((d) => d.orderId));
  for (const q of quoteCounts) paper.set(q.orderId, decided.has(q.orderId) ? "تأمین‌کننده انتخاب شد — منتظر رسیدن کاغذ" : `${new Intl.NumberFormat("fa-IR").format(q.n)} قیمت ثبت شده — منتظر تصمیم مدیر`);
  for (const id of decided) if (!paper.has(id)) paper.set(id, "تأمین‌کننده انتخاب شد — منتظر رسیدن کاغذ");
  const jobs = await ctx.db.select({ orderId: lithographyJobs.orderId, status: lithographyJobs.status }).from(lithographyJobs).where(inArray(lithographyJobs.orderId, orderIds));
  for (const j of jobs) litho.set(j.orderId, LITHO_LABEL[j.status]);
  return { paper, litho };
}

function summarize(st: Station, items: QueueItem[]): StationQueue {
  const mine = items.filter((i) => i.key === st.key);
  const live = mine.filter((i) => i.status === "READY" || i.status === "IN_PROGRESS");
  return {
    station: st,
    working: live.filter((i) => i.status === "IN_PROGRESS").length,
    waiting: live.filter((i) => i.status === "READY").length,
    priority: live.filter((i) => i.order.isPriority).length,
    blocked: live.filter((i) => i.blocked).length,
    upcoming: mine.filter((i) => i.status === "WAITING").length,
    items: live,
  };
}

/** Every station of one process with its workload (Digital or Offset queue board). */
export async function stationQueues(ctx: Ctx, type: ProductionType): Promise<StationQueue[]> {
  assertCanAny(ctx, QUEUE_PERMISSION[type], "dashboard.view");
  const items = await loadItems(ctx, { type, statuses: ["WAITING", "READY", "IN_PROGRESS"] });
  return stationsOf(type).map((st) => summarize(st, items));
}

// ── My work ─────────────────────────────────────────────────────────────────

export interface WorkOrderRef {
  id: string;
  code: string;
  title: string;
  productionType: ProductionType;
  customerName: string;
  isPriority: boolean;
  status: string;
  artworkStatus: string;
  createdAt: Date;
  note?: string | null;
}

const orderRef = {
  id: orders.id,
  code: orders.code,
  title: orders.title,
  productionType: orders.productionType,
  customerName: customers.fullName,
  isPriority: orders.isPriority,
  status: orders.status,
  artworkStatus: orders.artworkStatus,
  createdAt: orders.createdAt,
};

export interface MyWork {
  approvals: WorkOrderRef[];
  waitingCustomer: WorkOrderRef[];
  artworkReviews: WorkOrderRef[];
  design: WorkOrderRef[];
  paperDecisions: WorkOrderRef[];
  pressAssignment: QueueItem[];
  stations: { station: Station; items: QueueItem[] }[];
  pricing: WorkOrderRef[];
  payments: { id: string; amount: number; method: string; orderId: string; orderCode: string; customerName: string; createdAt: Date }[];
  total: number;
}

/**
 * Everything the signed-in employee can act on right now, most urgent first:
 * the page every role opens to know what to do within seconds.
 */
export async function myWork(ctx: Ctx): Promise<MyWork> {
  const types = (["DIGITAL", "OFFSET"] as const).filter((t) => can(ctx, APPROVE_PERMISSION[t]));
  const approvalRows = types.length
    ? await ctx.db.select(orderRef).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(and(inArray(orders.status, ["WAITING_APPROVAL", "NEEDS_INFO"]), inArray(orders.productionType, types))).orderBy(sql`${orders.isPriority} desc`, asc(orders.createdAt))
    : [];
  const workTypes = (["DIGITAL", "OFFSET"] as const).filter((t) => worksOnType(ctx, t));

  let artworkReviews: WorkOrderRef[] = [];
  if (can(ctx, "artwork.review")) {
    const scope = can(ctx, "design.work") ? (["DIGITAL", "OFFSET"] as const) : workTypes;
    if (scope.length) {
      artworkReviews = await ctx.db
        .select(orderRef)
        .from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(and(eq(orders.artworkStatus, "AWAITING_REVIEW"), notInArray(orders.status, ["REJECTED", "CANCELLED", "DELIVERED"]), inArray(orders.productionType, [...scope])))
        .orderBy(sql`${orders.isPriority} desc`, asc(orders.updatedAt));
    }
  }

  let design: WorkOrderRef[] = [];
  if (can(ctx, "design.work") && ctx.actor.kind === "staff") {
    const me = ctx.actor.employeeId;
    design = await ctx.db
      .select(orderRef)
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(eq(orders.needsDesign, true), inArray(orders.artworkStatus, ["DESIGN_REQUESTED", "DESIGN_IN_PROGRESS"]), inArray(orders.status, ["APPROVED", "IN_PRODUCTION"]), sql`(${orders.designerId} IS NULL OR ${orders.designerId} = ${me})`))
      .orderBy(sql`${orders.isPriority} desc`, asc(orders.approvedAt));
  }

  let paperDecisions: WorkOrderRef[] = [];
  if (can(ctx, "offset.paper.approve")) {
    paperDecisions = await ctx.db
      .selectDistinct(orderRef)
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(supplierQuotes, eq(supplierQuotes.orderId, orders.id))
      .innerJoin(productionSteps, and(eq(productionSteps.orderId, orders.id), eq(productionSteps.key, "O_PAPER")))
      .leftJoin(procurementDecisions, eq(procurementDecisions.orderId, orders.id))
      .where(and(isNull(procurementDecisions.id), inArray(orders.status, [...ACTIVE_STATUSES]), sql`${productionSteps.status} <> 'DONE'`));
  }

  // Station work the user is allowed to perform.
  const allowed = ["DIGITAL", "OFFSET"].flatMap((t) => stationsOf(t as ProductionType)).filter((s) => can(ctx, s.permission));
  const live = allowed.length ? await loadItems(ctx, { keys: allowed.map((s) => s.key), statuses: ["READY", "IN_PROGRESS"] }) : [];
  const stations = allowed.map((st) => ({ station: st, items: live.filter((i) => i.key === st.key) })).filter((g) => g.items.length > 0);

  let pressAssignment: QueueItem[] = [];
  if (can(ctx, "offset.press.assign")) {
    const prints = await loadItems(ctx, { keys: ["O_PRINT"], statuses: ["WAITING", "READY"] });
    pressAssignment = prints.filter((i) => !i.machineId);
  }

  let pricing: WorkOrderRef[] = [];
  if (can(ctx, "order.price")) {
    pricing = await ctx.db
      .select(orderRef)
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(eq(orders.kind, "CUSTOM"), isNull(orders.pricedAt), inArray(orders.status, ["APPROVED", "IN_PRODUCTION", "READY"])))
      .orderBy(asc(orders.approvedAt));
  }

  let pendingPayments: MyWork["payments"] = [];
  if (can(ctx, "payment.record")) {
    pendingPayments = await ctx.db
      .select({ id: payments.id, amount: payments.amount, method: payments.method, orderId: orders.id, orderCode: orders.code, customerName: customers.fullName, createdAt: payments.createdAt })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(customers, eq(customers.id, payments.customerId))
      .where(eq(payments.status, "AWAITING_APPROVAL"))
      .orderBy(asc(payments.createdAt));
  }

  const approvals = approvalRows.filter((o) => o.status === "WAITING_APPROVAL");
  const waitingCustomer = approvalRows.filter((o) => o.status === "NEEDS_INFO");
  const total = approvals.length + artworkReviews.length + design.length + paperDecisions.length + pressAssignment.length + stations.reduce((s, g) => s + g.items.length, 0) + pricing.length + pendingPayments.length;
  return { approvals, waitingCustomer, artworkReviews, design, paperDecisions, pressAssignment, stations, pricing, payments: pendingPayments, total };
}

/** Steps of one order with display data (order page). */
export async function orderSteps(ctx: Ctx, orderId: string) {
  const rows = await ctx.db
    .select({ step: productionSteps, machineName: machines.name, assigneeName: users.fullName })
    .from(productionSteps)
    .leftJoin(machines, eq(machines.id, productionSteps.machineId))
    .leftJoin(employees, eq(employees.id, productionSteps.assigneeId))
    .leftJoin(users, eq(users.id, employees.userId))
    .where(eq(productionSteps.orderId, orderId))
    .orderBy(asc(productionSteps.phase), asc(productionSteps.key));
  return rows.map((r) => ({ ...r, station: station(r.step.key) }));
}
