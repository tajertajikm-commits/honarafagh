import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/panel/page";
import { OrderBuilder } from "@/components/panel/order-builder";
import { customers, deliveryMethods, inquiries, workflowTemplates } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { builderProducts } from "@/server/modules/catalog/queries";
import { getSetting } from "@/server/modules/settings/service";
import { toFaDigits } from "@/lib/persian";

export const metadata: Metadata = { title: "ثبت سفارش یا پیش‌فاکتور" };

export default async function NewSalePage({ searchParams }: { searchParams: Promise<{ mode?: string; customer?: string; inquiry?: string }> }) {
  const sp = await searchParams;
  const mode = sp.mode === "quote" ? "quote" : "order";
  const ctx = await requireStaffPage({ permission: mode === "quote" ? "quote.manage" : "order.create" });
  const products = await builderProducts(ctx.db);
  const methods = await ctx.db.select().from(deliveryMethods).where(eq(deliveryMethods.isActive, true)).orderBy(asc(deliveryMethods.sortOrder));
  const workflows = await ctx.db.select({ code: workflowTemplates.code, name: workflowTemplates.name }).from(workflowTemplates).where(eq(workflowTemplates.status, "ACTIVE")).orderBy(asc(workflowTemplates.name));
  const inquiry = sp.inquiry ? ((await ctx.db.select().from(inquiries).where(eq(inquiries.id, sp.inquiry)))[0] ?? null) : null;
  const customerId = inquiry?.customerId ?? sp.customer;
  const customer = customerId ? ((await ctx.db.select().from(customers).where(and(eq(customers.id, customerId))))[0] ?? null) : null;
  const orders = await getSetting(ctx.db, "orders");
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/sales", label: "فروش" }]}
        title={mode === "quote" ? "پیش‌فاکتور جدید" : "ثبت سفارش دستی"}
        description={inquiry ? `بر اساس استعلام ${toFaDigits(inquiry.number)}: ${inquiry.title}` : mode === "quote" ? "قیمت‌ها با نسخه فعلی قیمت‌گذاری محاسبه و در پیش‌فاکتور ثابت می‌شوند." : "سفارش تلفنی یا حضوری؛ قیمت با همان موتور قیمت‌گذاری فروشگاه محاسبه می‌شود."}
      />
      <OrderBuilder
        mode={mode}
        products={products}
        deliveryMethods={methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, baseFee: m.baseFee }))}
        workflows={workflows}
        perms={[...ctx.actor.permissions]}
        initialCustomer={customer ? { id: customer.id, fullName: customer.fullName, companyName: customer.companyName, phone: customer.phone, discountPct: customer.discountPct } : null}
        inquiryId={inquiry?.id ?? null}
        initialLine={inquiry ? { productId: inquiry.productId, quantity: inquiry.quantity, selections: inquiry.selections, title: inquiry.productId ? undefined : inquiry.title } : null}
        defaultValidDays={orders.quoteValidityDays}
      />
    </>
  );
}
