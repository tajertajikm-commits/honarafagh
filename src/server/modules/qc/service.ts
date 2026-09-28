import { eq } from "drizzle-orm";
import { entityFiles, productionJobs, productionTasks, qcDefects, qcInspections } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx, isStaff } from "@/server/core/context";
import { invalidState, notFound, validation } from "@/server/core/errors";
import { emit } from "@/server/events/outbox";
import { orderEvent } from "@/server/modules/orders/state";
import { syncItems, taskEvent } from "@/server/modules/production/engine";
import { sendToRework } from "@/server/modules/production/tasks";
import { formatNumber } from "@/lib/persian";

export interface InspectionInput {
  result: "PASSED" | "FAILED";
  quantityChecked: number;
  quantityRejected: number;
  checklist: { item: string; passed: boolean }[];
  defects: { defectCode: string; severity: "MINOR" | "MAJOR" | "CRITICAL"; quantity: number; description?: string }[];
  reworkTargetStepKey?: string | null;
  reworkQuantity?: number | null;
  notes?: string;
  imageFileIds?: string[];
}

/**
 * Records a QC inspection. PASSED completes the QC step; FAILED completes this
 * attempt and opens new attempts for every step between the rework target and
 * this QC step (inclusive), so the work flows back through QC again.
 */
export async function recordInspection(ctx: Ctx, taskId: string, input: InspectionInput) {
  assertCan(ctx, "qc.perform");
  if (input.quantityRejected > input.quantityChecked) throw validation("تعداد مردودی بیشتر از تعداد بازرسی‌شده است.");
  if (input.result === "FAILED" && !input.reworkTargetStepKey) throw validation("مرحله دوباره‌کاری را انتخاب کنید.");
  return inTx(ctx, async (tx) => {
    const [t] = await tx.db.select().from(productionTasks).where(eq(productionTasks.id, taskId)).for("update");
    if (!t) throw notFound("مرحله");
    if (!t.isQc) throw invalidState("این مرحله کنترل کیفیت نیست.");
    if (!["READY", "IN_PROGRESS", "PAUSED"].includes(t.status)) throw invalidState("این مرحله آماده بازرسی نیست.");
    const [job] = await tx.db.select().from(productionJobs).where(eq(productionJobs.id, t.jobId));

    const [inspection] = await tx.db
      .insert(qcInspections)
      .values({
        taskId: t.id,
        jobId: t.jobId,
        orderItemId: job!.orderItemId,
        inspectorId: isStaff(tx.actor) ? tx.actor.employeeId : null,
        result: input.result,
        quantityChecked: input.quantityChecked,
        quantityRejected: input.quantityRejected,
        checklist: input.checklist,
        reworkTargetStepKey: input.result === "FAILED" ? input.reworkTargetStepKey : null,
        reworkQuantity: input.result === "FAILED" ? (input.reworkQuantity ?? (input.quantityRejected || t.quantityPlanned)) : null,
        notes: input.notes ?? null,
      })
      .returning();
    if (input.defects.length) {
      await tx.db.insert(qcDefects).values(input.defects.map((d) => ({ inspectionId: inspection!.id, defectCode: d.defectCode, severity: d.severity, quantity: d.quantity, description: d.description ?? null })));
    }
    for (const fileId of input.imageFileIds ?? []) {
      await tx.db.insert(entityFiles).values({ entityType: "qc_inspection", entityId: inspection!.id, fileId, createdBy: actorUserId(tx) });
    }

    const now = new Date();
    await tx.db
      .update(productionTasks)
      .set({
        status: "COMPLETED",
        startedAt: t.startedAt ?? now,
        completedAt: now,
        assigneeId: t.assigneeId ?? (isStaff(tx.actor) ? tx.actor.employeeId : null),
        quantityCompleted: input.quantityChecked - input.quantityRejected,
      })
      .where(eq(productionTasks.id, t.id));
    await taskEvent(tx, t.id, input.result === "PASSED" ? "QC_PASSED" : "QC_FAILED", input.notes, { inspectionId: inspection!.id, rejected: input.quantityRejected });

    if (input.result === "FAILED") {
      const qty = inspection!.reworkQuantity!;
      await sendToRework(tx, t, input.reworkTargetStepKey!, input.notes || "رد در کنترل کیفیت", qty, t.id);
      await orderEvent(tx, {
        orderId: t.orderId,
        orderItemId: job!.orderItemId,
        domain: "QC",
        type: "QC_FAILED",
        message: `«${t.name}» رد شد — دوباره‌کاری از مرحله ${input.reworkTargetStepKey} برای ${formatNumber(qty)} عدد`,
      });
      await emit(tx, "QcFailed", { type: "order", id: t.orderId }, { orderId: t.orderId, taskId: t.id, inspectionId: inspection!.id });
    }
    await syncItems(tx, [job!.orderItemId]);
    return inspection!;
  });
}
