import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  machines,
  materialRequirements,
  orders,
  productionIssues,
  productionJobs,
  productionTasks,
  taskTimeLogs,
} from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, assertCanAny, can, inTx, isStaff } from "@/server/core/context";
import { AppError, forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { recordConsumption } from "@/server/modules/inventory/service";
import { orderEvent } from "@/server/modules/orders/state";
import { reworkPath } from "@/server/modules/workflow/graph";
import { refreshJob, syncItems, taskEvent } from "./engine";
import { formatNumber } from "@/lib/persian";

type Task = typeof productionTasks.$inferSelect;
type IssueType = (typeof productionIssues.$inferInsert)["type"];

async function lockTask(ctx: Ctx, taskId: string) {
  const [t] = await ctx.db.select().from(productionTasks).where(eq(productionTasks.id, taskId)).for("update");
  if (!t) throw notFound("مرحله تولید");
  return t;
}

async function itemIdOf(ctx: Ctx, t: Task) {
  const [job] = await ctx.db.select({ itemId: productionJobs.orderItemId }).from(productionJobs).where(eq(productionJobs.id, t.jobId));
  return job!.itemId;
}

/** Operators may act on their own step types; managers with override on any. */
export function assertCanPerform(ctx: Ctx, t: Pick<Task, "stepTypeCode" | "isQc" | "gate" | "assigneeId">) {
  if (can(ctx, "production.override")) return;
  if (t.gate) throw forbidden("مراحل دروازه‌ای به‌صورت خودکار انجام می‌شوند.");
  if (t.isQc) {
    assertCan(ctx, "qc.perform");
    return;
  }
  assertCan(ctx, "production.execute");
  if (!isStaff(ctx.actor) || !ctx.actor.stepTypes.includes(t.stepTypeCode)) throw forbidden("این مرحله در حوزه کاری شما نیست.");
  if (t.assigneeId && t.assigneeId !== ctx.actor.employeeId) throw forbidden("این کار به همکار دیگری سپرده شده است.");
}

async function openLog(ctx: Ctx, t: Task, machineId: string | null) {
  await ctx.db.insert(taskTimeLogs).values({ taskId: t.id, employeeId: isStaff(ctx.actor) ? ctx.actor.employeeId : null, machineId, startedAt: new Date() });
}

async function closeLog(ctx: Ctx, taskId: string, reason: string): Promise<number> {
  const [log] = await ctx.db
    .update(taskTimeLogs)
    .set({ endedAt: new Date(), endReason: reason })
    .where(and(eq(taskTimeLogs.taskId, taskId), isNull(taskTimeLogs.endedAt)))
    .returning();
  if (!log) return 0;
  const minutes = Math.max(0, Math.round((log.endedAt!.getTime() - log.startedAt.getTime()) / 60_000));
  await ctx.db.update(productionTasks).set({ actualMinutes: sql`${productionTasks.actualMinutes} + ${minutes}` }).where(eq(productionTasks.id, taskId));
  return minutes;
}

export async function startTask(ctx: Ctx, taskId: string, input: { machineId?: string | null; force?: boolean } = {}) {
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    assertCanPerform(tx, t);
    if (t.status === "PAUSED") return resumeTask(tx, taskId);
    if (t.status !== "READY") throw invalidState("این مرحله هنوز آماده شروع نیست.");
    const [order] = await tx.db.select({ status: orders.status }).from(orders).where(eq(orders.id, t.orderId));
    if (order?.status === "ON_HOLD" || order?.status === "CANCELLED") throw invalidState("سفارش متوقف یا لغو شده است.");
    if (t.earliestStartAt && t.earliestStartAt > new Date() && !(input.force && can(tx, "production.override"))) {
      throw invalidState("زمان انتظار این مرحله (مثلاً خشک‌شدن مرکب) هنوز تمام نشده است.", { earliestStartAt: t.earliestStartAt });
    }
    const machineId = input.machineId ?? t.machineId;
    if (t.machineTypeCode) {
      if (!machineId) throw validation("ماشین این مرحله را انتخاب کنید.");
      const [m] = await tx.db.select().from(machines).where(eq(machines.id, machineId)).for("update");
      if (!m || m.typeCode !== t.machineTypeCode) throw validation("ماشین انتخاب‌شده برای این مرحله مناسب نیست.");
      if (m.status !== "ACTIVE") throw invalidState(`ماشین «${m.name}» در دسترس نیست.`);
      const [busy] = await tx.db
        .select({ id: productionTasks.id })
        .from(productionTasks)
        .where(and(eq(productionTasks.machineId, machineId), eq(productionTasks.status, "IN_PROGRESS"), ne(productionTasks.id, t.id)))
        .limit(1);
      if (busy) throw new AppError("CONFLICT", `ماشین «${m.name}» در حال انجام کار دیگری است.`);
    }
    if (isStaff(tx.actor)) {
      const [running] = await tx.db
        .select({ id: productionTasks.id, name: productionTasks.name })
        .from(productionTasks)
        .where(and(eq(productionTasks.assigneeId, tx.actor.employeeId), eq(productionTasks.status, "IN_PROGRESS")))
        .limit(1);
      if (running && !t.isQc) throw new AppError("CONFLICT", `ابتدا کار در حال انجام («${running.name}») را متوقف یا تکمیل کنید.`);
    }
    const now = new Date();
    await tx.db
      .update(productionTasks)
      .set({
        status: "IN_PROGRESS",
        startedAt: t.startedAt ?? now,
        machineId: machineId ?? null,
        assigneeId: t.assigneeId ?? (isStaff(tx.actor) ? tx.actor.employeeId : null),
        version: sql`${productionTasks.version} + 1`,
      })
      .where(eq(productionTasks.id, t.id));
    await openLog(tx, t, machineId ?? null);
    await taskEvent(tx, t.id, "STARTED", null, { machineId });
    await syncItems(tx, [await itemIdOf(tx, t)]);
    return { id: t.id, status: "IN_PROGRESS" as const };
  });
}

