import { and, asc, eq, inArray } from "drizzle-orm";
import {
  machines,
  materialRequirements,
  orderItems,
  orders,
  productionJobs,
  productionTasks,
  taskEvents,
  workflowTemplateSteps,
  workflowTemplates,
} from "@/server/db/schema";
import { type Ctx, actorUserId } from "@/server/core/context";
import { invalidState } from "@/server/core/errors";
import { isRequirementSatisfied } from "@/server/modules/inventory/service";
import { orderEvent, orderIdsForItems, recomputeItemProduction, recomputeOrder } from "@/server/modules/orders/state";
import type { PriceBreakdown } from "@/server/modules/pricing/types";
import { findNewlyReady, planTasks, type RuntimeTask } from "@/server/modules/workflow/graph";
import type { Gate, TemplateStepInput } from "@/server/modules/workflow/types";

type Task = typeof productionTasks.$inferSelect;
type Order = typeof orders.$inferSelect;

export const PRIORITY_SCORE: Record<Order["priority"], number> = { URGENT: 10, HIGH: 30, NORMAL: 50, LOW: 70 };

export async function taskEvent(ctx: Ctx, taskId: string, type: string, note?: string | null, data?: Record<string, unknown>) {
  await ctx.db.insert(taskEvents).values({ taskId, type, note: note ?? null, data: data ?? null, actorId: actorUserId(ctx) });
}

export async function activeTemplate(ctx: Ctx, code: string) {
  const [tpl] = await ctx.db
    .select()
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.code, code), eq(workflowTemplates.status, "ACTIVE")))
    .limit(1);
  if (!tpl) throw invalidState(`گردش‌کار فعال «${code}» پیدا نشد.`);
  const steps = await ctx.db.select().from(workflowTemplateSteps).where(eq(workflowTemplateSteps.templateId, tpl.id)).orderBy(asc(workflowTemplateSteps.sortOrder));
  const inputs: TemplateStepInput[] = steps.map((s) => ({
    key: s.key,
    name: s.name,
    stepType: s.stepTypeCode,
    dependsOn: s.dependsOn,
    condition: s.condition,
    gate: s.gate ?? null,
    machineType: s.machineTypeCode,
    defaultMinutes: s.defaultMinutes,
    minLagMinutes: s.minLagMinutes,
    isQc: s.isQc,
    reworkTargets: s.reworkTargets,
    milestone: s.milestone as TemplateStepInput["milestone"],
    checklist: s.checklist,
  }));
  return { template: tpl, steps: inputs };
}

/** Instantiates the workflow of one order item as a production job with its task graph. */
export async function releaseItem(ctx: Ctx, itemId: string) {
  const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.id, itemId)).for("update");
  if (!item) throw invalidState("ردیف سفارش پیدا نشد.");
  const [existing] = await ctx.db.select({ id: productionJobs.id }).from(productionJobs).where(eq(productionJobs.orderItemId, itemId));
  if (existing) return existing.id;
  if (!item.workflowTemplateCode) throw invalidState(`برای «${item.title}» گردش‌کار تولید مشخص نشده است.`);
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, item.orderId));
  const { template, steps } = await activeTemplate(ctx, item.workflowTemplateCode);
  const snap = item.priceSnapshot as PriceBreakdown | null;
  const planned = planTasks(
    steps,
    {
      operationStepTypes: new Set((snap?.operations ?? []).map((o) => o.stepType)),
      flags: new Set([...(snap?.flags ?? []), ...(item.needsDesign ? ["NEEDS_DESIGN"] : [])]),
    },
    snap?.steps ?? [],
  );
  const priority = PRIORITY_SCORE[order!.priority];
  const [job] = await ctx.db
    .insert(productionJobs)
    .values({
      orderId: item.orderId,
      orderItemId: item.id,
      templateId: template.id,
      methodCode: template.methodCode,
      status: "RELEASED",
      quantity: item.quantity,
      priority,
      dueDate: order!.dueDate,
      releasedAt: new Date(),
    })
    .returning();

  // Auto-assign a machine when only one of the required type is active.
  const types = [...new Set(planned.map((p) => p.machineType).filter((x): x is string => !!x))];
  const activeMachines = types.length
    ? await ctx.db.select({ id: machines.id, typeCode: machines.typeCode }).from(machines).where(and(inArray(machines.typeCode, types), eq(machines.status, "ACTIVE"), eq(machines.isActive, true)))
    : [];
  const soleMachine = (type: string | null) => {
    if (!type) return null;
    const ms = activeMachines.filter((m) => m.typeCode === type);
    return ms.length === 1 ? ms[0]!.id : null;
  };

  const inserted = await ctx.db
    .insert(productionTasks)
    .values(
      planned.map((p) => ({
        jobId: job!.id,
        orderId: item.orderId,
        stepKey: p.stepKey,
        stepTypeCode: p.stepType,
        name: p.name,
        dependsOn: p.dependsOn,
        gate: p.gate,
        isQc: p.isQc,
        reworkTargets: p.reworkTargets,
        milestone: p.milestone,
        checklist: p.checklist,
        machineTypeCode: p.machineType,
        machineId: soleMachine(p.machineType),
        priority,
        estimatedMinutes: p.estimatedMinutes,
        minLagMinutes: p.minLagMinutes,
        quantityPlanned: item.quantity,
        sortOrder: p.sortOrder,
      })),
    )
    .returning({ id: productionTasks.id });
  for (const t of inserted) await taskEvent(ctx, t.id, "CREATED");
  await orderEvent(ctx, { orderId: item.orderId, orderItemId: item.id, domain: "PRODUCTION", type: "JOB_RELEASED", message: `${template.name} (${planned.length} مرحله)` });
  return job!.id;
}

