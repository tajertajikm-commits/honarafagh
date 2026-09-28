import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  artworkVersions,
  customers,
  deliveryMethods,
  fileObjects,
  materialRequirements,
  materials,
  orderChangeRequests,
  orderEvents,
  orderItems,
  orders,
  payments,
  productionIssues,
  productionJobs,
  productionTasks,
  shipmentItems,
  shipments,
  users,
} from "@/server/db/schema";
import { type Ctx, assertCan, can } from "@/server/core/context";
import { notFound } from "@/server/core/errors";
import type { PriceBreakdown } from "@/server/modules/pricing/types";
import type { CustomerMilestone } from "@/server/modules/workflow/types";
import { normalizeFa, normalizePhone, toEnDigits } from "@/lib/persian";

type Order = typeof orders.$inferSelect;
type Task = typeof productionTasks.$inferSelect;

export interface OrderListFilters {
  q?: string;
  status?: Order["status"][];
  domain?: { key: "paymentStatus" | "fileStatus" | "productionStatus" | "deliveryStatus" | "procurementStatus" | "qcStatus"; value: string };
  customerId?: string;
  late?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listOrders(ctx: Ctx, f: OrderListFilters = {}) {
  const conds: SQL[] = [];
  if (ctx.actor.kind === "customer") conds.push(eq(orders.customerId, ctx.actor.customerId));
  else assertCan(ctx, "order.view");
  if (f.customerId) conds.push(eq(orders.customerId, f.customerId));
  if (f.status?.length) conds.push(inArray(orders.status, f.status));
  if (f.domain) conds.push(sql`${orders[f.domain.key]}::text = ${f.domain.value}`);
  if (f.late) conds.push(sql`${orders.dueDate} < now() AND ${orders.status} NOT IN ('COMPLETED','CANCELLED','READY')`);
  if (f.q?.trim()) {
    const q = normalizeFa(f.q);
    const digits = toEnDigits(q).replace(/\D/g, "");
    const phone = normalizePhone(q);
    const or_: SQL[] = [ilike(customers.fullName, `%${q}%`), ilike(customers.companyName, `%${q}%`)];
    if (digits.length >= 3 && digits.length <= 7) or_.push(sql`${orders.number}::text LIKE ${digits + "%"}`);
    if (phone) or_.push(eq(customers.phone, phone));
    else if (digits.length >= 4) or_.push(ilike(customers.phone, `%${digits}%`));
    conds.push(or(...or_)!);
  }
  const pageSize = Math.min(100, f.pageSize ?? 25);
  const page = Math.max(1, f.page ?? 1);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await ctx.db
    .select({ order: orders, customerName: customers.fullName, companyName: customers.companyName, customerPhone: customers.phone })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(where)
    .orderBy(desc(orders.placedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = (await ctx.db.select({ total: sql<number>`count(*)::int` }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where)) as [{ total: number }];
  const ids = rows.map((r) => r.order.id);
  const items = ids.length ? await ctx.db.select({ orderId: orderItems.orderId, title: orderItems.title, quantity: orderItems.quantity }).from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.lineNo)) : [];
  return {
    rows: rows.map((r) => ({ ...r, items: items.filter((i) => i.orderId === r.order.id) })),
    total,
    page,
    pageSize,
  };
}

/** Full order for staff; customers receive a sanitized projection. */
export async function getOrderDetail(ctx: Ctx, orderId: string) {
  return ctx.actor.kind === "customer" ? getCustomerOrder(ctx, orderId) : getStaffOrder(ctx, orderId);
}

export type CustomerOrderView = Awaited<ReturnType<typeof getCustomerOrder>>;
export type StaffOrderView = Awaited<ReturnType<typeof getStaffOrder>>;

export async function getCustomerOrder(ctx: Ctx, orderId: string) {
  if (ctx.actor.kind !== "customer") throw notFound("سفارش");
  const b = await loadBundle(ctx, orderId, true);
  return b.customerView();
}

export async function getStaffOrder(ctx: Ctx, orderId: string) {
  assertCan(ctx, "order.view");
  const b = await loadBundle(ctx, orderId, false);
  return b.staffView();
}

async function loadBundle(ctx: Ctx, orderId: string, isCustomer: boolean) {
  const [row] = await ctx.db
    .select({ order: orders, customer: customers, deliveryMethod: deliveryMethods })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(deliveryMethods, eq(deliveryMethods.id, orders.deliveryMethodId))
    .where(eq(orders.id, orderId));
  if (!row) throw notFound("سفارش");
  if (isCustomer && row.order.customerId !== (ctx.actor as { customerId: string }).customerId) throw notFound("سفارش");

  const items = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.lineNo));
  const itemIds = items.map((i) => i.id);
  const artwork = itemIds.length
    ? await ctx.db
        .select({ version: artworkVersions, file: { id: fileObjects.id, originalName: fileObjects.originalName, mimeType: fileObjects.mimeType, sizeBytes: fileObjects.sizeBytes }, uploader: users.fullName })
        .from(artworkVersions)
        .innerJoin(fileObjects, eq(fileObjects.id, artworkVersions.fileId))
        .leftJoin(users, eq(users.id, artworkVersions.uploadedBy))
        .where(inArray(artworkVersions.orderItemId, itemIds))
        .orderBy(desc(artworkVersions.versionNo))
    : [];
  const tasks = await ctx.db.select().from(productionTasks).where(eq(productionTasks.orderId, orderId)).orderBy(asc(productionTasks.sortOrder), asc(productionTasks.attempt));
  const jobs = await ctx.db.select().from(productionJobs).where(eq(productionJobs.orderId, orderId));
  const pays = await ctx.db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(asc(payments.createdAt));
  const ships = await ctx.db.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(asc(shipments.createdAt));
  const shipLines = ships.length ? await ctx.db.select().from(shipmentItems).where(inArray(shipmentItems.shipmentId, ships.map((s) => s.id))) : [];
  const events = await ctx.db
    .select({ event: orderEvents, actorName: users.fullName })
    .from(orderEvents)
    .leftJoin(users, eq(users.id, orderEvents.actorId))
    .where(isCustomer ? and(eq(orderEvents.orderId, orderId), eq(orderEvents.visibleToCustomer, true)) : eq(orderEvents.orderId, orderId))
    .orderBy(desc(orderEvents.createdAt));
  const changeRequests = await ctx.db.select().from(orderChangeRequests).where(eq(orderChangeRequests.orderId, orderId)).orderBy(desc(orderChangeRequests.createdAt));
  const timeline = customerTimeline(row.order, items, tasks);

  const customerView = () => ({
      order: sanitizeOrder(row.order),
      customer: { fullName: row.customer.fullName, phone: row.customer.phone },
      deliveryMethod: row.deliveryMethod ? { name: row.deliveryMethod.name, kind: row.deliveryMethod.kind } : null,
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        quantity: i.quantity,
        unitLabel: i.unitLabel,
        lineSubtotal: i.lineSubtotal,
        summary: (i.priceSnapshot as PriceBreakdown | null)?.spec.summary ?? [],
        fileStatus: i.fileStatus,
        productionStatus: i.productionStatus,
        quantityDelivered: i.quantityDelivered,
        needsDesign: i.needsDesign,
      })),
      artwork: artwork
        .filter((a) => ["CUSTOMER_ORIGINAL", "PROOF", "DESIGNER"].includes(a.version.stage) && (a.version.stage === "CUSTOMER_ORIGINAL" || ["SENT_FOR_APPROVAL", "CUSTOMER_APPROVED", "CUSTOMER_REJECTED", "APPROVED_FOR_PRINT", "SUPERSEDED"].includes(a.version.status)))
        .map((a) => ({ id: a.version.id, itemId: a.version.orderItemId, versionNo: a.version.versionNo, stage: a.version.stage, status: a.version.status, note: a.version.note, reviewNote: a.version.status === "REJECTED" ? a.version.reviewNote : null, customerComment: a.version.customerComment, createdAt: a.version.createdAt, file: a.file })),
      payments: pays.filter((p) => ["CONFIRMED", "AWAITING_APPROVAL", "REJECTED"].includes(p.status)).map((p) => ({ id: p.id, kind: p.kind, method: p.method, status: p.status, amount: p.amount, reference: p.method === "ONLINE" ? p.providerRefId : p.reference, createdAt: p.createdAt, rejectionReason: p.rejectionReason })),
      shipments: ships.map((s) => ({ id: s.id, status: s.status, trackingCode: s.trackingCode, externalProvider: s.externalProvider, dispatchedAt: s.dispatchedAt, deliveredAt: s.deliveredAt, recipientName: s.recipientName, quantity: shipLines.filter((l) => l.shipmentId === s.id).reduce((a, l) => a + l.quantity, 0) })),
      events: events.map((e) => ({ id: e.event.id, type: e.event.type, message: e.event.message, createdAt: e.event.createdAt })),
      changeRequests: changeRequests.map((c) => ({ id: c.id, description: c.description, status: c.status, resolution: c.resolution, createdAt: c.createdAt })),
      timeline,
    });

  const staffView = async () => {
  const requirements = itemIds.length
    ? await ctx.db
        .select({ req: materialRequirements, material: { id: materials.id, sku: materials.sku, name: materials.name, unit: materials.unit } })
        .from(materialRequirements)
        .innerJoin(materials, eq(materials.id, materialRequirements.materialId))
        .where(inArray(materialRequirements.orderItemId, itemIds))
    : [];
  const issues = await ctx.db.select().from(productionIssues).where(eq(productionIssues.orderId, orderId)).orderBy(desc(productionIssues.createdAt));
  return {
    order: row.order,
    customer: row.customer,
    deliveryMethod: row.deliveryMethod,
    items,
    artwork,
    tasks,
    jobs,
    requirements,
    payments: pays,
    shipments: ships,
    shipmentItems: shipLines,
    events,
    issues,
    changeRequests,
    timeline,
    canSeeCosts: can(ctx, "order.price.override") || can(ctx, "report.view"),
  };
  };
  return { customerView, staffView };
}