export async function pauseTask(ctx: Ctx, taskId: string, reason?: string) {
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    assertCanPerform(tx, t);
    if (t.status !== "IN_PROGRESS") throw invalidState("فقط کار در حال انجام قابل توقف است.");
    await closeLog(tx, t.id, "PAUSE");
    await tx.db.update(productionTasks).set({ status: "PAUSED" }).where(eq(productionTasks.id, t.id));
    await taskEvent(tx, t.id, "PAUSED", reason);
    return { id: t.id, status: "PAUSED" as const };
  });
}

export async function resumeTask(ctx: Ctx, taskId: string) {
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    assertCanPerform(tx, t);
    if (t.status !== "PAUSED") throw invalidState("فقط کار متوقف‌شده قابل ادامه است.");
    if (t.machineId) {
      const [busy] = await tx.db
        .select({ id: productionTasks.id })
        .from(productionTasks)
        .where(and(eq(productionTasks.machineId, t.machineId), eq(productionTasks.status, "IN_PROGRESS"), ne(productionTasks.id, t.id)))
        .limit(1);
      if (busy) throw new AppError("CONFLICT", "ماشین در حال انجام کار دیگری است.");
    }
    await tx.db.update(productionTasks).set({ status: "IN_PROGRESS" }).where(eq(productionTasks.id, t.id));
    await openLog(tx, t, t.machineId);
    await taskEvent(tx, t.id, "RESUMED");
    return { id: t.id, status: "IN_PROGRESS" as const };
  });
}

export interface CompleteInput {
  quantityCompleted?: number;
  consumption?: { requirementId: string; consumed: number; wasted: number }[];
  notes?: string;
}

