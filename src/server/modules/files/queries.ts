import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { artworkVersions, customers, fileObjects, orderItems, orders, users } from "@/server/db/schema";
import { type Ctx, assertCanAny } from "@/server/core/context";

const OPEN_FILE_STATUS = ["AWAITING_FILE", "IN_DESIGN", "UNDER_REVIEW", "NEEDS_REVISION", "AWAITING_CUSTOMER_APPROVAL"] as const;

/**
 * File work queue for designers and prepress: every active order item whose
 * artwork is not yet approved for print, with its design/prepress task state.
 */
export async function studioQueue(ctx: Ctx) {
  assertCanAny(ctx, "file.view", "file.review", "file.upload");
  const stepState = (type: string) =>
    sql<string | null>`(select t.status from production_tasks t join production_jobs j on j.id = t.job_id where j.order_item_id = ${orderItems.id} and t.step_type_code = ${type} order by t.attempt desc limit 1)`;
  return ctx.db
    .select({
      item: { id: orderItems.id, title: orderItems.title, quantity: orderItems.quantity, fileStatus: orderItems.fileStatus, needsDesign: orderItems.needsDesign },
      order: { id: orders.id, number: orders.number, status: orders.status, dueDate: orders.dueDate, priority: orders.priority },
      customerName: customers.fullName,
      versions: sql<number>`(select count(*) from artwork_versions v where v.order_item_id = ${orderItems.id})::int`,
      lastUpload: sql<Date | null>`(select max(v.created_at) from artwork_versions v where v.order_item_id = ${orderItems.id})`,
      designTask: stepState("DESIGN"),
      designAssignee: sql<string | null>`(select u.full_name from production_tasks t join production_jobs j on j.id = t.job_id join employees e on e.id = t.assignee_id join users u on u.id = e.user_id where j.order_item_id = ${orderItems.id} and t.step_type_code = 'DESIGN' order by t.attempt desc limit 1)`,
      designAttempt: sql<number | null>`(select max(t.attempt) from production_tasks t join production_jobs j on j.id = t.job_id where j.order_item_id = ${orderItems.id} and t.step_type_code = 'DESIGN')`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orderItems.status, "ACTIVE"), inArray(orderItems.fileStatus, [...OPEN_FILE_STATUS]), notInArray(orders.status, ["CANCELLED", "COMPLETED", "PENDING_REVIEW"])))
    .orderBy(sql`${orders.dueDate} asc nulls last`, orders.number);
}

/** Items waiting on prepress (file approved, prepress / plate steps open). */
export async function prepressQueue(ctx: Ctx) {
  assertCanAny(ctx, "file.view", "file.review", "production.view");
  return ctx.db.execute<{ task_id: string; name: string; status: string; step_type_code: string; order_id: string; number: number; title: string; due_date: Date | null; assignee: string | null }>(sql`
    select t.id as task_id, t.name, t.status, t.step_type_code, o.id as order_id, o.number, oi.title, o.due_date, u.full_name as assignee
    from production_tasks t
    join production_jobs j on j.id = t.job_id
    join order_items oi on oi.id = j.order_item_id
    join orders o on o.id = t.order_id
    left join employees e on e.id = t.assignee_id
    left join users u on u.id = e.user_id
    where t.step_type_code in ('PREPRESS','PLATE_MAKING') and t.status in ('READY','IN_PROGRESS','PAUSED','BLOCKED')
      and not exists (select 1 from production_tasks t2 where t2.job_id = t.job_id and t2.step_key = t.step_key and t2.attempt > t.attempt)
    order by o.due_date asc nulls last`);
}

export async function artworkForItems(ctx: Ctx, itemIds: string[]) {
  assertCanAny(ctx, "file.view", "file.review", "file.upload");
  if (itemIds.length === 0) return [];
  const uploader = users;
  return ctx.db
    .select({ version: artworkVersions, file: { id: fileObjects.id, originalName: fileObjects.originalName, mimeType: fileObjects.mimeType, sizeBytes: fileObjects.sizeBytes }, uploader: uploader.fullName })
    .from(artworkVersions)
    .innerJoin(fileObjects, eq(fileObjects.id, artworkVersions.fileId))
    .leftJoin(uploader, eq(uploader.id, artworkVersions.uploadedBy))
    .where(inArray(artworkVersions.orderItemId, itemIds))
    .orderBy(desc(artworkVersions.versionNo));
}
