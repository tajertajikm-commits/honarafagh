import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { employees, productionSteps, shipments, users } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { invalidState, validation } from "@/server/core/errors";
import { emit } from "@/server/events/outbox";
import { loadOrder, orderEvent, type Order } from "@/server/modules/orders/state";
import { assertAssignee, finishStep, markStarted, type Step } from "@/server/modules/workflow/engine";
import { station } from "@/server/modules/workflow/stations";
import { normalizePhone } from "@/lib/persian";

export type ShippingMethod = "COURIER" | "POST" | "EXTERNAL" | "CUSTOMER_COURIER" | "PICKUP";
export const SHIPPING_METHOD_LABEL: Record<ShippingMethod, string> = {
  COURIER: "پیک چاپخانه",
  POST: "پست",
  EXTERNAL: "باربری / شرکت پخش",
  CUSTOMER_COURIER: "پیک مشتری",
  PICKUP: "تحویل حضوری در چاپخانه",
};

async function shippingStep(ctx: Ctx, o: Order): Promise<Step> {
  const key = o.productionType === "DIGITAL" ? "D_SHIPPING" : "O_SHIPPING";
  const [s] = await ctx.db.select().from(productionSteps).where(and(eq(productionSteps.orderId, o.id), eq(productionSteps.key, key))).for("update");
  if (!s) throw invalidState("این سفارش مرحله ارسال ندارد.");
  assertCan(ctx, station(key).permission);
  assertAssignee(ctx, s);
  return s;
}

export interface DispatchInput {
  method: ShippingMethod;
  responsibleId?: string | null;
  carrierName?: string | null;
  trackingCode?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  /** Pickup / customer courier: who handed it over (defaults to the person recording it). */
  deliveredById?: string | null;
  notes?: string | null;
}

async function activeEmployee(ctx: Ctx, id: string, what: string) {
  const [e] = await ctx.db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, id), eq(employees.isActive, true)));
  if (!e) throw validation(`${what} معتبر نیست.`);
}

/**
 * Records how the order left the printing house. A pickup (or a handover to
 * the customer's courier at the counter) is delivered at the same moment.
 */
export async function dispatchOrder(ctx: Ctx, orderId: string, input: DispatchInput) {
  if ((input.method === "POST" || input.method === "EXTERNAL") && !input.carrierName?.trim() && !input.trackingCode?.trim()) {
    throw validation("نام شرکت حمل یا کد رهگیری را وارد کنید.");
  }
  if (input.method === "CUSTOMER_COURIER" && !input.carrierName?.trim()) throw validation("نام پیک مشتری را وارد کنید.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const step = await shippingStep(tx, o);
    if (step.status !== "READY") throw invalidState(step.status === "WAITING" ? "سفارش هنوز آماده ارسال نیست." : "ارسال این سفارش ثبت شده است.");
    if (input.responsibleId) await activeEmployee(tx, input.responsibleId, "مسئول ارسال");
    if (input.deliveredById) await activeEmployee(tx, input.deliveredById, "تحویل‌دهنده");
    const me = ctx.actor.kind === "staff" ? ctx.actor.employeeId : null;
    const phone = input.recipientPhone ? normalizePhone(input.recipientPhone) : null;
    const address = input.method === "PICKUP" || input.method === "CUSTOMER_COURIER" ? null : o.shippingAddress;
    const handover = input.method === "PICKUP" || input.method === "CUSTOMER_COURIER";
    const now = new Date();
    await tx.db.insert(shipments).values({
      orderId,
      method: input.method,
      status: handover ? "DELIVERED" : "DISPATCHED",
      responsibleId: input.responsibleId ?? me,
      carrierName: input.carrierName?.trim() || null,
      trackingCode: input.trackingCode?.trim() || null,
      recipientName: input.recipientName?.trim() || address?.recipientName || null,
      recipientPhone: phone ?? address?.recipientPhone ?? null,
      address,
      dispatchedAt: now,
      deliveredAt: handover ? now : null,
      deliveredById: handover ? (input.deliveredById ?? me) : null,
      notes: input.notes?.trim() || null,
      createdBy: actorUserId(tx),
    });
    const tracking = input.trackingCode?.trim() ? ` — کد رهگیری ${input.trackingCode.trim()}` : "";
    await orderEvent(tx, { orderId, domain: "SHIPPING", type: "DISPATCHED", message: `${SHIPPING_METHOD_LABEL[input.method]}${input.carrierName ? ` (${input.carrierName.trim()})` : ""}${tracking}`, visibleToCustomer: true });
    await markStarted(tx, step);
    await emit(tx, "OrderShipped", { type: "order", id: orderId }, { orderId });
    if (handover) {
      const [fresh] = await tx.db.select().from(productionSteps).where(eq(productionSteps.id, step.id));
      await finishStep(tx, fresh!, input.method === "PICKUP" ? "تحویل حضوری" : "تحویل به پیک مشتری");
      await emit(tx, "OrderDelivered", { type: "order", id: orderId }, { orderId });
    }
  });
}

export async function markDelivered(ctx: Ctx, orderId: string, input: { recipientName?: string | null; note?: string | null; deliveredById?: string | null } = {}) {
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const step = await shippingStep(tx, o);
    if (step.status !== "IN_PROGRESS") throw invalidState("این سفارش در حال ارسال نیست.");
    const [s] = await tx.db.select().from(shipments).where(eq(shipments.orderId, orderId)).for("update");
    if (!s) throw invalidState("ارسالی برای این سفارش ثبت نشده است.");
    if (input.deliveredById) await activeEmployee(tx, input.deliveredById, "تحویل‌دهنده");
    // The courier who took it delivered it, unless someone else is named.
    const deliveredById = input.deliveredById ?? (s.method === "COURIER" ? s.responsibleId : null) ?? (ctx.actor.kind === "staff" ? ctx.actor.employeeId : null);
    await tx.db.update(shipments).set({ status: "DELIVERED", deliveredAt: new Date(), deliveredById, recipientName: input.recipientName?.trim() || s.recipientName, notes: input.note?.trim() || s.notes }).where(eq(shipments.id, s.id));
    await orderEvent(tx, { orderId, domain: "SHIPPING", type: "DELIVERED", message: "مرسوله تحویل گیرنده شد", visibleToCustomer: true });
    await finishStep(tx, step, input.note?.trim() || "تحویل شد");
    await emit(tx, "OrderDelivered", { type: "order", id: orderId }, { orderId });
  });
}

const deliverer = alias(employees, "deliverer");
const delivererUser = alias(users, "deliverer_user");

export async function shipmentOf(ctx: Ctx, orderId: string) {
  const [s] = await ctx.db
    .select({ shipment: shipments, responsibleName: users.fullName, deliveredByName: delivererUser.fullName })
    .from(shipments)
    .leftJoin(employees, eq(employees.id, shipments.responsibleId))
    .leftJoin(users, eq(users.id, employees.userId))
    .leftJoin(deliverer, eq(deliverer.id, shipments.deliveredById))
    .leftJoin(delivererUser, eq(delivererUser.id, deliverer.userId))
    .where(eq(shipments.orderId, orderId));
  return s ?? null;
}
