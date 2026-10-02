import { and, desc, eq, ilike, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { customers, invoices, orders, payments, users } from "@/server/db/schema";
import { type Ctx, assertCan, assertCanAny } from "@/server/core/context";
import { CUSTOMER_CODE_RE } from "@/lib/order-status";
import { normalizeFa, toEnDigits } from "@/lib/persian";

const balanceSql = sql<number>`(${orders.total} - (${orders.paidAmount} - ${orders.refundedAmount}))::float`;

export type AccountingFilter = "open" | "unpaid" | "unpriced" | "all";

/** Projects/orders with their money: amount, paid, remaining, invoices. */
export async function accountingOrders(ctx: Ctx, f: { filter?: AccountingFilter; q?: string; limit?: number } = {}) {
  assertCanAny(ctx, "payment.view", "invoice.manage");
  const conds: SQL[] = [];
  const filter = f.filter ?? "open";
  if (filter !== "all") conds.push(notInArray(orders.status, ["REJECTED", "CANCELLED"]));
  if (filter === "open") conds.push(or(sql`${balanceSql} > 0`, isNull(orders.pricedAt))!);
  if (filter === "unpaid") conds.push(sql`${balanceSql} > 0`, sql`${orders.pricedAt} IS NOT NULL`);
  if (filter === "unpriced") conds.push(isNull(orders.pricedAt), eq(orders.kind, "CUSTOM"), notInArray(orders.status, ["WAITING_APPROVAL", "NEEDS_INFO"]));
  const q = f.q ? toEnDigits(normalizeFa(f.q.trim())) : "";
  if (q) {
    const code = CUSTOMER_CODE_RE.exec(q);
    conds.push(or(ilike(orders.code, `%${q}%`), ilike(customers.fullName, `%${q}%`), ilike(customers.companyName, `%${q}%`), code ? eq(customers.code, Number(code[1])) : sql`false`)!);
  }
  return ctx.db
    .select({
      id: orders.id,
      code: orders.code,
      title: orders.title,
      kind: orders.kind,
      productionType: orders.productionType,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      total: orders.total,
      pricedAt: orders.pricedAt,
      paid: sql<number>`(${orders.paidAmount} - ${orders.refundedAmount})::float`,
      balance: balanceSql,
      createdAt: orders.createdAt,
      customerId: customers.id,
      customerCode: customers.code,
      customerName: customers.fullName,
      companyName: customers.companyName,
      customerType: customers.type,
      invoiceCount: sql<number>`(select count(*)::int from invoices i where i.order_id = ${orders.id} and i.status = 'ISSUED')`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case when ${orders.status} in ('READY','SHIPPING','DELIVERED') then 0 else 1 end`, desc(orders.createdAt))
    .limit(f.limit ?? 200);
}

export async function paymentLedger(ctx: Ctx, f: { status?: string[]; limit?: number } = {}) {
  assertCan(ctx, "payment.view");
  return ctx.db
    .select({ payment: payments, orderCode: orders.code, orderId: orders.id, customerName: customers.fullName, createdByName: users.fullName })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(users, eq(users.id, payments.createdBy))
    .where(f.status?.length ? inArray(payments.status, f.status as (typeof payments.$inferSelect)["status"][]) : sql`${payments.status} <> 'PENDING'`)
    .orderBy(desc(payments.createdAt))
    .limit(f.limit ?? 100);
}

export async function invoiceList(ctx: Ctx, f: { customerId?: string; orderId?: string; limit?: number } = {}) {
  assertCanAny(ctx, "invoice.manage", "payment.view");
  const conds: SQL[] = [];
  if (f.customerId) conds.push(eq(invoices.customerId, f.customerId));
  if (f.orderId) conds.push(eq(invoices.orderId, f.orderId));
  return ctx.db
    .select({ invoice: invoices, orderCode: orders.code, customerName: customers.fullName, customerCode: customers.code })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(invoices.issuedAt))
    .limit(f.limit ?? 100);
}

export async function accountingSummary(ctx: Ctx) {
  assertCanAny(ctx, "payment.view", "invoice.manage");
  const [row] = await ctx.db
    .select({
      receivable: sql<number>`coalesce(sum(greatest(${balanceSql}, 0)) filter (where ${orders.pricedAt} is not null), 0)::float`,
      unpaidOrders: sql<number>`count(*) filter (where ${balanceSql} > 0 and ${orders.pricedAt} is not null)::int`,
      unpriced: sql<number>`count(*) filter (where ${orders.pricedAt} is null and ${orders.kind} = 'CUSTOM' and ${orders.status} not in ('WAITING_APPROVAL','NEEDS_INFO'))::int`,
    })
    .from(orders)
    .where(notInArray(orders.status, ["REJECTED", "CANCELLED"]));
  const [p] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.status, "AWAITING_APPROVAL"));
  return { ...row!, paymentsToConfirm: p!.n };
}