function sanitizeOrder(o: Order) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fileStatus: o.fileStatus,
    productionStatus: o.productionStatus,
    deliveryStatus: o.deliveryStatus,
    qcStatus: o.qcStatus,
    urgency: o.urgency,
    subtotal: o.subtotal,
    discountAmount: o.discountAmount,
    shippingAmount: o.shippingAmount,
    vatPct: o.vatPct,
    vatAmount: o.vatAmount,
    total: o.total,
    paidAmount: o.paidAmount,
    refundedAmount: o.refundedAmount,
    depositPct: o.depositPct,
    dueDate: o.dueDate,
    shippingAddress: o.shippingAddress,
    customerNote: o.customerNote,
    placedAt: o.placedAt,
    completedAt: o.completedAt,
    cancelReason: o.cancelReason,
  };
}

// ── Customer-facing progress timeline ───────────────────────────────────────

export type MilestoneState = "done" | "current" | "upcoming" | "skipped";
export interface TimelineStep {
  key: "RECEIVED" | CustomerMilestone | "READY" | "DELIVERED";
  label: string;
  state: MilestoneState;
  at?: Date | null;
}

const MILESTONE_LABEL: Record<TimelineStep["key"], string> = {
  RECEIVED: "ثبت سفارش",
  FILE: "آماده‌سازی و تأیید فایل",
  MATERIALS: "تأمین مواد",
  PRODUCTION: "چاپ",
  FINISHING: "عملیات تکمیلی",
  QC: "کنترل کیفیت",
  PACKAGING: "بسته‌بندی",
  READY: "آماده تحویل",
  DELIVERED: "تحویل شد",
};

