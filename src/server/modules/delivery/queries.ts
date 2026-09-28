import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { customers, deliveryMethods, employeeRoles, employees, orderItems, orders, rolePermissions, shipmentItems, shipments, users, vehicles } from "@/server/db/schema";
import { type Ctx, assertCanAny, isStaff } from "@/server/core/context";

const OPEN = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"] as const;

/** Employees whose roles allow executing deliveries. */
export async function couriers(ctx: Ctx) {
  assertCanAny(ctx, "delivery.view", "delivery.manage", "order.view");
  return ctx.db
    .selectDistinct({ id: employees.id, name: users.fullName })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .innerJoin(employeeRoles, eq(employeeRoles.employeeId, employees.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, employeeRoles.roleId))
    .where(and(eq(employees.isActive, true), eq(rolePermissions.permission, "delivery.execute")))
    .orderBy(asc(users.fullName));
}

export async function deliveryOptions(ctx: Ctx) {
  const methods = await ctx.db.select().from(deliveryMethods).where(eq(deliveryMethods.isActive, true)).orderBy(asc(deliveryMethods.sortOrder));
  const vs = await ctx.db.select().from(vehicles).where(eq(vehicles.isActive, true));
  return { methods, vehicles: vs, couriers: await couriers(ctx) };
}

/**
 * Orders with produced quantity that has not been delivered or put into an
 * open shipment yet. Settlement is reported so the dispatcher sees blockers.
 */
export async function readyToShip(ctx: Ctx) {
  assertCanAny(ctx, "delivery.view", "delivery.manage");
  const inTransit = sql`coalesce((select sum(si.quantity) from shipment_items si join shipments s on s.id = si.shipment_id where si.order_item_id = ${orderItems.id} and s.status in ('PENDING','ASSIGNED','OUT_FOR_DELIVERY')), 0)`;
  const shippableQty = sql<number>`greatest(case when ${orderItems.productionStatus} = 'COMPLETED' then ${orderItems.quantity} else least(${orderItems.quantity}, ${orderItems.quantityProduced}) end - ${orderItems.quantityDelivered} - ${inTransit}, 0)::int`;
  const rows = await ctx.db
    .select({
      order: {
        id: orders.id,
        number: orders.number,
        status: orders.status,
        deliveryStatus: orders.deliveryStatus,
        deliveryMethodId: orders.deliveryMethodId,
        shippingAddress: orders.shippingAddress,
        readyAt: orders.readyAt,
        dueDate: orders.dueDate,
        priority: orders.priority,
        balance: sql<number>`(${orders.total} - (${orders.paidAmount} - ${orders.refundedAmount}))::float`,
        paymentGateOverride: orders.paymentGateOverride,
      },
      customerName: customers.fullName,
      customerPhone: users.phone,
      item: { id: orderItems.id, title: orderItems.title, quantity: orderItems.quantity },
      shippable: shippableQty,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .where(and(eq(orderItems.status, "ACTIVE"), inArray(orders.status, ["IN_PROGRESS", "READY"]), sql`${shippableQty} > 0`))
    .orderBy(sql`${orders.readyAt} asc nulls last`, asc(orders.number));
  const byOrder = new Map<string, { order: (typeof rows)[number]["order"]; customerName: string; customerPhone: string; lines: { itemId: string; title: string; remaining: number }[] }>();
  for (const r of rows) {
    const g = byOrder.get(r.order.id) ?? { order: r.order, customerName: r.customerName, customerPhone: r.customerPhone, lines: [] };
    g.lines.push({ itemId: r.item.id, title: r.item.title, remaining: r.shippable });
    byOrder.set(r.order.id, g);
  }
  return [...byOrder.values()];
}

/** Open shipments; couriers without delivery.manage only see their own. */
export async function openShipments(ctx: Ctx) {
  assertCanAny(ctx, "delivery.view", "delivery.manage", "delivery.execute");
  const mineOnly = isStaff(ctx.actor) && !ctx.actor.permissions.has("delivery.manage") && !ctx.actor.permissions.has("delivery.view");
  return shipmentRows(ctx, and(inArray(shipments.status, [...OPEN]), mineOnly && isStaff(ctx.actor) ? eq(shipments.assigneeId, ctx.actor.employeeId) : undefined));
}

export async function recentShipments(ctx: Ctx, days = 7) {
  assertCanAny(ctx, "delivery.view", "delivery.manage");
  return shipmentRows(ctx, and(inArray(shipments.status, ["DELIVERED", "FAILED", "CANCELLED", "RETURNED"]), gte(shipments.updatedAt, new Date(Date.now() - days * 86_400_000))), 60);
}

async function shipmentRows(ctx: Ctx, where: ReturnType<typeof and>, limit = 200) {
  const rows = await ctx.db
    .select({
      s: shipments,
      orderNumber: orders.number,
      orderBalance: sql<number>`(${orders.total} - (${orders.paidAmount} - ${orders.refundedAmount}))::float`,
      customerName: customers.fullName,
      methodName: deliveryMethods.name,
      methodKind: deliveryMethods.kind,
      assigneeName: users.fullName,
      vehicleName: vehicles.name,
    })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(deliveryMethods, eq(deliveryMethods.id, shipments.methodId))
    .leftJoin(employees, eq(employees.id, shipments.assigneeId))
    .leftJoin(users, eq(users.id, employees.userId))
    .leftJoin(vehicles, eq(vehicles.id, shipments.vehicleId))
    .where(where)
    .orderBy(desc(shipments.updatedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const lines = await ctx.db
    .select({ shipmentId: shipmentItems.shipmentId, quantity: shipmentItems.quantity, title: orderItems.title })
    .from(shipmentItems)
    .innerJoin(orderItems, eq(orderItems.id, shipmentItems.orderItemId))
    .where(inArray(shipmentItems.shipmentId, rows.map((r) => r.s.id)));
  return rows.map((r) => ({ ...r, lines: lines.filter((l) => l.shipmentId === r.s.id) }));
}
