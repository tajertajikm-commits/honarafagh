import { and, desc, eq } from "drizzle-orm";
import { artworkVersions, fileObjects, machines } from "@/server/db/schema";
import type { Ctx } from "@/server/core/context";
import { myQueue, taskDetail } from "./queries";

/** Everything the operator workspace renders, in one call. */
export async function stationData(ctx: Ctx, selectedId?: string, opts: { stepTypes?: string[] } = {}) {
  const queue = await myQueue(ctx, opts);
  const pick = queue.tasks.find((t) => t.task.id === selectedId) ?? queue.tasks.find((t) => t.task.status === "IN_PROGRESS") ?? queue.tasks[0];
  if (!pick) return { queue, detail: null, printFile: null };
  const detail = await taskDetail(ctx, pick.task.id);
  const [printFile] = await ctx.db
    .select({ id: fileObjects.id, name: fileObjects.originalName, versionNo: artworkVersions.versionNo })
    .from(artworkVersions)
    .innerJoin(fileObjects, eq(fileObjects.id, artworkVersions.fileId))
    .where(and(eq(artworkVersions.orderItemId, detail.itemId), eq(artworkVersions.status, "APPROVED_FOR_PRINT")))
    .orderBy(desc(artworkVersions.versionNo))
    .limit(1);
  const [machine] = detail.task.machineId ? await ctx.db.select({ name: machines.name }).from(machines).where(eq(machines.id, detail.task.machineId)) : [];
  return { queue, detail: { ...detail, machineName: machine?.name ?? null }, printFile: printFile ?? null };
}