export async function completeTask(ctx: Ctx, taskId: string, input: CompleteInput = {}) {
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    assertCanPerform(tx, t);
    if (t.isQc) throw invalidState("مراحل کنترل کیفیت با ثبت نتیجه بازرسی تکمیل می‌شوند.");
    if (!["IN_PROGRESS", "PAUSED"].includes(t.status)) throw invalidState("فقط کار شروع‌شده قابل تکمیل است.");
    const itemId = await itemIdOf(tx, t);
    if (input.consumption?.length) {
      const reqs = await tx.db
        .select({ id: materialRequirements.id })
        .from(materialRequirements)
        .where(and(inArray(materialRequirements.id, input.consumption.map((c) => c.requirementId)), eq(materialRequirements.orderItemId, itemId)));
      if (reqs.length !== new Set(input.consumption.map((c) => c.requirementId)).size) throw validation("مواد ثبت‌شده به این سفارش تعلق ندارد.");
      for (const c of input.consumption) {
        if (c.consumed + c.wasted > 0) await recordConsumption(tx, c.requirementId, { consumed: c.consumed, wasted: c.wasted, taskId: t.id, note: input.notes });
      }
    }
    await closeLog(tx, t.id, "COMPLETE");
    const quantityCompleted = input.quantityCompleted ?? t.quantityPlanned;
    if (quantityCompleted < 0) throw validation("تعداد تولیدشده نامعتبر است.");
    await tx.db
      .update(productionTasks)
      .set({ status: "COMPLETED", completedAt: new Date(), quantityCompleted, notes: input.notes ?? t.notes, version: sql`${productionTasks.version} + 1` })
      .where(eq(productionTasks.id, t.id));
    await taskEvent(tx, t.id, "COMPLETED", input.notes, { quantityCompleted, shortfall: Math.max(0, t.quantityPlanned - quantityCompleted) });
    if (quantityCompleted < t.quantityPlanned) {
      await orderEvent(tx, { orderId: t.orderId, orderItemId: itemId, domain: "PRODUCTION", type: "SHORTFALL", message: `«${t.name}»: ${formatNumber(quantityCompleted)} از ${formatNumber(t.quantityPlanned)}` });
    }
    await syncItems(tx, [itemId]);
    return { id: t.id, status: "COMPLETED" as const };
  });
}

export async function reportIssue(ctx: Ctx, taskId: string, input: { type: IssueType; description: string; block: boolean }) {
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    assertCanAny(tx, "production.execute", "qc.perform", "production.override");
    if (["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status)) throw invalidState("این مرحله بسته شده است.");
    const [issue] = await tx.db
      .insert(productionIssues)
      .values({ taskId: t.id, orderId: t.orderId, type: input.type, description: input.description, reportedBy: actorUserId(tx) })
      .returning();
    if (input.block && t.status !== "BLOCKED") {
      if (t.status === "IN_PROGRESS") await closeLog(tx, t.id, "BLOCK");
      await tx.db.update(productionTasks).set({ status: "BLOCKED", blockedReason: input.description }).where(eq(productionTasks.id, t.id));
    }
    await taskEvent(tx, t.id, input.block ? "BLOCKED" : "ISSUE", input.description, { issueId: issue!.id, type: input.type });
    await emit(tx, "IssueReported", { type: "order", id: t.orderId }, { orderId: t.orderId, taskId: t.id, issueId: issue!.id });
    await syncItems(tx, [await itemIdOf(tx, t)]);
    return issue!;
  });
}

export async function resolveIssue(ctx: Ctx, issueId: string, resolution: string) {
  assertCanAny(ctx, "production.assign", "production.override");
  return inTx(ctx, async (tx) => {
    const [issue] = await tx.db.select().from(productionIssues).where(eq(productionIssues.id, issueId)).for("update");
    if (!issue) throw notFound("مشکل");
    if (issue.status === "RESOLVED") return issue;
    await tx.db.update(productionIssues).set({ status: "RESOLVED", resolution, resolvedBy: actorUserId(tx), resolvedAt: new Date() }).where(eq(productionIssues.id, issueId));
    const t = await lockTask(tx, issue.taskId);
    const [{ open }] = (await tx.db
      .select({ open: sql<number>`count(*)::int` })
      .from(productionIssues)
      .where(and(eq(productionIssues.taskId, t.id), eq(productionIssues.status, "OPEN")))) as [{ open: number }];
    if (t.status === "BLOCKED" && open === 0) {
      await tx.db.update(productionTasks).set({ status: t.startedAt ? "PAUSED" : "READY", blockedReason: null }).where(eq(productionTasks.id, t.id));
      await taskEvent(tx, t.id, "UNBLOCKED", resolution);
    }
    await syncItems(tx, [await itemIdOf(tx, t)]);
    return { ...issue, status: "RESOLVED" as const };
  });
}

