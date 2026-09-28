import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { deliveryMethods, orderItems, orders, shipmentItems, shipments, type AddressSnapshot } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, assertCanAny, inTx, isStaff } from "@/server/core/context";
import { forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { deliveryProvider } from "@/server/integrations/delivery";
import { orderEvent, recomputeOrder } from "@/server/modules/orders/state";
import { formatNumber } from "@/lib/persian";

type Shipment = typeof shipments.$inferSelect;
const OPEN: Shipment["status"][] = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"];

/** Quantity of each item not yet delivered and not already in an open shipment. */
export async function shippableQuantities(ctx: Ctx, orderId: string) {
  const items = await ctx.db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "ACTIVE")));
  const inTransit = await ctx.db
    .select({ itemId: shipmentItems.orderItemId, q: sql<number>`sum(${shipmentItems.quantity})::int` })
    .from(shipmentItems)
    .innerJoin(shipments, eq(shipments.id, shipmentItems.shipmentId))
    .where(and(eq(shipments.orderId, orderId), inArray(shipments.status, OPEN)))
    .groupBy(shipmentItems.orderItemId);
  return items.map((i) => ({
    item: i,
    remaining: Math.max(0, i.quantity - i.quantityDelivered - (inTransit.find((t) => t.itemId === i.id)?.q ?? 0)),
  }));
}

export async function createShipment(
  ctx: Ctx,
  orderId: string,
  input: {
    methodId: string;
    items?: { orderItemId: string; quantity: number }[];
    assigneeId?: string | null;
    vehicleId?: string | null;
    scheduledAt?: Date | null;
    address?: AddressSnapshot | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    externalProvider?: string | null;
    trackingCode?: string | null;
    notes?: string | null;
  },
) {
  assertCan(ctx, "delivery.manage");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    if (["CANCELLED", "PENDING_REVIEW"].includes(o.status)) throw invalidState("این سفارش قابل ارسال نیست.");
    const [method] = await tx.db.select().from(deliveryMethods).where(eq(deliveryMethods.id, input.methodId));
    if (!method) throw validation("روش ارسال نامعتبر است.");
    const shippable = await shippableQuantities(tx, orderId);
    const lines = input.items ?? shippable.filter((s) => s.remaining > 0).map((s) => ({ orderItemId: s.item.id, quantity: s.remaining }));
    if (lines.length === 0) throw invalidState("قلمی برای ارسال باقی نمانده است.");
    for (const l of lines) {
      const s = shippable.find((x) => x.item.id === l.orderItemId);
      if (!s) throw validation("قلم ارسال به این سفارش تعلق ندارد.");
      if (l.quantity <= 0 || l.quantity > s.remaining) throw validation(`حداکثر قابل ارسال برای «${s.item.title}» ${s.remaining} است.`);
      if (s.item.productionStatus !== "COMPLETED" && s.item.quantityProduced < l.quantity) throw invalidState(`تولید «${s.item.title}» هنوز کامل نشده است.`);
    }
    const address = input.address ?? o.shippingAddress;
    if (method.kind !== "PICKUP" && !address) throw validation("آدرس تحویل مشخص نیست.");
    const provider = method.kind === "EXTERNAL" ? deliveryProvider(method.providerCode) : null;
    const [s] = await tx.db
      .insert(shipments)
      .values({
        orderId,
        methodId: method.id,
        status: input.assigneeId || method.kind === "EXTERNAL" ? "ASSIGNED" : "PENDING",
        assigneeId: input.assigneeId ?? null,
        vehicleId: input.vehicleId ?? null,
        externalProvider: input.externalProvider ?? (provider ? provider.name : null),
        trackingCode: input.trackingCode ?? null,
        scheduledAt: input.scheduledAt ?? null,
        recipientName: input.recipientName ?? address?.recipientName ?? null,
        recipientPhone: input.recipientPhone ?? address?.recipientPhone ?? null,
        address: method.kind === "PICKUP" ? null : address,
        notes: input.notes ?? null,
        createdBy: actorUserId(tx),
      })
      .returning();
    await tx.db.insert(shipmentItems).values(lines.map((l) => ({ shipmentId: s!.id, orderItemId: l.orderItemId, quantity: l.quantity })));
    if (provider?.automated && address) {
      const booked = await provider.book({ shipmentId: s!.id, recipientName: s!.recipientName ?? "", recipientPhone: s!.recipientPhone ?? "", address: `${address.city}، ${address.line}` });
      if (booked.trackingCode) await tx.db.update(shipments).set({ trackingCode: booked.trackingCode }).where(eq(shipments.id, s!.id));
    }
    await orderEvent(tx, { orderId, domain: "DELIVERY", type: "SHIPMENT_CREATED", message: `${method.name} — ${formatNumber(lines.reduce((a, l) => a + l.quantity, 0))} عدد` });
    if (s!.status === "ASSIGNED") await emit(tx, "DeliveryAssigned", { type: "order", id: orderId }, { orderId, shipmentId: s!.id });
    await recomputeOrder(tx, orderId);
    return s!;
  });
}

async function lockShipment(ctx: Ctx, id: string) {
  const [s] = await ctx.db.select().from(shipments).where(eq(shipments.id, id)).for("update");
  if (!s) throw notFound("مرسوله");
  return s;
}

/** Couriers may only act on shipments assigned to them; managers on any. */
function assertCanHandle(ctx: Ctx, s: Shipment) {
  assertCanAny(ctx, "delivery.manage", "delivery.execute");
  if (isStaff(ctx.actor) && !ctx.actor.permissions.has("delivery.manage") && s.assigneeId !== ctx.actor.employeeId) throw forbidden("این مرسوله به شما سپرده نشده است.");
}

