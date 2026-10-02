import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { CheckoutForm } from "@/components/store/checkout-form";
import { addresses, customers, deliveryMethods } from "@/server/db/schema";
import { cartSummary } from "@/server/http/api/cart";
import { requireCustomerPage } from "@/server/http/session";
import { findCart } from "@/server/modules/orders/cart";

export const metadata: Metadata = { title: "ثبت سفارش" };

export default async function CheckoutPage() {
  const ctx = await requireCustomerPage("/checkout");
  const cart = await findCart(ctx);
  const summary = await cartSummary(ctx, cart);
  if (summary.lines.length === 0) redirect("/cart");
  const methods = await ctx.db.select().from(deliveryMethods).where(eq(deliveryMethods.isActive, true)).orderBy(asc(deliveryMethods.sortOrder));
  const addrs = await ctx.db.select().from(addresses).where(eq(addresses.customerId, ctx.actor.customerId));
  const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, ctx.actor.customerId));
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <h1 className="text-[28px] font-bold">ثبت سفارش</h1>
      <CheckoutForm
        cart={summary}
        methods={methods.map((m) => ({ id: m.id, name: m.name, description: m.description, method: m.method, fee: m.baseFee }))}
        addresses={addrs.map((a) => ({ id: a.id, title: a.title, line: `${a.city}، ${a.line}`, recipientName: a.recipientName, isDefault: a.isDefault }))}
        customer={{ name: customer?.fullName ?? "", phone: customer?.phone ?? "" }}
      />
    </div>
  );
}
