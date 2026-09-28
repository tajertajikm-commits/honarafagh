import type { stationData } from "@/server/modules/production/station";
import type { StationDetail, StationQueueItem } from "./station";

type Data = Awaited<ReturnType<typeof stationData>>;

/** Server → client projection for the station UI (plain JSON, no internal fields). */
export function toStationProps(data: Data, employeeId: string): { queue: StationQueueItem[]; detail: StationDetail | null } {
  const queue = data.queue.tasks.map((q) => ({
    id: q.task.id,
    name: q.task.name,
    status: q.task.status,
    stepColor: q.stepColor,
    orderNumber: q.orderNumber,
    orderPriority: q.orderPriority,
    customerName: q.customerName,
    itemTitle: q.itemTitle,
    itemQuantity: q.task.quantityPlanned,
    itemUnit: q.itemUnit,
    dueDate: q.dueDate?.toISOString() ?? null,
    estimatedMinutes: q.task.estimatedMinutes,
    isQc: q.task.isQc,
    earliestStartAt: q.task.earliestStartAt?.toISOString() ?? null,
    mine: q.task.assigneeId === employeeId,
  }));
  const d = data.detail;
  if (!d) return { queue, detail: null };
  const siblingName = new Map(d.siblings.map((s) => [s.stepKey, s.name]));
  return {
    queue,
    detail: {
      id: d.task.id,
      name: d.task.name,
      status: d.task.status,
      isQc: d.task.isQc,
      attempt: d.task.attempt,
      reworkReason: d.task.reworkReason,
      blockedReason: d.task.blockedReason,
      orderId: d.task.orderId,
      orderNumber: d.orderNumber,
      customerName: d.customerName,
      itemTitle: d.itemTitle,
      quantityPlanned: d.task.quantityPlanned,
      unit: d.itemUnit,
      machineTypeCode: d.task.machineTypeCode,
      machineId: d.task.machineId,
      machineName: d.machineName,
      estimatedMinutes: d.task.estimatedMinutes,
      actualMinutes: d.task.actualMinutes,
      runningSince: d.runningSince?.toISOString() ?? null,
      earliestStartAt: d.task.earliestStartAt?.toISOString() ?? null,
      checklist: d.task.checklist,
      reworkTargets: d.task.reworkTargets.map((k) => ({ key: k, name: siblingName.get(k) ?? k })),
      spec: d.spec ? { summary: d.spec.summary, method: d.spec.method, impositions: d.spec.impositions } : null,
      requirements: d.requirements.map((r) => ({ id: r.req.id, name: r.material.name, sku: r.material.sku, unit: r.material.unit, issued: r.req.quantityIssued, consumed: r.req.quantityConsumed, wasted: r.req.quantityWasted, returned: r.req.quantityReturned, required: r.req.quantityRequired })),
      machineCandidates: d.machineCandidates,
      defectTypes: d.defectTypes.map((t) => ({ code: t.code, name: t.name })),
      printFile: data.printFile,
      events: d.events.map((e) => ({ id: e.event.id, type: e.event.type, note: e.event.note, actor: e.actor, createdAt: e.event.createdAt.toISOString() })),
    },
  };
}
