import { and, eq, inArray } from "drizzle-orm";
import { machineMaintenance, machines, productionTasks } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { invalidateScheduleCache } from "@/server/modules/scheduling/service";

type Machine = typeof machines.$inferSelect;

export async function upsertMachine(ctx: Ctx, input: Partial<Machine> & { name: string; code: string; typeCode: string }) {
  assertCan(ctx, "machine.manage");
  return inTx(ctx, async (tx) => {
    const values = {
      code: input.code,
      name: input.name,
      typeCode: input.typeCode,
      methodCode: input.methodCode ?? null,
      capacityPerHour: input.capacityPerHour ?? 1000,
      setupMinutes: input.setupMinutes ?? 15,
      maxSheetWidthMm: input.maxSheetWidthMm ?? null,
      maxSheetHeightMm: input.maxSheetHeightMm ?? null,
      colors: input.colors ?? null,
      hourlyCost: input.hourlyCost ?? 0,
      location: input.location ?? null,
      defaultOperatorId: input.defaultOperatorId ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    };
    if (input.id) {
      const [before] = await tx.db.select().from(machines).where(eq(machines.id, input.id));
      if (!before) throw notFound("ماشین");
      const [row] = await tx.db.update(machines).set(values).where(eq(machines.id, input.id)).returning();
      await audit(tx, { action: "machine.update", entityType: "machine", entityId: input.id, before, after: row });
      invalidateScheduleCache();
      return row!;
    }
    const [row] = await tx.db.insert(machines).values(values).returning();
    await audit(tx, { action: "machine.create", entityType: "machine", entityId: row!.id, after: row });
    invalidateScheduleCache();
    return row!;
  });
}

/** Taking a machine out of service is blocked while it is running a job. */
export async function setMachineStatus(ctx: Ctx, machineId: string, status: Machine["status"], reason: string) {
  assertCan(ctx, "machine.manage");
  return inTx(ctx, async (tx) => {
    const [m] = await tx.db.select().from(machines).where(eq(machines.id, machineId)).for("update");
    if (!m) throw notFound("ماشین");
    if (status !== "ACTIVE") {
      const [running] = await tx.db.select({ id: productionTasks.id }).from(productionTasks).where(and(eq(productionTasks.machineId, machineId), eq(productionTasks.status, "IN_PROGRESS"))).limit(1);
      if (running) throw invalidState("این ماشین در حال انجام کار است؛ ابتدا کار را متوقف کنید.");
    }
    await tx.db.update(machines).set({ status }).where(eq(machines.id, machineId));
    await audit(tx, { action: "machine.status", entityType: "machine", entityId: machineId, before: { status: m.status }, after: { status }, reason });
    invalidateScheduleCache();
  });
}

export async function scheduleMaintenance(ctx: Ctx, input: { machineId: string; kind: "PREVENTIVE" | "REPAIR" | "INSPECTION"; title: string; notes?: string; scheduledStart: Date; scheduledEnd: Date }) {
  assertCan(ctx, "machine.manage");
  if (input.scheduledEnd <= input.scheduledStart) throw validation("پایان تعمیر باید بعد از شروع آن باشد.");
  const [row] = await ctx.db.insert(machineMaintenance).values({ ...input, notes: input.notes ?? null, createdBy: actorUserId(ctx) }).returning();
  invalidateScheduleCache();
  return row!;
}

export async function updateMaintenance(ctx: Ctx, id: string, action: "START" | "COMPLETE" | "CANCEL", input: { cost?: number; notes?: string } = {}) {
  assertCan(ctx, "machine.manage");
  return inTx(ctx, async (tx) => {
    const [mt] = await tx.db.select().from(machineMaintenance).where(eq(machineMaintenance.id, id)).for("update");
    if (!mt) throw notFound("تعمیرات");
    const now = new Date();
    if (action === "START") {
      if (mt.status !== "SCHEDULED") throw invalidState("این تعمیر قبلاً شروع شده است.");
      await setMachineStatus(tx, mt.machineId, "MAINTENANCE", `شروع تعمیرات: ${mt.title}`);
      await tx.db.update(machineMaintenance).set({ status: "IN_PROGRESS", startedAt: now }).where(eq(machineMaintenance.id, id));
    } else if (action === "COMPLETE") {
      if (!["SCHEDULED", "IN_PROGRESS"].includes(mt.status)) throw invalidState("این تعمیر بسته شده است.");
      await tx.db.update(machineMaintenance).set({ status: "COMPLETED", completedAt: now, cost: input.cost ?? mt.cost, notes: input.notes ?? mt.notes }).where(eq(machineMaintenance.id, id));
      await setMachineStatus(tx, mt.machineId, "ACTIVE", `پایان تعمیرات: ${mt.title}`);
    } else {
      if (!["SCHEDULED"].includes(mt.status)) throw invalidState("فقط تعمیر زمان‌بندی‌شده قابل لغو است.");
      await tx.db.update(machineMaintenance).set({ status: "CANCELLED" }).where(eq(machineMaintenance.id, id));
    }
    invalidateScheduleCache();
  });
}

export async function openTasksForMachines(ctx: Ctx, machineIds: string[]) {
  if (machineIds.length === 0) return [];
  return ctx.db.select().from(productionTasks).where(and(inArray(productionTasks.machineId, machineIds), inArray(productionTasks.status, ["READY", "IN_PROGRESS", "PAUSED", "BLOCKED"])));
}
