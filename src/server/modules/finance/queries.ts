import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { customers, orders, payments, users } from "@/server/db/schema";
import { type Ctx, assertCan } from "@/server/core/context";

const balanceSql = sql<number>`(${orders.total} - (${orders.paidAmount} - ${orders.refundedAmount}))::float`;

/**
 * Orders with an outstanding balance. Orders that are ready for handover come
 * first because the balance usually blocks release of the goods.
 */
export async function receivables(ctx: Ctx) {
  assertCan(ctx, "payment.view");
  return ctx.db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      deliveryStatus: orders.deliveryStatus,
      total: orders.total,
      paid: sql<number>`(${orders.paidAmount} - ${orders.refundedAmount})::float`,
      balance: balanceSql,
      placedAt: orders.placedAt,
      readyAt: orders.readyAt,
      dueDate: orders.dueDate,
      customerId: customers.id,
      customerName: customers.fullName,
      companyName: customers.companyName,
      customerPhone: users.phone,
      creditLimit: customers.creditLimit,
      pendingApproval: sql<number>`coalesce((select sum(p.amount) from payments p where p.order_id = ${orders.id} and p.kind = 'PAYMENT' and p.status = 'AWAITING_APPROVAL'), 0)::float`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .where(and(ne(orders.status, "CANCELLED"), ne(orders.status, "PENDING_REVIEW"), sql`${balanceSql} > 0`))
    .orderBy(sql`case when ${orders.status} = 'READY' then 0 when ${orders.status} = 'COMPLETED' then 1 else 2 end`, orders.placedAt);
}

/** Orders where the customer paid more than the (possibly cancelled) order is worth. */
export async function refundsDue(ctx: Ctx) {
  assertCan(ctx, "payment.view");
  const effectiveTotal = sql<number>`(case when ${orders.status} = 'CANCELLED' then 0 else ${orders.total} end)`;
  return ctx.db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      total: orders.total,
      paid: sql<number>`(${orders.paidAmount} - ${orders.refundedAmount})::float`,
      excess: sql<number>`((${orders.paidAmount} - ${orders.refundedAmount}) - ${effectiveTotal})::float`,
      customerName: customers.fullName,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(sql`(${orders.paidAmount} - ${orders.refundedAmount}) > ${effectiveTotal}`)
    .orderBy(desc(orders.updatedAt));
}

export async function paymentLedger(ctx: Ctx, f: { status?: string[]; method?: string; since?: Date; limit?: number } = {}) {
  assertCan(ctx, "payment.view");
  const conds = [ne(payments.status, "PENDING")];
  if (f.status?.length) conds.push(inArray(payments.status, f.status as never));
  if (f.method) conds.push(eq(payments.method, f.method as never));
  if (f.since) conds.push(gte(payments.createdAt, f.since));
  return ctx.db
    .select({ payment: payments, orderNumber: orders.number, customerName: customers.fullName, createdBy: users.fullName })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(users, eq(users.id, payments.createdBy))
    .where(and(...conds))
    .orderBy(desc(payments.createdAt))
    .limit(f.limit ?? 100);
}

/** Headline figures for the accounting workspace (all amounts in rial). */
export async function financeSummary(ctx: Ctx, now = new Date()) {
  assertCan(ctx, "payment.view");
  // Day / month boundaries in Tehran time (UTC+03:30, no DST since 1401).
  const tehran = new Date(now.getTime() + 210 * 60_000);
  const dayStart = new Date(Date.UTC(tehran.getUTCFullYear(), tehran.getUTCMonth(), tehran.getUTCDate()) - 210 * 60_000);
  const last30 = new Date(now.getTime() - 30 * 86_400_000);
  const [row] = await ctx.db
    .select({
      today: sql<number>`coalesce(sum(case when ${payments.kind} = 'PAYMENT' and ${payments.confirmedAt} >= ${dayStart} then ${payments.amount} end), 0)::float`,
      last30: sql<number>`coalesce(sum(case when ${payments.kind} = 'PAYMENT' and ${payments.confirmedAt} >= ${last30} then ${payments.amount} end), 0)::float`,
      refunds30: sql<number>`coalesce(sum(case when ${payments.kind} = 'REFUND' and ${payments.confirmedAt} >= ${last30} then ${payments.amount} end), 0)::float`,
    })
    .from(payments)
    .where(eq(payments.status, "CONFIRMED"));
  const [pending] = await ctx.db
    .select({ count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${payments.amount}), 0)::float` })
    .from(payments)
    .where(eq(payments.status, "AWAITING_APPROVAL"));
  const [outstanding] = await ctx.db
    .select({ amount: sql<number>`coalesce(sum(${balanceSql}), 0)::float`, count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(ne(orders.status, "CANCELLED"), ne(orders.status, "PENDING_REVIEW"), sql`${balanceSql} > 0`));
  const byMethod = await ctx.db
    .select({ method: payments.method, amount: sql<number>`sum(${payments.amount})::float` })
    .from(payments)
    .where(and(eq(payments.status, "CONFIRMED"), eq(payments.kind, "PAYMENT"), gte(payments.confirmedAt, last30)))
    .groupBy(payments.method);
  return { ...row!, pendingCount: pending!.count, pendingAmount: pending!.amount, outstanding: outstanding!.amount, outstandingCount: outstanding!.count, byMethod };
}