/**
 * Collapses the internal task graph into a simple, non-sensitive progress
 * line. Machines, people, costs and rework details are never exposed.
 */
export function customerTimeline(order: Pick<Order, "status" | "placedAt" | "readyAt" | "deliveryStatus" | "fileStatus">, items: Pick<typeof orderItems.$inferSelect, "id">[], tasks: Pick<Task, "stepKey" | "attempt" | "status" | "milestone" | "completedAt" | "jobId">[]): TimelineStep[] {
  const latest = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) {
    const k = `${t.jobId}|${t.stepKey}`;
    const c = latest.get(k);
    if (!c || t.attempt > c.attempt) latest.set(k, t);
  }
  const cur = [...latest.values()];
  const done = (s: string) => ["COMPLETED", "SKIPPED", "CANCELLED"].includes(s);
  const MILESTONES: CustomerMilestone[] = ["FILE", "MATERIALS", "PRODUCTION", "FINISHING", "QC", "PACKAGING"];

  const steps: TimelineStep[] = [{ key: "RECEIVED", label: MILESTONE_LABEL.RECEIVED, state: "done", at: order.placedAt }];
  for (const m of MILESTONES) {
    const ts = cur.filter((t) => t.milestone === m);
    if (m === "FILE" && ts.length === 0) {
      steps.push({ key: m, label: MILESTONE_LABEL[m], state: order.fileStatus === "APPROVED" || order.fileStatus === "NOT_REQUIRED" ? "done" : "upcoming" });
      continue;
    }
    if (ts.length === 0) {
      if (m !== "FINISHING") steps.push({ key: m, label: MILESTONE_LABEL[m], state: "upcoming" });
      continue;
    }
    const allDone = ts.every((t) => done(t.status));
    const lastAt = allDone ? ts.reduce<Date | null>((a, t) => (t.completedAt && (!a || t.completedAt > a) ? t.completedAt : a), null) : null;
    steps.push({ key: m, label: MILESTONE_LABEL[m], state: allDone ? "done" : "upcoming", at: lastAt });
  }
  const ready = ["READY", "COMPLETED"].includes(order.status) || ["PARTIALLY_DELIVERED", "DELIVERED", "OUT_FOR_DELIVERY", "SCHEDULED"].includes(order.deliveryStatus);
  steps.push({ key: "READY", label: MILESTONE_LABEL.READY, state: ready ? "done" : "upcoming", at: order.readyAt });
  steps.push({ key: "DELIVERED", label: MILESTONE_LABEL.DELIVERED, state: order.deliveryStatus === "DELIVERED" ? "done" : "upcoming" });

  if (order.status === "CANCELLED") return steps.map((s) => (s.state === "done" ? s : { ...s, state: "skipped" }));
  // The first not-done step is the current one; a later "done" before it can't exist visually.
  const firstOpen = steps.findIndex((s) => s.state !== "done");
  if (firstOpen >= 0) {
    for (let i = firstOpen + 1; i < steps.length; i++) if (steps[i]!.state === "done") steps[i] = { ...steps[i]!, state: "upcoming" };
    steps[firstOpen] = { ...steps[firstOpen]!, state: "current" };
  }
  void items;
  return steps;
}

/** Public tracking by order number + phone (no login). */
export async function trackOrder(ctx: Ctx, number: number, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone || !Number.isInteger(number)) throw notFound("سفارش");
  const [row] = await ctx.db
    .select({ order: orders })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.number, number), eq(customers.phone, phone)));
  if (!row) throw notFound("سفارشی با این مشخصات");
  const items = await ctx.db.select({ id: orderItems.id, title: orderItems.title, quantity: orderItems.quantity, unitLabel: orderItems.unitLabel }).from(orderItems).where(eq(orderItems.orderId, row.order.id));
  const tasks = await ctx.db.select().from(productionTasks).where(eq(productionTasks.orderId, row.order.id));
  const o = row.order;
  return {
    number: o.number,
    status: o.status,
    placedAt: o.placedAt,
    dueDate: o.dueDate,
    items: items.map((i) => ({ title: i.title, quantity: i.quantity, unitLabel: i.unitLabel })),
    timeline: customerTimeline(o, items, tasks),
  };
}
