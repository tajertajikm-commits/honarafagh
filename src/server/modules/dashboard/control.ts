import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import {
  artworkVersions,
  customers,
  employees,
  machineMaintenance,
  machines,
  materialRequests,
  materials,
  orderItems,
  orders,
  payments,
  productionIssues,
  productionTasks,
  purchaseOrders,
  qcInspections,
  shipments,
  stepTypes,
  stockLevels,
  users,
} from "@/server/db/schema";
import { type Ctx, assertCan } from "@/server/core/context";
import { computeSchedule } from "@/server/modules/scheduling/service";
import { formatNumber, toFaDigits } from "@/lib/persian";

const n = (v: number) => formatNumber(v);

const OPEN_ORDER = ["PENDING_REVIEW", "CONFIRMED", "IN_PROGRESS", "ON_HOLD", "READY"] as const;
const latestOnly = sql`${productionTasks.attempt} = (SELECT max(t2.attempt) FROM production_tasks t2 WHERE t2.job_id = ${productionTasks.jobId} AND t2.step_key = ${productionTasks.stepKey})`;

export type Alert = { key: string; severity: "critical" | "warning" | "info"; title: string; detail: string; href: string; count?: number };

export async function controlCenter(ctx: Ctx) {
  assertCan(ctx, "order.view");
  const now = new Date();
  const dayStart = new Date(now.getTime() - ((now.getTime() + 3.5 * 3600_000) % 86_400_000)); // Tehran midnight

  const openOrders = await ctx.db
    .select({ id: orders.id, number: orders.number, status: orders.status, paymentStatus: orders.paymentStatus, fileStatus: orders.fileStatus, productionStatus: orders.productionStatus, procurementStatus: orders.procurementStatus, deliveryStatus: orders.deliveryStatus, dueDate: orders.dueDate, projected: orders.projectedCompletionAt, total: orders.total, paid: orders.paidAmount, refunded: orders.refundedAmount, priority: orders.priority, placedAt: orders.placedAt, customer: customers.fullName })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(inArray(orders.status, [...OPEN_ORDER]))
    .orderBy(asc(orders.dueDate));

  const late = openOrders.filter((o) => o.dueDate && o.dueDate < now && o.status !== "READY");
  const schedule = await computeSchedule(ctx);
  const projectedLate = schedule.lateJobs
    .map((l) => ({ ...l, order: openOrders.find((o) => o.id === schedule.jobOrder.get(l.jobId)) }))
    .filter((l) => l.order && !late.some((x) => x.id === l.order!.id));

  const [{ revenueToday }] = (await ctx.db
    .select({ revenueToday: sql<number>`coalesce(sum(CASE WHEN ${payments.kind} = 'PAYMENT' THEN ${payments.amount} ELSE -${payments.amount} END), 0)::bigint` })
    .from(payments)
    .where(and(eq(payments.status, "CONFIRMED"), gte(payments.confirmedAt, dayStart)))) as [{ revenueToday: number }];
  const receivables = openOrders.filter((o) => o.status !== "PENDING_REVIEW").reduce((s, o) => s + Math.max(0, o.total - (o.paid - o.refunded)), 0);

  // Machines: live state + load
  const ms = await ctx.db.select().from(machines).where(eq(machines.isActive, true)).orderBy(asc(machines.typeCode), asc(machines.code));
  const running = await ctx.db
    .select({ machineId: productionTasks.machineId, name: productionTasks.name, orderId: productionTasks.orderId, startedAt: productionTasks.startedAt, status: productionTasks.status, orderNumber: orders.number, operator: users.fullName })
    .from(productionTasks)
    .innerJoin(orders, eq(orders.id, productionTasks.orderId))
    .leftJoin(employees, eq(employees.id, productionTasks.assigneeId))
    .leftJoin(users, eq(users.id, employees.userId))
    .where(and(inArray(productionTasks.status, ["IN_PROGRESS", "PAUSED"]), sql`${productionTasks.machineId} IS NOT NULL`));
  const maint = await ctx.db.select().from(machineMaintenance).where(and(inArray(machineMaintenance.status, ["SCHEDULED", "IN_PROGRESS"]), lt(machineMaintenance.scheduledStart, new Date(now.getTime() + 3 * 86_400_000))));
  const machineRows = ms.map((m) => {
    const load = schedule.machineLoad.get(m.id);
    const cur = running.find((r) => r.machineId === m.id && r.status === "IN_PROGRESS") ?? running.find((r) => r.machineId === m.id);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      typeCode: m.typeCode,
      status: m.status,
      busy: !!cur && cur.status === "IN_PROGRESS",
      current: cur ? { name: cur.name, orderId: cur.orderId, orderNumber: cur.orderNumber, operator: cur.operator, startedAt: cur.startedAt, paused: cur.status === "PAUSED" } : null,
      queuedMinutes: load?.queuedMinutes ?? 0,
      queuedTasks: load?.taskCount ?? 0,
      busyUntil: load?.busyUntil ?? null,
      maintenance: maint.find((x) => x.machineId === m.id) ?? null,
    };
  });

  // Pipeline / bottlenecks: waiting work per step type (current attempts only)
  const pipeline = await ctx.db
    .select({ code: productionTasks.stepTypeCode, name: stepTypes.name, category: stepTypes.category, status: productionTasks.status, n: sql<number>`count(*)::int`, minutes: sql<number>`coalesce(sum(${productionTasks.estimatedMinutes}),0)::int` })
    .from(productionTasks)
    .innerJoin(stepTypes, eq(stepTypes.code, productionTasks.stepTypeCode))
    .innerJoin(orders, eq(orders.id, productionTasks.orderId))
    .where(and(inArray(productionTasks.status, ["READY", "IN_PROGRESS", "PAUSED", "BLOCKED"]), isNull(productionTasks.gate), notInArray(orders.status, ["CANCELLED", "ON_HOLD"]), latestOnly))
    .groupBy(productionTasks.stepTypeCode, stepTypes.name, stepTypes.category, productionTasks.status, stepTypes.sortOrder)
    .orderBy(asc(stepTypes.sortOrder));
  const byStep = new Map<string, { code: string; name: string; ready: number; active: number; blocked: number; minutes: number }>();
  for (const p of pipeline) {
    const s = byStep.get(p.code) ?? { code: p.code, name: p.name, ready: 0, active: 0, blocked: 0, minutes: 0 };
    if (p.status === "READY") s.ready += p.n;
    else if (p.status === "BLOCKED") s.blocked += p.n;
    else s.active += p.n;
    s.minutes += p.minutes;
    byStep.set(p.code, s);
  }
  const steps = [...byStep.values()];
  const bottleneck = steps.slice().sort((a, b) => b.minutes - a.minutes)[0] ?? null;

  // Employee workload
  const workload = await ctx.db
    .select({ name: users.fullName, title: employees.title, active: sql<number>`count(*) FILTER (WHERE ${productionTasks.status} = 'IN_PROGRESS')::int`, queued: sql<number>`count(*) FILTER (WHERE ${productionTasks.status} IN ('READY','PAUSED'))::int`, minutes: sql<number>`coalesce(sum(${productionTasks.estimatedMinutes}) FILTER (WHERE ${productionTasks.status} IN ('READY','PAUSED','IN_PROGRESS')),0)::int` })
    .from(productionTasks)
    .innerJoin(employees, eq(employees.id, productionTasks.assigneeId))
    .innerJoin(users, eq(users.id, employees.userId))
    .where(inArray(productionTasks.status, ["READY", "IN_PROGRESS", "PAUSED"]))
    .groupBy(users.fullName, employees.title)
    .orderBy(desc(sql`count(*)`));

  // Alerts — each one is actionable and links to where it is resolved
  const alerts: Alert[] = [];
  const issues = await ctx.db
    .select({ id: productionIssues.id, description: productionIssues.description, type: productionIssues.type, orderId: productionIssues.orderId, number: orders.number, task: productionTasks.name })
    .from(productionIssues)
    .innerJoin(orders, eq(orders.id, productionIssues.orderId))
    .innerJoin(productionTasks, eq(productionTasks.id, productionIssues.taskId))
    .where(eq(productionIssues.status, "OPEN"));
  for (const i of issues) alerts.push({ key: `issue-${i.id}`, severity: "critical", title: `مشکل در «${i.task}» — سفارش ${toFaDigits(i.number)}`, detail: i.description, href: `/panel/orders/${i.orderId}` });
  for (const o of late.slice(0, 5)) alerts.push({ key: `late-${o.id}`, severity: "critical", title: `سفارش ${toFaDigits(o.number)} از موعد تحویل گذشته است`, detail: o.customer, href: `/panel/orders/${o.id}` });
  for (const l of projectedLate.slice(0, 5)) alerts.push({ key: `plate-${l.jobId}`, severity: "warning", title: `سفارش ${toFaDigits(l.order!.number)} احتمالاً دیر آماده می‌شود`, detail: `برآورد تأخیر ${n(Math.round(l.lateMinutes / 60))} ساعت بر اساس صف ماشین‌ها`, href: `/panel/orders/${l.order!.id}` });
  const qcFails = await ctx.db
    .select({ id: qcInspections.id, orderId: orderItems.orderId, number: orders.number, rejected: qcInspections.quantityRejected })
    .from(qcInspections)
    .innerJoin(orderItems, eq(orderItems.id, qcInspections.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(qcInspections.result, "FAILED"), gte(qcInspections.createdAt, new Date(now.getTime() - 3 * 86_400_000))));
  for (const q of qcFails) alerts.push({ key: `qc-${q.id}`, severity: "warning", title: `رد کنترل کیفیت — سفارش ${toFaDigits(q.number)}`, detail: `${n(q.rejected)} عدد مردودی، در دوباره‌کاری`, href: `/panel/orders/${q.orderId}` });
  const shortages = await ctx.db
    .select({ id: materialRequests.id, name: materials.name, qty: materialRequests.quantity, unit: materials.unit, status: materialRequests.status })
    .from(materialRequests)
    .innerJoin(materials, eq(materials.id, materialRequests.materialId))
    .where(eq(materialRequests.status, "OPEN"));
  if (shortages.length) alerts.push({ key: "shortages", severity: "warning", title: `${n(shortages.length)} درخواست تأمین مواد بدون سفارش خرید`, detail: shortages.map((s) => s.name).slice(0, 3).join("، "), href: "/panel/procurement", count: shortages.length });
  const low = await ctx.db
    .select({ id: materials.id, name: materials.name, available: sql<number>`coalesce(sum(${stockLevels.onHand} - ${stockLevels.reserved}),0)::float`, reorder: materials.reorderPoint })
    .from(materials)
    .leftJoin(stockLevels, eq(stockLevels.materialId, materials.id))
    .where(eq(materials.isActive, true))
    .groupBy(materials.id)
    .having(sql`coalesce(sum(${stockLevels.onHand} - ${stockLevels.reserved}),0) < ${materials.reorderPoint}`);
  if (low.length) alerts.push({ key: "low", severity: "info", title: `${n(low.length)} کالا زیر نقطه سفارش`, detail: low.map((l) => l.name).slice(0, 3).join("، "), href: "/panel/inventory?low=1", count: low.length });
  const overduePo = await ctx.db.select({ id: purchaseOrders.id, number: purchaseOrders.number }).from(purchaseOrders).where(and(inArray(purchaseOrders.status, ["ORDERED", "PARTIALLY_RECEIVED"]), lt(purchaseOrders.expectedAt, now)));
  if (overduePo.length) alerts.push({ key: "po", severity: "warning", title: `${n(overduePo.length)} سفارش خرید با تأخیر تأمین‌کننده`, detail: overduePo.map((p) => `#${toFaDigits(p.number)}`).join("، "), href: "/panel/procurement", count: overduePo.length });
  const awaitingPay = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.status, "AWAITING_APPROVAL"));
  if (awaitingPay[0]!.n) alerts.push({ key: "pay", severity: "info", title: `${n(awaitingPay[0]!.n)} پرداخت در انتظار تأیید حسابداری`, detail: "رسیدهای واریز و چک‌ها", href: "/panel/accounting", count: awaitingPay[0]!.n });
  const pendingReview = openOrders.filter((o) => o.status === "PENDING_REVIEW");
  if (pendingReview.length) alerts.push({ key: "review", severity: "info", title: `${n(pendingReview.length)} سفارش در انتظار بررسی و تأیید`, detail: pendingReview.map((o) => `#${toFaDigits(o.number)}`).slice(0, 5).join("، "), href: "/panel/orders?status=PENDING_REVIEW", count: pendingReview.length });
  const artworkQueue = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(artworkVersions).where(eq(artworkVersions.status, "UPLOADED"));
  if (artworkQueue[0]!.n) alerts.push({ key: "art", severity: "info", title: `${n(artworkQueue[0]!.n)} فایل در انتظار بررسی پیش از چاپ`, detail: "صف استودیو", href: "/panel/studio", count: artworkQueue[0]!.n });
  for (const m of machineRows.filter((x) => x.status !== "ACTIVE")) alerts.push({ key: `m-${m.id}`, severity: "warning", title: `${m.name} خارج از مدار`, detail: m.status === "MAINTENANCE" ? "در حال تعمیر" : "خارج از سرویس", href: "/panel/machines" });

  const shipmentsOpen = await ctx.db
    .select({ id: shipments.id, status: shipments.status, orderId: shipments.orderId, number: orders.number, customer: customers.fullName, scheduledAt: shipments.scheduledAt })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(inArray(shipments.status, ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"]));

  // 14-day revenue trend
  const trend = await ctx.db.execute<{ day: string; amount: number }>(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(sum(CASE WHEN p.kind = 'PAYMENT' THEN p.amount ELSE -p.amount END), 0)::bigint AS amount
    FROM generate_series((now() AT TIME ZONE 'Asia/Tehran')::date - 13, (now() AT TIME ZONE 'Asia/Tehran')::date, interval '1 day') AS d(day)
    LEFT JOIN payments p ON p.status = 'CONFIRMED' AND (p.confirmed_at AT TIME ZONE 'Asia/Tehran')::date = d.day
    GROUP BY d.day ORDER BY d.day`);

  const severityRank = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    kpis: {
      active: openOrders.filter((o) => o.status !== "PENDING_REVIEW").length,
      pendingReview: pendingReview.length,
      inProduction: openOrders.filter((o) => o.productionStatus === "IN_PROGRESS" || o.productionStatus === "BLOCKED").length,
      ready: openOrders.filter((o) => o.status === "READY").length,
      late: late.length,
      projectedLate: projectedLate.length,
      revenueToday: Number(revenueToday),
      receivables,
      blocked: issues.length,
      waitingMaterial: openOrders.filter((o) => ["WAITING_FOR_MATERIAL", "PARTIALLY_RESERVED"].includes(o.procurementStatus)).length,
    },
    alerts,
    machines: machineRows,
    steps,
    bottleneck,
    workload,
    shipments: shipmentsOpen,
    dueSoon: openOrders.filter((o) => o.status !== "READY").slice(0, 8),
    trend: trend.rows.map((r) => ({ day: r.day, amount: Number(r.amount) })),
    scheduleAt: schedule.computedAt,
  };
}