// ── Gates ───────────────────────────────────────────────────────────────────

interface GateContext {
  fileApproved: boolean;
  requirements: (typeof materialRequirements.$inferSelect)[];
  paymentOk: boolean;
}

export function isGateSatisfied(gate: Gate, g: GateContext): boolean {
  switch (gate.kind) {
    case "FILE_APPROVAL":
      return g.fileApproved;
    case "MATERIAL": {
      const relevant = g.requirements.filter((r) => gate.purposes.includes(r.purpose as "PAPER" | "PLATE" | "OPERATION"));
      return relevant.every((r) => isRequirementSatisfied(r));
    }
    case "PAYMENT":
      return g.paymentOk;
  }
}

export function depositSatisfied(o: Pick<Order, "total" | "paidAmount" | "refundedAmount" | "depositPct" | "paymentGateOverride">) {
  return o.paymentGateOverride || o.paidAmount - o.refundedAmount >= Math.ceil((o.total * o.depositPct) / 100);
}

async function gateContext(ctx: Ctx, itemId: string): Promise<GateContext> {
  const [item] = await ctx.db.select({ fileStatus: orderItems.fileStatus, orderId: orderItems.orderId }).from(orderItems).where(eq(orderItems.id, itemId));
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, item!.orderId));
  const requirements = await ctx.db.select().from(materialRequirements).where(eq(materialRequirements.orderItemId, itemId));
  return {
    fileApproved: item!.fileStatus === "APPROVED" || item!.fileStatus === "NOT_REQUIRED",
    requirements,
    paymentOk: depositSatisfied(order!),
  };
}

const toRuntime = (t: Task): RuntimeTask => ({
  id: t.id,
  stepKey: t.stepKey,
  attempt: t.attempt,
  status: t.status,
  dependsOn: t.dependsOn,
  minLagMinutes: t.minLagMinutes,
  completedAt: t.completedAt,
});

/**
 * Propagates readiness through a job's graph until stable:
 *  - PENDING tasks whose dependencies are satisfied become READY
 *  - READY tasks whose dependencies were reopened fall back to PENDING
 *  - READY gates whose condition holds complete automatically
 */
export async function refreshJob(ctx: Ctx, jobId: string) {
  const [job] = await ctx.db.select().from(productionJobs).where(eq(productionJobs.id, jobId)).for("update");
  if (!job || job.status === "CANCELLED") return;
  let gctx: GateContext | null = null;
  for (let round = 0; round < 50; round++) {
    const tasks = await ctx.db.select().from(productionTasks).where(eq(productionTasks.jobId, jobId));
    let changed = false;

    // Demote READY tasks whose dependencies are no longer satisfied (after a reopen).
    const current = latest(tasks);
    for (const t of current.values()) {
      if (t.status !== "READY") continue;
      const unsatisfied = t.dependsOn.some((k) => {
        const d = current.get(k);
        return d && !["COMPLETED", "SKIPPED", "CANCELLED"].includes(d.status);
      });
      if (unsatisfied) {
        await ctx.db.update(productionTasks).set({ status: "PENDING", readyAt: null }).where(eq(productionTasks.id, t.id));
        changed = true;
      }
    }
    if (changed) continue;

    for (const r of findNewlyReady(tasks.map(toRuntime))) {
      await ctx.db
        .update(productionTasks)
        .set({ status: "READY", readyAt: new Date(), earliestStartAt: r.earliestStartAt })
        .where(and(eq(productionTasks.id, r.id), eq(productionTasks.status, "PENDING")));
      await taskEvent(ctx, r.id, "READY");
      changed = true;
    }
    if (changed) continue;

    const readyGates = [...current.values()].filter((t) => t.gate && t.status === "READY");
    if (readyGates.length) {
      gctx ??= await gateContext(ctx, job.orderItemId);
      for (const g of readyGates) {
        if (isGateSatisfied(g.gate!, gctx)) {
          const now = new Date();
          await ctx.db
            .update(productionTasks)
            .set({ status: "COMPLETED", startedAt: now, completedAt: now, quantityCompleted: g.quantityPlanned })
            .where(eq(productionTasks.id, g.id));
          await taskEvent(ctx, g.id, "GATE_PASSED");
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  await recomputeItemProduction(ctx, job.orderItemId);
}

function latest(tasks: Task[]) {
  const m = new Map<string, Task>();
  for (const t of tasks) {
    const c = m.get(t.stepKey);
    if (!c || t.attempt > c.attempt) m.set(t.stepKey, t);
  }
  return m;
}

/**
 * The cross-domain synchroniser: after files, materials, payments or tasks
 * change, re-evaluate gates/readiness for the affected items and recompute
 * their orders. Idempotent and safe to call liberally.
 */
export async function syncItems(ctx: Ctx, itemIds: string[]) {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return;
  const jobs = await ctx.db.select({ id: productionJobs.id }).from(productionJobs).where(inArray(productionJobs.orderItemId, ids));
  for (const j of jobs) await refreshJob(ctx, j.id);
  for (const orderId of await orderIdsForItems(ctx, ids)) await recomputeOrder(ctx, orderId);
}

export async function syncOrder(ctx: Ctx, orderId: string) {
  const items = await ctx.db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) {
    await recomputeOrder(ctx, orderId);
    return;
  }
  await syncItems(ctx, items.map((i) => i.id));
}

export async function syncRequirements(ctx: Ctx, requirementIds: string[]) {
  if (requirementIds.length === 0) return;
  const rows = await ctx.db.selectDistinct({ itemId: materialRequirements.orderItemId }).from(materialRequirements).where(inArray(materialRequirements.id, requirementIds));
  await syncItems(ctx, rows.map((r) => r.itemId));
}
