import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  customers,
  employees,
  machines,
  materialRequirements,
  materials,
  orderItems,
  orders,
  productionIssues,
  productionJobs,
  productionTasks,
  qcDefectTypes,
  stepTypes,
  taskEvents,
  taskTimeLogs,
  users,
} from "@/server/db/schema";
import { type Ctx, assertCan, assertCanAny, isStaff } from "@/server/core/context";
import { forbidden, notFound } from "@/server/core/errors";
import type { PriceBreakdown } from "@/server/modules/pricing/types";

const OPEN = ["READY", "IN_PROGRESS", "PAUSED", "BLOCKED"] as const;

/** Latest attempt per (job, step) only. */
const latestOnly = sql`${productionTasks.attempt} = (SELECT max(t2.attempt) FROM production_tasks t2 WHERE t2.job_id = ${productionTasks.jobId} AND t2.step_key = ${productionTasks.stepKey})`;

const taskSelect = {
  task: productionTasks,
  orderNumber: orders.number,
  orderStatus: orders.status,
  orderPriority: orders.priority,
  dueDate: orders.dueDate,
  customerName: customers.fullName,
  itemTitle: orderItems.title,
  itemQuantity: orderItems.quantity,
  itemUnit: orderItems.unitLabel,
  itemId: orderItems.id,
  machineName: machines.name,
  machineCode: machines.code,
  assigneeName: users.fullName,
  stepTypeName: stepTypes.name,
  stepColor: stepTypes.color,
};

function baseTaskQuery(ctx: Ctx) {
  return ctx.db
    .select(taskSelect)
    .from(productionTasks)
    .innerJoin(productionJobs, eq(productionJobs.id, productionTasks.jobId))
    .innerJoin(orderItems, eq(orderItems.id, productionJobs.orderItemId))
    .innerJoin(orders, eq(orders.id, productionTasks.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(stepTypes, eq(stepTypes.code, productionTasks.stepTypeCode))
    .leftJoin(machines, eq(machines.id, productionTasks.machineId))
    .leftJoin(employees, eq(employees.id, productionTasks.assigneeId))
    .leftJoin(users, eq(users.id, employees.userId));
}

export type QueueRow = Awaited<ReturnType<typeof myQueue>>["tasks"][number];

/**
 * Operator workspace: tasks assigned to me, plus unassigned ready work of the
 * step types my roles can perform. Gates are never shown (they're automatic).
 */
export async function myQueue(ctx: Ctx, opts: { stepTypes?: string[] } = {}) {
  if (!isStaff(ctx.actor)) throw forbidden();
  assertCanAny(ctx, "production.execute", "qc.perform");
  const me = ctx.actor.employeeId;
  const types = opts.stepTypes?.length ? opts.stepTypes.filter((s) => ctx.actor.kind === "staff" && ctx.actor.stepTypes.includes(s)) : [...ctx.actor.stepTypes];
  if (types.length === 0) return { tasks: [], stepTypes: [] as string[] };
  const rows = await baseTaskQuery(ctx)
    .where(
      and(
        inArray(productionTasks.status, [...OPEN]),
        isNull(productionTasks.gate),
        inArray(productionTasks.stepTypeCode, types),
        sql`${orders.status} NOT IN ('ON_HOLD','CANCELLED')`,
        or(eq(productionTasks.assigneeId, me), isNull(productionTasks.assigneeId)),
        latestOnly,
      ),
    )
    .orderBy(sql`CASE ${productionTasks.status} WHEN 'IN_PROGRESS' THEN 0 WHEN 'PAUSED' THEN 1 WHEN 'BLOCKED' THEN 3 ELSE 2 END`, asc(productionTasks.priority), asc(orders.dueDate), asc(productionTasks.readyAt));
  return { tasks: rows, stepTypes: types };
}

/** Detail for the operator's current job: specs, files, materials and history. */
export async function taskDetail(ctx: Ctx, taskId: string) {
  assertCanAny(ctx, "production.view", "production.execute", "qc.perform");
  const [row] = await baseTaskQuery(ctx).where(eq(productionTasks.id, taskId));
  if (!row) throw notFound("مرحله");
  const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.id, row.itemId));
  const snap = item?.priceSnapshot as PriceBreakdown | null;
  const requirements = await ctx.db
    .select({ req: materialRequirements, material: { sku: materials.sku, name: materials.name, unit: materials.unit } })
    .from(materialRequirements)
    .innerJoin(materials, eq(materials.id, materialRequirements.materialId))
    .where(eq(materialRequirements.orderItemId, row.itemId));
  const events = await ctx.db
    .select({ event: taskEvents, actor: users.fullName })
    .from(taskEvents)
    .leftJoin(users, eq(users.id, taskEvents.actorId))
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt))
    .limit(30);
  const issues = await ctx.db.select().from(productionIssues).where(eq(productionIssues.taskId, taskId)).orderBy(desc(productionIssues.createdAt));
  const openLog = await ctx.db.select().from(taskTimeLogs).where(and(eq(taskTimeLogs.taskId, taskId), isNull(taskTimeLogs.endedAt))).limit(1);
  const candidates = row.task.machineTypeCode
    ? await ctx.db.select({ id: machines.id, name: machines.name, code: machines.code, status: machines.status }).from(machines).where(and(eq(machines.typeCode, row.task.machineTypeCode), eq(machines.isActive, true)))
    : [];
  const siblings = await ctx.db.select({ stepKey: productionTasks.stepKey, name: productionTasks.name, status: productionTasks.status, attempt: productionTasks.attempt, sortOrder: productionTasks.sortOrder }).from(productionTasks).where(eq(productionTasks.jobId, row.task.jobId)).orderBy(asc(productionTasks.sortOrder), asc(productionTasks.attempt));
  const defectTypes = row.task.isQc ? await ctx.db.select().from(qcDefectTypes).orderBy(asc(qcDefectTypes.sortOrder)) : [];
  return {
    ...row,
    spec: snap ? { summary: snap.spec.summary, method: snap.method, impositions: snap.impositions, trim: snap.spec.trim } : null,
    requirements: requirements.filter((r) => r.req.stepTypeCode === row.task.stepTypeCode || row.task.isQc),
    allRequirements: requirements,
    events,
    issues,
    runningSince: openLog[0]?.startedAt ?? null,
    machineCandidates: candidates,
    siblings,
    defectTypes,
  };
}

/** Manager production board: open tasks grouped by step type, plus blocked & late work. */
export async function productionBoard(ctx: Ctx) {
  assertCan(ctx, "production.view");
  const rows = await baseTaskQuery(ctx)
    .where(and(inArray(productionTasks.status, ["PENDING", ...OPEN]), sql`${orders.status} NOT IN ('CANCELLED')`, latestOnly))
    .orderBy(asc(productionTasks.priority), asc(orders.dueDate));
  const types = await ctx.db.select().from(stepTypes).orderBy(asc(stepTypes.sortOrder));
  return { tasks: rows, stepTypes: types };
}

export async function openIssues(ctx: Ctx) {
  assertCan(ctx, "production.view");
  return ctx.db
    .select({ issue: productionIssues, taskName: productionTasks.name, orderNumber: orders.number, orderId: orders.id, reporter: users.fullName })
    .from(productionIssues)
    .innerJoin(productionTasks, eq(productionTasks.id, productionIssues.taskId))
    .innerJoin(orders, eq(orders.id, productionIssues.orderId))
    .leftJoin(users, eq(users.id, productionIssues.reportedBy))
    .where(eq(productionIssues.status, "OPEN"))
    .orderBy(desc(productionIssues.createdAt));
}
