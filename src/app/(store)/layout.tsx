import { cookies } from "next/headers";
import { StoreFooter } from "@/components/store/footer";
import { StoreHeader } from "@/components/store/header";
import { CART_COOKIE } from "@/server/http/cookies";
import { storefrontCtx } from "@/server/http/session";
import { findCart } from "@/server/modules/orders/cart";
import { getSetting } from "@/server/modules/settings/service";
import { cartItems } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const ctx = await storefrontCtx();
  const cart = await findCart(ctx, (await cookies()).get(CART_COOKIE)?.value);
  const count = cart ? ((await ctx.db.select({ n: sql<number>`count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cart.id)))[0]?.n ?? 0) : 0;
  const business = await getSetting(ctx.db, "business");
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <StoreHeader cartCount={count} customerName={ctx.actor.kind === "customer" ? ctx.actor.name : null} />
      <main className="flex-1">{children}</main>
      <StoreFooter business={business} />
    </div>
  );
}
