import { z } from "zod";
import { myQueue, productionBoard, taskDetail } from "@/server/modules/production/queries";
import {
  assignTask,
  cancelTask,
  completeTask,
  pauseTask,
  reopenStep,
  reportIssue,
  resolveIssue,
  resumeTask,
  setJobPriority,
  skipTask,
  startTask,
} from "@/server/modules/production/tasks";
import { recordInspection } from "@/server/modules/qc/service";
import { computeSchedule } from "@/server/modules/scheduling/service";
import { assertCan } from "@/server/core/context";
import { api } from "../router";
import { reason, uuid } from "./schemas";

export const productionRoutes = [
  api.get("production/my-queue", { auth: "staff" }, async ({ ctx }) => myQueue(ctx)),
  api.get("production/board", { auth: "staff" }, async ({ ctx }) => productionBoard(ctx)),
  api.get("production/tasks/:id", { auth: "staff" }, async ({ ctx, params }) => taskDetail(ctx, params.id!)),
  api.post("production/tasks/:id/start", { auth: "staff", body: z.object({ machineId: uuid.optional().nullable(), force: z.boolean().optional() }) }, async ({ ctx, params, body }) => startTask(ctx, params.id!, body)),
  api.post("production/tasks/:id/pause", { auth: "staff", body: z.object({ reason: z.string().max(500).optional() }) }, async ({ ctx, params, body }) => pauseTask(ctx, params.id!, body.reason)),
  api.post("production/tasks/:id/resume", { auth: "staff" }, async ({ ctx, params }) => resumeTask(ctx, params.id!)),
  api.post(
    "production/tasks/:id/complete",
    {
      auth: "staff",
      body: z.object({
        quantityCompleted: z.number().int().min(0).max(10_000_000).optional(),
        consumption: z.array(z.object({ requirementId: uuid, consumed: z.number().min(0), wasted: z.number().min(0) })).max(30).optional(),
        notes: z.string().max(2000).optional(),
      }),
    },
    async ({ ctx, params, body }) => completeTask(ctx, params.id!, body),
  ),
  api.post(
    "production/tasks/:id/issues",
    { auth: "staff", body: z.object({ type: z.enum(["MACHINE_BREAKDOWN", "MATERIAL_SHORTAGE", "FILE_PROBLEM", "QUALITY_PROBLEM", "WAITING_FOR_INFO", "OTHER"]), description: z.string().trim().min(3).max(2000), block: z.boolean() }) },
    async ({ ctx, params, body }) => reportIssue(ctx, params.id!, body),
  ),
  api.post("production/issues/:id/resolve", { auth: "staff", body: z.object({ resolution: reason }) }, async ({ ctx, params, body }) => resolveIssue(ctx, params.id!, body.resolution)),
  api.post("production/tasks/:id/assign", { auth: "staff", body: z.object({ assigneeId: uuid.nullable().optional(), machineId: uuid.nullable().optional() }) }, async ({ ctx, params, body }) => assignTask(ctx, params.id!, body)),
  api.post("production/tasks/:id/skip", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => skipTask(ctx, params.id!, body.reason)),
  api.post("production/tasks/:id/cancel", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => cancelTask(ctx, params.id!, body.reason)),
  api.post("production/jobs/:id/priority", { auth: "staff", body: z.object({ priority: z.number().int().min(1).max(99), reason: z.string().max(500).optional() }) }, async ({ ctx, params, body }) =>
    setJobPriority(ctx, params.id!, body.priority, body.reason),
  ),
  api.post("production/jobs/:id/reopen", { auth: "staff", body: z.object({ stepKey: z.string().max(40), reason, quantity: z.number().int().positive().optional() }) }, async ({ ctx, params, body }) =>
    reopenStep(ctx, params.id!, body.stepKey, body.reason, body.quantity),
  ),
  api.post(
    "production/tasks/:id/inspection",
    {
      auth: "staff",
      body: z.object({
        result: z.enum(["PASSED", "FAILED"]),
        quantityChecked: z.number().int().min(0),
        quantityRejected: z.number().int().min(0),
        checklist: z.array(z.object({ item: z.string().max(200), passed: z.boolean() })).max(30),
        defects: z.array(z.object({ defectCode: z.string().max(32), severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]), quantity: z.number().int().min(0), description: z.string().max(500).optional() })).max(20),
        reworkTargetStepKey: z.string().max(40).nullable().optional(),
        reworkQuantity: z.number().int().positive().nullable().optional(),
        notes: z.string().max(2000).optional(),
        imageFileIds: z.array(uuid).max(10).optional(),
      }),
    },
    async ({ ctx, params, body }) => recordInspection(ctx, params.id!, body),
  ),
  api.get("production/schedule", { auth: "staff" }, async ({ ctx }) => {
    assertCan(ctx, "production.view");
    const s = await computeSchedule(ctx);
    return {
      computedAt: s.computedAt,
      lateJobs: s.lateJobs,
      machineLoad: [...s.machineLoad.entries()].map(([machineId, l]) => ({ machineId, ...l })),
      unschedulable: s.unschedulable,
    };
  }),
];
