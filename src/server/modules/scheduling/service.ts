import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import {
  machineMaintenance,
  machines,
  materialRequests,
  materialRequirements,
  orders,
  productionJobs,
  productionTasks,
  purchaseOrderLines,
  purchaseOrders,
} from "@/server/db/schema";
import type { Ctx } from "@/server/core/context";
import { workCalendar } from "@/server/modules/settings/service";
import { schedule, type ScheduleResult } from "./scheduler";

let cache: { at: number; result: ScheduleSnapshot } | null = null;

export interface ScheduleSnapshot extends ScheduleResult {
  computedAt: Date;
  jobOrder: Map<string, string>;
}

/**
 * Builds the scheduling problem from live data, runs the scheduler and stores
 * each order's projected completion. Cached briefly for dashboards.
 */
export async function computeSchedule(ctx: Ctx, opts: { maxAgeMs?: number; persist?: boolean } = {}): Promise<ScheduleSnapshot> {
  if (cache && Date.now() - cache.at < (opts.maxAgeMs ?? 60_000) && !opts.persist) return cache.result;
  const now = new Date();
  const cal = await workCalendar(ctx.db);
  const jobs = await ctx.db
    .select({ id: productionJobs.id, orderId: productionJobs.orderId, priority: productionJobs.priority, dueDate: orders.dueDate, itemId: productionJobs.orderItemId })
    .from(productionJobs)
    .innerJoin(orders, eq(orders.id, productionJobs.orderId))
    .where(and(inArray(productionJobs.status, ["RELEASED", "IN_PROGRESS", "ON_HOLD"]), notInArray(orders.status, ["CANCELLED", "ON_HOLD"])));
  const ms = await ctx.db.select().from(machines).where(eq(machines.isActive, true));
  const maint = await ctx.db.select().from(machineMaintenance).where(inArray(machineMaintenance.status, ["SCHEDULED", "IN_PROGRESS"]));
  const jobIds = jobs.map((j) => j.id);
  const tasks = jobIds.length ? await ctx.db.select().from(productionTasks).where(inArray(productionTasks.jobId, jobIds)) : [];

  // Expected arrival of missing material → when material gates will clear.
  const itemIds = jobs.map((j) => j.itemId);
  const arrivals = itemIds.length
    ? await ctx.db
        .select({ itemId: materialRequirements.orderItemId, purpose: materialRequirements.purpose, expectedAt: sql<Date | null>`max(${purchaseOrders.expectedAt})` })
        .from(materialRequirements)
        .innerJoin(materialRequests, eq(materialRequests.requirementId, materialRequirements.id))
        .leftJoin(purchaseOrderLines, eq(purchaseOrderLines.id, materialRequests.purchaseOrderLineId))
        .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
        .where(and(inArray(materialRequirements.orderItemId, itemIds), inArray(materialRequests.status, ["OPEN", "ORDERED"])))
        .groupBy(materialRequirements.orderItemId, materialRequirements.purpose)
    : [];
  const itemOfJob = new Map(jobs.map((j) => [j.id, j.itemId]));

  // Current attempts only
  const latest = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) {
    const k = `${t.jobId}|${t.stepKey}`;
    const c = latest.get(k);
    if (!c || t.attempt > c.attempt) latest.set(k, t);
  }
  const result = schedule({
    now,
    calendar: cal,
    machines: ms.map((m) => ({
      id: m.id,
      typeCode: m.typeCode,
      available: m.status === "ACTIVE",
      unavailable: maint.filter((w) => w.machineId === m.id).map((w) => ({ from: w.scheduledStart, to: w.scheduledEnd })),
    })),
    jobs: jobs.map((j) => ({ id: j.id, priority: j.priority, dueDate: j.dueDate })),
    tasks: [...latest.values()].map((t) => {
      const gate = t.gate;
      let expectedClearAt: Date | null = null;
      if (gate?.kind === "MATERIAL" && !["COMPLETED", "SKIPPED"].includes(t.status)) {
        const rows = arrivals.filter((a) => a.itemId === itemOfJob.get(t.jobId) && gate.purposes.includes(a.purpose as "PAPER"));
        const dates = rows.map((r) => (r.expectedAt ? new Date(r.expectedAt) : new Date(now.getTime() + 3 * 86_400_000)));
        expectedClearAt = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
      }
      return {
        id: t.id,
        jobId: t.jobId,
        stepKey: t.stepKey,
        status: t.status,
        dependsOn: t.dependsOn,
        machineTypeCode: t.machineTypeCode,
        machineId: t.machineId,
        estimatedMinutes: t.estimatedMinutes,
        workedMinutes: t.actualMinutes,
        minLagMinutes: t.minLagMinutes,
        earliestStartAt: t.earliestStartAt,
        completedAt: t.completedAt,
        expectedClearAt,
        isGate: !!gate,
        sortOrder: t.sortOrder,
      };
    }),
  });
  const jobOrder = new Map(jobs.map((j) => [j.id, j.orderId]));
  const snapshot: ScheduleSnapshot = { ...result, computedAt: now, jobOrder };

  if (opts.persist) {
    const perOrder = new Map<string, Date>();
    for (const [jobId, end] of result.jobCompletion) {
      const orderId = jobOrder.get(jobId)!;
      const cur = perOrder.get(orderId);
      if (!cur || end > cur) perOrder.set(orderId, end);
    }
    for (const [orderId, end] of perOrder) {
      await ctx.db.update(orders).set({ projectedCompletionAt: end }).where(and(eq(orders.id, orderId), ne(orders.status, "CANCELLED")));
    }
  }
  cache = { at: Date.now(), result: snapshot };
  return snapshot;
}

export function invalidateScheduleCache() {
  cache = null;
}
