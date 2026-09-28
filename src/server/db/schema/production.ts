import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Gate } from "@/server/modules/workflow/types";
import { machineTypes, stepTypes, workflowTemplates } from "./catalog";
import { defectSeverity, issueStatus, issueType, jobStatus, qcResult, taskStatus } from "./enums";
import { employees, timestamps, users } from "./identity";
import { machines } from "./inventory";
import { orderItems, orders } from "./orders";

/** One production job per order item; rework is modelled as new task attempts. */
export const productionJobs = pgTable(
  "production_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().default(sql`nextval('doc_number_seq')`),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id),
    methodCode: varchar("method_code", { length: 24 }).notNull(),
    status: jobStatus("status").notNull().default("PLANNED"),
    quantity: integer("quantity").notNull(),
    /** Lower number = more urgent. Derived from order priority + due date, overridable. */
    priority: integer("priority").notNull().default(50),
    dueDate: timestamp("due_date", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("production_jobs_number_uq").on(t.number),
    uniqueIndex("production_jobs_item_uq").on(t.orderItemId),
    index("production_jobs_status_idx").on(t.status),
  ],
);

export const productionTasks = pgTable(
  "production_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => productionJobs.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    stepKey: varchar("step_key", { length: 40 }).notNull(),
    stepTypeCode: varchar("step_type_code", { length: 32 })
      .notNull()
      .references(() => stepTypes.code),
    name: text("name").notNull(),
    attempt: integer("attempt").notNull().default(1),
    /** Step keys (after condition pruning) that must be complete first. */
    dependsOn: text("depends_on").array().notNull().default(sql`'{}'::text[]`),
    status: taskStatus("status").notNull().default("PENDING"),
    gate: jsonb("gate").$type<Gate | null>(),
    isQc: boolean("is_qc").notNull().default(false),
    reworkTargets: text("rework_targets").array().notNull().default(sql`'{}'::text[]`),
    milestone: varchar("milestone", { length: 16 }).notNull(),
    checklist: jsonb("checklist").$type<string[]>().notNull().default([]),
    machineTypeCode: varchar("machine_type_code", { length: 32 }).references(() => machineTypes.code),
    machineId: uuid("machine_id").references(() => machines.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => employees.id, { onDelete: "set null" }),
    priority: integer("priority").notNull().default(50),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    actualMinutes: integer("actual_minutes").notNull().default(0),
    minLagMinutes: integer("min_lag_minutes").notNull().default(0),
    quantityPlanned: integer("quantity_planned").notNull(),
    quantityCompleted: integer("quantity_completed").notNull().default(0),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    /** Earliest start honouring min lag (drying/curing). */
    earliestStartAt: timestamp("earliest_start_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),
    reworkOfTaskId: uuid("rework_of_task_id"),
    reworkReason: text("rework_reason"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("production_tasks_attempt_uq").on(t.jobId, t.stepKey, t.attempt),
    index("production_tasks_status_idx").on(t.status, t.stepTypeCode),
    index("production_tasks_machine_idx").on(t.machineId, t.status),
    index("production_tasks_assignee_idx").on(t.assigneeId, t.status),
    index("production_tasks_order_idx").on(t.orderId),
    check("production_tasks_qty_nonneg", sql`${t.quantityPlanned} >= 0 AND ${t.quantityCompleted} >= 0`),
    // An operator can only be running one thing per task row; timing is in task_time_logs.
    check(
      "production_tasks_started_when_running",
      sql`${t.status} NOT IN ('IN_PROGRESS','PAUSED') OR ${t.startedAt} IS NOT NULL`,
    ),
  ],
);

export const taskTimeLogs = pgTable(
  "task_time_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id),
    machineId: uuid("machine_id").references(() => machines.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: varchar("end_reason", { length: 16 }),
  },
  (t) => [
    index("task_time_logs_task_idx").on(t.taskId),
    // At most one open time log per task.
    uniqueIndex("task_time_logs_one_open").on(t.taskId).where(sql`${t.endedAt} IS NULL`),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    note: text("note"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_events_task_idx").on(t.taskId, t.createdAt)],
);

export const productionIssues = pgTable(
  "production_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: issueType("type").notNull(),
    status: issueStatus("status").notNull().default("OPEN"),
    description: text("description").notNull(),
    resolution: text("resolution"),
    reportedBy: uuid("reported_by").references(() => users.id),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("production_issues_status_idx").on(t.status), index("production_issues_task_idx").on(t.taskId)],
);

// ── Quality control ─────────────────────────────────────────────────────────

export const qcDefectTypes = pgTable("qc_defect_types", {
  code: varchar("code", { length: 32 }).primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const qcInspections = pgTable(
  "qc_inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => productionTasks.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => productionJobs.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    inspectorId: uuid("inspector_id").references(() => employees.id),
    result: qcResult("result").notNull(),
    quantityChecked: integer("quantity_checked").notNull(),
    quantityRejected: integer("quantity_rejected").notNull().default(0),
    checklist: jsonb("checklist").$type<{ item: string; passed: boolean }[]>().notNull().default([]),
    reworkTargetStepKey: varchar("rework_target_step_key", { length: 40 }),
    reworkQuantity: integer("rework_quantity"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("qc_inspections_item_idx").on(t.orderItemId),
    check("qc_rejected_le_checked", sql`${t.quantityRejected} >= 0 AND ${t.quantityRejected} <= ${t.quantityChecked}`),
  ],
);

export const qcDefects = pgTable(
  "qc_defects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => qcInspections.id, { onDelete: "cascade" }),
    defectCode: varchar("defect_code", { length: 32 })
      .notNull()
      .references(() => qcDefectTypes.code),
    severity: defectSeverity("severity").notNull(),
    quantity: integer("quantity").notNull().default(0),
    description: text("description"),
  },
  (t) => [index("qc_defects_inspection_idx").on(t.inspectionId)],
);
