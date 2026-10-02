import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { customers, employeeRoles, employees, notificationTemplates, notifications, orders, rolePermissions, shipments, users } from "@/server/db/schema";
import { env } from "@/server/config/env";
import type { Ctx } from "@/server/core/context";
import { smsProvider } from "@/server/integrations/sms";
import { station } from "@/server/modules/workflow/stations";
import { formatToman } from "@/lib/persian";

type OutboxRow = { id: number; type: string; payload: Record<string, unknown> };

export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

/** Loads the values templates may reference for an event. */
async function variablesFor(ctx: Ctx, e: OutboxRow) {
  const p = e.payload as Record<string, string | number | null | undefined>;
  const vars: Record<string, string | number | null> = {};
  let customer: { id: string; phone: string; fullName: string; userId: string | null } | null = null;
  let order: { id: string; type: "DIGITAL" | "OFFSET"; designerId: string | null } | null = null;
  if (p.orderId) {
    const [o] = await ctx.db
      .select({ code: orders.code, total: orders.total, type: orders.productionType, designerId: orders.designerId, customerId: orders.customerId, phone: customers.phone, fullName: customers.fullName, userId: customers.userId })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, String(p.orderId)));
    if (o) {
      vars.orderCode = o.code;
      vars.customerName = o.fullName || "مشتری";
      vars.link = `${env().APP_URL.replace(/\/+$/, "")}/account/orders/${p.orderId}`;
      if (e.type === "OrderPriced") vars.amount = formatToman(o.total);
      customer = { id: o.customerId, phone: o.phone, fullName: o.fullName, userId: o.userId };
      order = { id: String(p.orderId), type: o.type, designerId: o.designerId };
      if (e.type === "OrderShipped") {
        const [s] = await ctx.db.select({ trackingCode: shipments.trackingCode }).from(shipments).where(eq(shipments.orderId, String(p.orderId)));
        vars.trackingText = s?.trackingCode ? `کد رهگیری: ${s.trackingCode}` : "";
      }
    }
  }
  if (p.amount != null && e.type !== "OrderPriced") vars.amount = formatToman(Number(p.amount));
  if (p.note != null) vars.note = String(p.note);
  if (p.stepKey) vars.stepName = station(String(p.stepKey)).name;
  return { vars, customer, order };
}

/** Active staff holding a permission. */
export async function staffWithPermission(ctx: Ctx, permission: string) {
  const rows = await ctx.db
    .selectDistinct({ userId: employees.userId })
    .from(employeeRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, employeeRoles.roleId))
    .innerJoin(employees, eq(employees.id, employeeRoles.employeeId))
    .innerJoin(users, eq(users.id, employees.userId))
    .where(and(eq(rolePermissions.permission, permission), eq(employees.isActive, true), eq(users.isActive, true)));
  return rows.map((r) => r.userId);
}

/** Outbox handler: turns a domain event into SMS / in-app notifications per templates. */
export async function dispatchNotifications(ctx: Ctx, e: OutboxRow) {
  const templates = await ctx.db.select().from(notificationTemplates).where(and(eq(notificationTemplates.eventType, e.type), eq(notificationTemplates.isActive, true)));
  if (templates.length === 0) return;
  const { vars, customer, order } = await variablesFor(ctx, e);

  for (const t of templates) {
    const body = renderTemplate(t.body, vars);
    const title = renderTemplate(t.title, vars);
    if (t.audience === "CUSTOMER") {
      if (!customer) continue;
      if (t.channel === "SMS") {
        const key = `${e.id}:SMS:${customer.phone}`;
        const [n] = await ctx.db
          .insert(notifications)
          .values({ phone: customer.phone, userId: customer.userId, channel: "SMS", eventType: e.type, title, body, dedupeKey: key, outboxEventId: e.id })
          .onConflictDoNothing()
          .returning();
        if (!n) continue; // already sent on a previous attempt
        try {
          const r = await smsProvider().send(customer.phone, body);
          await ctx.db.update(notifications).set({ status: "SENT", sentAt: new Date(), providerMessageId: r.messageId }).where(eq(notifications.id, n.id));
        } catch (err) {
          await ctx.db.update(notifications).set({ status: "FAILED", error: String(err).slice(0, 500) }).where(eq(notifications.id, n.id));
        }
      } else if (t.channel === "IN_APP" && customer.userId) {
        // In-app links are app-relative (SMS bodies carry the absolute URL).
        const link = order ? `/account/orders/${order.id}` : "/account";
        await ctx.db
          .insert(notifications)
          .values({ userId: customer.userId, channel: "IN_APP", eventType: e.type, title, body, link, status: "SENT", sentAt: new Date(), dedupeKey: `${e.id}:IN_APP:${customer.userId}`, outboxEventId: e.id })
          .onConflictDoNothing();
      }
    } else if (t.audience === "STAFF" && t.permission && t.channel === "IN_APP") {
      const permission = t.permission.replace("{type}", (order?.type ?? "DIGITAL").toLowerCase());
      let recipients = await staffWithPermission(ctx, permission);
      // Design work goes to the assigned designer when there is one.
      if (e.type === "DesignAssigned" && e.payload.designerUserId) recipients = [String(e.payload.designerUserId)];
      const link = order ? `/panel/orders/${order.id}` : "/panel";
      for (const userId of recipients) {
        await ctx.db
          .insert(notifications)
          .values({ userId, channel: "IN_APP", eventType: e.type, title, body, link, status: "SENT", sentAt: new Date(), dedupeKey: `${e.id}:IN_APP:${userId}:${t.id}`, outboxEventId: e.id })
          .onConflictDoNothing();
      }
    }
  }
}

export async function inboxFor(ctx: Ctx, userId: string, limit = 20) {
  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.channel, "IN_APP")))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ unread }] = (await ctx.db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.channel, "IN_APP"), isNull(notifications.readAt)))) as [{ unread: number }];
  return { items: rows, unread };
}

export async function markRead(ctx: Ctx, userId: string, ids?: string[]) {
  await ctx.db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
}