export async function assignShipment(ctx: Ctx, id: string, input: { assigneeId?: string | null; vehicleId?: string | null; scheduledAt?: Date | null; trackingCode?: string | null; externalProvider?: string | null }) {
  assertCan(ctx, "delivery.manage");
  return inTx(ctx, async (tx) => {
    const s = await lockShipment(tx, id);
    if (!["PENDING", "ASSIGNED", "FAILED"].includes(s.status)) throw invalidState("این مرسوله قابل تخصیص نیست.");
    const patch = { ...input, status: "ASSIGNED" as const, failureReason: null };
    await tx.db.update(shipments).set(patch).where(eq(shipments.id, id));
    await audit(tx, { action: "delivery.assign", entityType: "shipment", entityId: id, before: { assigneeId: s.assigneeId, vehicleId: s.vehicleId }, after: input });
    await emit(tx, "DeliveryAssigned", { type: "order", id: s.orderId }, { orderId: s.orderId, shipmentId: id });
    await recomputeOrder(tx, s.orderId);
  });
}

export async function dispatchShipment(ctx: Ctx, id: string) {
  return inTx(ctx, async (tx) => {
    const s = await lockShipment(tx, id);
    assertCanHandle(tx, s);
    if (!["PENDING", "ASSIGNED"].includes(s.status)) throw invalidState("این مرسوله آماده خروج نیست.");
    await tx.db.update(shipments).set({ status: "OUT_FOR_DELIVERY", dispatchedAt: new Date() }).where(eq(shipments.id, id));
    await orderEvent(tx, { orderId: s.orderId, domain: "DELIVERY", type: "DISPATCHED", message: "سفارش ارسال شد", visibleToCustomer: true });
    await emit(tx, "DeliveryDispatched", { type: "order", id: s.orderId }, { orderId: s.orderId, shipmentId: id });
    await recomputeOrder(tx, s.orderId);
  });
}

export async function completeShipment(ctx: Ctx, id: string, input: { recipientName: string; proofNote?: string | null; proofFileId?: string | null }) {
  if (!input.recipientName.trim()) throw validation("نام تحویل‌گیرنده الزامی است.");
  return inTx(ctx, async (tx) => {
    const s = await lockShipment(tx, id);
    assertCanHandle(tx, s);
    const [method] = await tx.db.select().from(deliveryMethods).where(eq(deliveryMethods.id, s.methodId));
    const allowed: Shipment["status"][] = method?.kind === "PICKUP" ? ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"] : ["OUT_FOR_DELIVERY"];
    if (!allowed.includes(s.status)) throw invalidState("این مرسوله در مسیر تحویل نیست.");
    await tx.db
      .update(shipments)
      .set({ status: "DELIVERED", deliveredAt: new Date(), recipientName: input.recipientName, proofNote: input.proofNote ?? null, proofFileId: input.proofFileId ?? null })
      .where(eq(shipments.id, id));
    const lines = await tx.db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, id));
    for (const l of lines) {
      await tx.db.update(orderItems).set({ quantityDelivered: sql`${orderItems.quantityDelivered} + ${l.quantity}` }).where(eq(orderItems.id, l.orderItemId));
    }
    await orderEvent(tx, { orderId: s.orderId, domain: "DELIVERY", type: "DELIVERED", message: `تحویل به ${input.recipientName}`, visibleToCustomer: true });
    await audit(tx, { action: "delivery.complete", entityType: "shipment", entityId: id, after: { recipientName: input.recipientName, proofFileId: input.proofFileId } });
    await emit(tx, "DeliveryCompleted", { type: "order", id: s.orderId }, { orderId: s.orderId, shipmentId: id });
    await recomputeOrder(tx, s.orderId);
  });
}

export async function failShipment(ctx: Ctx, id: string, reason: string) {
  if (!reason.trim()) throw validation("دلیل عدم تحویل را بنویسید.");
  return inTx(ctx, async (tx) => {
    const s = await lockShipment(tx, id);
    assertCanHandle(tx, s);
    if (!["ASSIGNED", "OUT_FOR_DELIVERY"].includes(s.status)) throw invalidState("این مرسوله در مسیر نیست.");
    await tx.db.update(shipments).set({ status: "FAILED", failureReason: reason }).where(eq(shipments.id, id));
    await orderEvent(tx, { orderId: s.orderId, domain: "DELIVERY", type: "FAILED", message: `تحویل ناموفق: ${reason}`, visibleToCustomer: true });
    await emit(tx, "DeliveryFailed", { type: "order", id: s.orderId }, { orderId: s.orderId, shipmentId: id });
    await recomputeOrder(tx, s.orderId);
  });
}

export async function cancelShipment(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx, "delivery.manage");
  return inTx(ctx, async (tx) => {
    const s = await lockShipment(tx, id);
    if (["DELIVERED", "CANCELLED"].includes(s.status)) throw invalidState("این مرسوله قابل لغو نیست.");
    await tx.db.update(shipments).set({ status: "CANCELLED", notes: [s.notes, reason].filter(Boolean).join("\n") }).where(eq(shipments.id, id));
    await audit(tx, { action: "delivery.cancel", entityType: "shipment", entityId: id, reason });
    await recomputeOrder(tx, s.orderId);
  });
}

export async function openShipmentsForCourier(ctx: Ctx) {
  if (!isStaff(ctx.actor)) throw forbidden();
  return ctx.db.select().from(shipments).where(and(eq(shipments.assigneeId, ctx.actor.employeeId), notInArray(shipments.status, ["DELIVERED", "CANCELLED", "RETURNED"])));
}