// ── Manager actions (audited) ───────────────────────────────────────────────

export async function assignTask(ctx: Ctx, taskId: string, input: { assigneeId?: string | null; machineId?: string | null }) {
  assertCan(ctx, "production.assign");
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    if (["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status)) throw invalidState("این مرحله بسته شده است.");
    const patch: Partial<Task> = {};
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
    if (input.machineId !== undefined) {
      if (input.machineId) {
        const [m] = await tx.db.select().from(machines).where(eq(machines.id, input.machineId));
        if (!m || m.typeCode !== t.machineTypeCode) throw validation("ماشین انتخاب‌شده برای این مرحله مناسب نیست.");
      }
      if (t.status === "IN_PROGRESS") throw invalidState("برای تغییر ماشین ابتدا کار را متوقف کنید.");
      patch.machineId = input.machineId;
    }
    await tx.db.update(productionTasks).set(patch).where(eq(productionTasks.id, t.id));
    await taskEvent(tx, t.id, "ASSIGNED", null, patch as Record<string, unknown>);
    await audit(tx, { action: "production.assign", entityType: "production_task", entityId: t.id, before: { assigneeId: t.assigneeId, machineId: t.machineId }, after: patch });
    return { ...t, ...patch };
  });
}

export async function setJobPriority(ctx: Ctx, jobId: string, priority: number, reason?: string) {
  assertCanAny(ctx, "production.assign", "order.priority.change");
  if (!Number.isInteger(priority) || priority < 1 || priority > 99) throw validation("اولویت باید بین ۱ تا ۹۹ باشد.");
  return inTx(ctx, async (tx) => {
    const [job] = await tx.db.select().from(productionJobs).where(eq(productionJobs.id, jobId)).for("update");
    if (!job) throw notFound("کار تولیدی");
    await tx.db.update(productionJobs).set({ priority }).where(eq(productionJobs.id, jobId));
    await tx.db.update(productionTasks).set({ priority }).where(and(eq(productionTasks.jobId, jobId), inArray(productionTasks.status, ["PENDING", "READY", "PAUSED", "BLOCKED"])));
    await audit(tx, { action: "production.priority", entityType: "production_job", entityId: jobId, before: { priority: job.priority }, after: { priority }, reason });
  });
}

/** Force-pass a gate or skip a step (e.g. customer dropped UV). */
export async function skipTask(ctx: Ctx, taskId: string, reason: string) {
  assertCan(ctx, "production.override");
  if (!reason.trim()) throw validation("دلیل الزامی است.");
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    if (!["PENDING", "READY", "BLOCKED"].includes(t.status)) throw invalidState("فقط مرحله شروع‌نشده قابل رد شدن است.");
    const now = new Date();
    await tx.db.update(productionTasks).set({ status: "SKIPPED", completedAt: now, blockedReason: null }).where(eq(productionTasks.id, t.id));
    await taskEvent(tx, t.id, t.gate ? "GATE_OVERRIDDEN" : "SKIPPED", reason);
    await audit(tx, { action: t.gate ? "production.gate.override" : "production.skip", entityType: "production_task", entityId: t.id, before: { status: t.status }, after: { status: "SKIPPED" }, reason });
    await syncItems(tx, [await itemIdOf(tx, t)]);
  });
}

