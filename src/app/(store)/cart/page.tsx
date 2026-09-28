import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CartView } from "@/components/store/cart-view";
import { CART_COOKIE } from "@/server/http/cookies";
import { cartSummary } from "@/server/http/api/cart";
import { storefrontCtx } from "@/server/http/session";
import { findCart } from "@/server/modules/orders/cart";

export const metadata: Metadata = { title: "سبد خرید" };

export default async function CartPage() {
  const ctx = await storefrontCtx();
  const cart = await findCart(ctx, (await cookies()).get(CART_COOKIE)?.value);
  const summary = await cartSummary(ctx, cart);
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <h1 className="text-[28px] font-bold">سبد خرید</h1>
      <CartView initial={summary} loggedIn={ctx.actor.kind === "customer"} />
    </div>
  );
}
