import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { customers, entityFiles, fileObjects, inquiries, orders, products, quoteItems, quotes, users } from "@/server/db/schema";
import { type Ctx, assertCan } from "@/server/core/context";
import { notFound } from "@/server/core/errors";

export async function listInquiries(ctx: Ctx, f: { status?: ("NEW" | "IN_REVIEW" | "QUOTED" | "CLOSED" | "REJECTED")[] } = {}) {
  assertCan(ctx, "quote.view");
  return ctx.db
    .select({ inquiry: inquiries, customerName: customers.fullName, companyName: customers.companyName, customerPhone: customers.phone, productName: products.name, assignee: users.fullName })
    .from(inquiries)
    .innerJoin(customers, eq(customers.id, inquiries.customerId))
    .leftJoin(products, eq(products.id, inquiries.productId))
    .leftJoin(users, eq(users.id, inquiries.assignedTo))
    .where(f.status?.length ? inArray(inquiries.status, f.status) : undefined)
    .orderBy(desc(inquiries.createdAt))
    .limit(200);
}

export async function listQuotes(ctx: Ctx, f: { status?: ("DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED" | "CONVERTED")[] } = {}) {
  assertCan(ctx, "quote.view");
  return ctx.db
    .select({ quote: quotes, customerName: customers.fullName, companyName: customers.companyName, createdBy: users.fullName, orderNumber: orders.number })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .leftJoin(users, eq(users.id, quotes.createdBy))
    .leftJoin(orders, eq(orders.id, quotes.convertedOrderId))
    .where(f.status?.length ? inArray(quotes.status, f.status) : undefined)
    .orderBy(desc(quotes.createdAt))
    .limit(200);
}

export async function quoteDetail(ctx: Ctx, id: string) {
  assertCan(ctx, "quote.view");
  const [row] = await ctx.db
    .select({ quote: quotes, customer: customers, createdBy: users.fullName, orderNumber: orders.number })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .leftJoin(users, eq(users.id, quotes.createdBy))
    .leftJoin(orders, eq(orders.id, quotes.convertedOrderId))
    .where(eq(quotes.id, id));
  if (!row) throw notFound("پیش‌فاکتور");
  const items = await ctx.db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.sortOrder));
  const inquiry = row.quote.inquiryId ? (await ctx.db.select().from(inquiries).where(eq(inquiries.id, row.quote.inquiryId)))[0] ?? null : null;
  return { ...row, items, inquiry };
}

export async function inquiryDetail(ctx: Ctx, id: string) {
  assertCan(ctx, "quote.view");
  const [row] = await ctx.db
    .select({ inquiry: inquiries, customer: customers, productName: products.name })
    .from(inquiries)
    .innerJoin(customers, eq(customers.id, inquiries.customerId))
    .leftJoin(products, eq(products.id, inquiries.productId))
    .where(eq(inquiries.id, id));
  if (!row) throw notFound("استعلام");
  const files = await ctx.db
    .select({ id: fileObjects.id, originalName: fileObjects.originalName, sizeBytes: fileObjects.sizeBytes, mimeType: fileObjects.mimeType })
    .from(entityFiles)
    .innerJoin(fileObjects, eq(fileObjects.id, entityFiles.fileId))
    .where(and(eq(entityFiles.entityType, "inquiry"), eq(entityFiles.entityId, id)));
  const relatedQuotes = await ctx.db.select().from(quotes).where(eq(quotes.inquiryId, id)).orderBy(desc(quotes.createdAt));
  return { ...row, files, quotes: relatedQuotes };
}
