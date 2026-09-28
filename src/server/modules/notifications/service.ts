import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  customers,
  employeeRoles,
  employees,
  inquiries,
  materials,
  notificationTemplates,
  notifications,
  orders,
  productionIssues,
  productionTasks,
  quotes,
  roles,
  shipments,
  users,
} from "@/server/db/schema";
import { env } from "@/server/config/env";
import type { Ctx } from "@/server/core/context";
import { smsProvider } from "@/server/integrations/sms";
import { formatToman, toFaDigits } from "@/lib/persian";

type OutboxRow = { id: number; type: string; payload: Record<string, unknown> };

export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

/** Loads the values templates may reference for an event. */
async function variablesFor(ctx: Ctx, e: OutboxRow) {
  const p = e.payload as Record<string, string | number | undefined>;
  const vars: Record<string, string | number | null> = {};
  let customer: { id: string; phone: string; fullName: string; userId: string | null } | null = null;
  const base = env().APP_URL;
  if (p.orderId) {
    const [o] = await ctx.db
      .select({ number: orders.number, customerId: orders.customerId, phone: customers.phone, fullName: customers.fullName, userId: customers.userId, customerRowId: customers.id })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, String(p.orderId)));
    if (o) {
      vars.orderNumber = toFaDigits(o.number);
      vars.customerName = o.fullName || "مشتری";
      vars.link = `${base}/account/orders/${p.orderId}`;
      customer = { id: o.customerRowId, phone: o.phone, fullName: o.fullName, userId: o.userId };
    }
  }
  if (p.amount != null) vars.amount = formatToman(Number(p.amount));
  if (p.shipmentId) {
    const [s] = await ctx.db.select({ trackingCode: shipments.trackingCode, provider: shipments.externalProvider }).from(shipments).where(eq(shipments.id, String(p.shipmentId)));
    vars.trackingText = s?.trackingCode ? `کد رهگیری: ${s.trackingCode}` : "";
  }
  if (p.materialId) {
    const [m] = await ctx.db.select({ name: materials.name }).from(materials).where(eq(materials.id, String(p.materialId)));
    vars.materialName = m?.name ?? "";
  }
  if (p.issueId) {
    const [i] = await ctx.db
      .select({ description: productionIssues.description, taskName: productionTasks.name })
      .from(productionIssues)
      .innerJoin(productionTasks, eq(productionTasks.id, productionIssues.taskId))
      .where(eq(productionIssues.id, String(p.issueId)));
    vars.description = i?.description ?? "";
    vars.taskName = i?.taskName ?? "";
  }
  if (p.quoteId) {
    const [q] = await ctx.db
      .select({ number: quotes.number, phone: customers.phone, fullName: customers.fullName, userId: customers.userId, customerId: customers.id })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .where(eq(quotes.id, String(p.quoteId)));
    if (q) {
      vars.quoteNumber = toFaDigits(q.number);
      vars.link = `${base}/account/quotes/${p.quoteId}`;
      customer = { id: q.customerId, phone: q.phone, fullName: q.fullName, userId: q.userId };
    }
  }
  if (p.inquiryId) {
    const [iq] = await ctx.db
      .select({ number: inquiries.number, fullName: customers.fullName })
      .from(inquiries)
      .innerJoin(customers, eq(customers.id, inquiries.customerId))
      .where(eq(inquiries.id, String(p.inquiryId)));
    vars.inquiryNumber = iq ? toFaDigits(iq.number) : "";
    vars.customerName = iq?.fullName ?? "";
  }
  return { vars, customer };
}

async function staffWithRole(ctx: Ctx, roleCode: string) {
  const rows = await ctx.db
    .selectDistinct({ userId: employees.userId })
    .from(employeeRoles)
    .innerJoin(roles, eq(roles.id, employeeRoles.roleId))
    .innerJoin(employees, eq(employees.id, employeeRoles.employeeId))
    .innerJoin(users, eq(users.id, employees.userId))
    .where(and(inArray(roles.code, [roleCode, "MANAGER"]), eq(employees.isActive, true), eq(users.isActive, true)));
  return rows.map((r) => r.userId);
}

const dayKey = () => new Date().toISOString().slice(0, 10);

/** Outbox handler: turns a domain event into SMS / in-app notifications per templates. */
export async function dispatchNotifications(ctx: Ctx, e: OutboxRow) {
  const templates = await ctx.db.select().from(notificationTemplates).where(and(eq(notificationTemplates.eventType, e.type), eq(notificationTemplates.isActive, true)));
  if (templates.length === 0) return;
  const { vars, customer } = await variablesFor(ctx, e);
  // Stock alerts are re-emitted on every movement below the reorder point: one per material per day.
  const dedupeScope = e.type === "StockLow" ? `StockLow:${String(e.payload.materialId)}:${dayKey()}` : String(e.id);

  for (const t of templates) {
    const body = renderTemplate(t.body, vars);
    const title = renderTemplate(t.title, vars);
    if (t.audience === "CUSTOMER") {
      if (!customer) continue;
      if (t.channel === "SMS") {
        const key = `${dedupeScope}:SMS:${customer.phone}`;
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
        const link = e.payload.orderId ? `/account/orders/${String(e.payload.orderId)}` : e.payload.quoteId ? `/account/quotes/${String(e.payload.quoteId)}` : "/account";
        await ctx.db
          .insert(notifications)
          .values({ userId: customer.userId, channel: "IN_APP", eventType: e.type, title, body, link, status: "SENT", sentAt: new Date(), dedupeKey: `${dedupeScope}:IN_APP:${customer.userId}`, outboxEventId: e.id })
          .onConflictDoNothing();
      }
    } else if (t.audience === "ROLE" && t.roleCode && t.channel === "IN_APP") {
      const link = e.payload.orderId ? `/panel/orders/${String(e.payload.orderId)}` : e.payload.materialId ? `/panel/warehouse` : e.payload.inquiryId ? `/panel/sales` : null;
      for (const userId of await staffWithRole(ctx, t.roleCode)) {
        await ctx.db
          .insert(notifications)
          .values({ userId, channel: "IN_APP", eventType: e.type, title, body, link, status: "SENT", sentAt: new Date(), dedupeKey: `${dedupeScope}:IN_APP:${userId}:${t.id}`, outboxEventId: e.id })
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
