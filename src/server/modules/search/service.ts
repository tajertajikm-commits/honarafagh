import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { customers, orders } from "@/server/db/schema";
import { type Ctx, can, isStaff } from "@/server/core/context";
import { forbidden } from "@/server/core/errors";
import { worksOnType } from "@/server/modules/orders/state";
import { CUSTOMER_CODE_RE, customerCodeLabel, ORDER_CODE_RE } from "@/lib/order-status";
import { normalizeFa, normalizePhone, toEnDigits } from "@/lib/persian";

export interface SearchHit {
  kind: "order" | "customer";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Panel search by order code (O-1042-0019), customer code (CUS-1042), name,
 * company or phone. An exact code jumps straight to the record.
 */
export async function globalSearch(ctx: Ctx, raw: string): Promise<SearchHit[]> {
  if (!isStaff(ctx.actor)) throw forbidden();
  const q = toEnDigits(normalizeFa(raw)).trim().slice(0, 80);
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  const types = (["DIGITAL", "OFFSET"] as const).filter((t) => worksOnType(ctx, t));
  const seeOrders = types.length > 0 || can(ctx, "payment.view") || can(ctx, "invoice.manage");
  const phone = normalizePhone(q);
  const customerCode = CUSTOMER_CODE_RE.exec(q);
  const like = `%${q}%`;

  if (seeOrders) {
    const conds: SQL[] = [ilike(orders.code, `%${q.toUpperCase()}%`), ilike(orders.title, like), ilike(customers.fullName, like), ilike(customers.companyName, like)];
    if (phone) conds.push(eq(customers.phone, phone));
    if (customerCode) conds.push(eq(customers.code, Number(customerCode[1])));
    const scope = can(ctx, "payment.view") || can(ctx, "invoice.manage") || can(ctx, "order.view") ? undefined : inArray(orders.productionType, types);
    const rows = await ctx.db
      .select({ id: orders.id, code: orders.code, title: orders.title, name: customers.fullName })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(and(or(...conds), scope))
      .orderBy(ORDER_CODE_RE.test(q) ? sql`${orders.code} = ${q.toUpperCase()} desc` : desc(orders.createdAt), desc(orders.createdAt))
      .limit(8);
    hits.push(...rows.map((r) => ({ kind: "order" as const, id: r.id, title: r.code, subtitle: `${r.title} • ${r.name}`, href: `/panel/orders/${r.code}` })));
  }
  if (can(ctx, "customer.view")) {
    const conds: SQL[] = [ilike(customers.fullName, like), ilike(customers.companyName, like)];
    if (phone) conds.push(eq(customers.phone, phone));
    if (customerCode) conds.push(eq(customers.code, Number(customerCode[1])));
    const rows = await ctx.db.select().from(customers).where(or(...conds)).limit(5);
    hits.push(...rows.map((r) => ({ kind: "customer" as const, id: r.id, title: `${customerCodeLabel(r.code)} — ${r.fullName || r.phone}`, subtitle: [r.companyName, r.phone].filter(Boolean).join(" • "), href: `/panel/customers/${customerCodeLabel(r.code)}` })));
  }
  return hits;
}