export async function cancelTask(ctx: Ctx, taskId: string, reason: string) {
  assertCan(ctx, "production.override");
  if (!reason.trim()) throw validation("دلیل الزامی است.");
  return inTx(ctx, async (tx) => {
    const t = await lockTask(tx, taskId);
    if (["COMPLETED", "SKIPPED", "CANCELLED"].includes(t.status)) throw invalidState("این مرحله بسته شده است.");
    if (t.status === "IN_PROGRESS") await closeLog(tx, t.id, "CANCEL");
    await tx.db.update(productionTasks).set({ status: "CANCELLED", completedAt: new Date() }).where(eq(productionTasks.id, t.id));
    await taskEvent(tx, t.id, "CANCELLED", reason);
    await audit(tx, { action: "production.cancel_task", entityType: "production_task", entityId: t.id, before: { status: t.status }, after: { status: "CANCELLED" }, reason });
    await syncItems(tx, [await itemIdOf(tx, t)]);
  });
}

/** Creates a new attempt of a finished step (and nothing else — downstream readiness adjusts automatically). */
export async function reopenStep(ctx: Ctx, jobId: string, stepKey: string, reason: string, quantity?: number) {
  assertCan(ctx, "production.override");
  if (!reason.trim()) throw validation("دلیل الزامی است.");
  return inTx(ctx, async (tx) => {
    const created = await createAttempts(tx, jobId, [stepKey], { reason, quantity });
    await audit(tx, { action: "production.reopen", entityType: "production_job", entityId: jobId, after: { stepKey, quantity }, reason });
    const [job] = await tx.db.select({ itemId: productionJobs.orderItemId }).from(productionJobs).where(eq(productionJobs.id, jobId));
    await syncItems(tx, [job!.itemId]);
    return created;
  });
}

/** Adds attempt n+1 for each step key (used by reopen and QC rework). */
export async function createAttempts(ctx: Ctx, jobId: string, stepKeys: string[], opts: { reason: string; quantity?: number; reworkOfTaskId?: string }) {
  const tasks = await ctx.db.select().from(productionTasks).where(eq(productionTasks.jobId, jobId));
  const created: string[] = [];
  for (const key of stepKeys) {
    const prev = tasks.filter((t) => t.stepKey === key).sort((a, b) => b.attempt - a.attempt)[0];
    if (!prev) throw validation(`مرحله «${key}» در این کار وجود ندارد.`);
    if (!["COMPLETED", "SKIPPED", "CANCELLED"].includes(prev.status)) continue; // already open
    const [row] = await ctx.db
      .insert(productionTasks)
      .values({
        jobId,
        orderId: prev.orderId,
        stepKey: prev.stepKey,
        stepTypeCode: prev.stepTypeCode,
        name: prev.name,
        attempt: prev.attempt + 1,
        dependsOn: prev.dependsOn,
        gate: prev.gate,
        isQc: prev.isQc,
        reworkTargets: prev.reworkTargets,
        milestone: prev.milestone,
        checklist: prev.checklist,
        machineTypeCode: prev.machineTypeCode,
        machineId: prev.machineId,
        assigneeId: prev.assigneeId,
        priority: Math.max(1, prev.priority - 10), // rework jumps the queue
        estimatedMinutes: prev.estimatedMinutes,
        minLagMinutes: prev.minLagMinutes,
        quantityPlanned: opts.quantity ?? prev.quantityPlanned,
        reworkOfTaskId: opts.reworkOfTaskId ?? prev.id,
        reworkReason: opts.reason,
        sortOrder: prev.sortOrder,
      })
      .returning({ id: productionTasks.id });
    await taskEvent(ctx, row!.id, "REOPENED", opts.reason, { previousAttempt: prev.attempt });
    created.push(row!.id);
  }
  return created;
}

export { refreshJob };

/** QC rework helper exposed for the QC service. */
export async function sendToRework(ctx: Ctx, qcTask: Task, targetKey: string, reason: string, quantity: number, inspectionTaskId: string) {
  const tasks = await ctx.db.select().from(productionTasks).where(eq(productionTasks.jobId, qcTask.jobId));
  if (!qcTask.reworkTargets.includes(targetKey)) throw validation("مقصد دوباره‌کاری برای این مرحله مجاز نیست.");
  const path = reworkPath(tasks, targetKey, qcTask.stepKey);
  return createAttempts(ctx, qcTask.jobId, path, { reason, quantity, reworkOfTaskId: inspectionTaskId });
}
