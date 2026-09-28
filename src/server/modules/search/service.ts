import { and, eq, ilike, or, sql } from "drizzle-orm";
import { customers, employees, materials, orders, products, users } from "@/server/db/schema";
import { type Ctx, can, isStaff } from "@/server/core/context";
import { forbidden } from "@/server/core/errors";
import { normalizeFa, normalizePhone, toEnDigits } from "@/lib/persian";

export interface SearchHit {
  kind: "order" | "customer" | "product" | "employee" | "material";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Global panel search. Persian input is normalised (ي/ك, digits) so
 * «۱۰۰۰۱۲»، «علي» and «0912…» all match. Results respect permissions.
 */
export async function globalSearch(ctx: Ctx, raw: string): Promise<SearchHit[]> {
  if (!isStaff(ctx.actor)) throw forbidden();
  const q = normalizeFa(raw).slice(0, 80);
  if (q.length < 2) return [];
  const digits = toEnDigits(q).replace(/\D/g, "");
  const phone = normalizePhone(q);
  const like = `%${q}%`;
  const hits: SearchHit[] = [];

  if (can(ctx, "order.view")) {
    const conds = [ilike(customers.fullName, like), ilike(customers.companyName, like)];
    if (digits.length >= 3 && digits.length <= 7) conds.push(sql`${orders.number}::text LIKE ${digits + "%"}`);
    if (phone) conds.push(eq(customers.phone, phone));
    const rows = await ctx.db
      .select({ id: orders.id, number: orders.number, status: orders.status, name: customers.fullName })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(or(...conds))
      .orderBy(sql`${orders.placedAt} DESC`)
      .limit(6);
    hits.push(...rows.map((r) => ({ kind: "order" as const, id: r.id, title: `سفارش ${r.number}`, subtitle: r.name, href: `/panel/orders/${r.id}` })));
  }
  if (can(ctx, "customer.view")) {
    const conds = [ilike(customers.fullName, like), ilike(customers.companyName, like)];
    if (phone) conds.push(eq(customers.phone, phone));
    else if (digits.length >= 4) conds.push(ilike(customers.phone, `%${digits}%`));
    const rows = await ctx.db.select().from(customers).where(or(...conds)).limit(5);
    hits.push(...rows.map((r) => ({ kind: "customer" as const, id: r.id, title: r.fullName || r.phone, subtitle: [r.companyName, r.phone].filter(Boolean).join(" • "), href: `/panel/customers/${r.id}` })));
  }
  const productRows = await ctx.db.select({ id: products.id, name: products.name, slug: products.slug }).from(products).where(ilike(products.name, like)).limit(4);
  hits.push(...productRows.map((r) => ({ kind: "product" as const, id: r.id, title: r.name, subtitle: "محصول", href: can(ctx, "catalog.manage") ? `/panel/catalog/${r.id}` : `/p/${r.slug}` })));
  if (can(ctx, "employee.view")) {
    const rows = await ctx.db
      .select({ id: employees.id, name: users.fullName, title: employees.title, code: employees.personnelCode })
      .from(employees)
      .innerJoin(users, eq(users.id, employees.userId))
      .where(or(ilike(users.fullName, like), ilike(employees.personnelCode, like), phone ? eq(users.phone, phone) : undefined))
      .limit(4);
    hits.push(...rows.map((r) => ({ kind: "employee" as const, id: r.id, title: r.name, subtitle: [r.title, r.code].filter(Boolean).join(" • "), href: `/panel/employees/${r.id}` })));
  }
  if (can(ctx, "inventory.view")) {
    const rows = await ctx.db.select({ id: materials.id, name: materials.name, sku: materials.sku }).from(materials).where(and(or(ilike(materials.name, like), ilike(materials.sku, `%${q.toUpperCase()}%`)))).limit(5);
    hits.push(...rows.map((r) => ({ kind: "material" as const, id: r.id, title: r.name, subtitle: r.sku, href: `/panel/inventory/${r.id}` })));
  }
  return hits;
}
