import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { newToken } from "@/server/auth/tokens";
import type { Ctx } from "@/server/core/context";
import { addCartItem, cartView, findCart, getOrCreateCart, removeCartItem, updateCartItem } from "@/server/modules/orders/cart";
import { checkout } from "@/server/modules/orders/create";
import { startOnlinePayment } from "@/server/modules/finance/service";
import { CART_COOKIE, cookieOptions } from "../cookies";
import { api } from "../router";
import { address, idempotencyKey, note, rial, selections, urgency, uuid } from "./schemas";

const GUEST_TTL = 30 * 86_400_000;

function guestToken(req: NextRequest, ctx: Ctx) {
  if (ctx.actor.kind === "customer") return { token: null, fresh: false };
  const existing = req.cookies.get(CART_COOKIE)?.value;
  return existing ? { token: existing, fresh: false } : { token: newToken(24), fresh: true };
}

function withCartCookie(data: unknown, g: { token: string | null; fresh: boolean }) {
  const res = NextResponse.json({ data });
  if (g.fresh && g.token) res.cookies.set(CART_COOKIE, g.token, cookieOptions(new Date(Date.now() + GUEST_TTL)));
  return res;
}

export async function cartSummary(ctx: Ctx, cart: Awaited<ReturnType<typeof findCart>>) {
  const view = await cartView(ctx, cart);
  return {
    lines: view.lines.map((l) => ({
      id: l.item.id,
      product: l.product,
      quantity: l.item.quantity,
      selections: l.item.selections,
      urgency: l.item.urgency,
      artworkCount: l.item.artworkFileIds.length,
      needsDesign: l.item.needsDesign,
      subtotal: l.price?.subtotal ?? null,
      summary: l.price?.spec.summary ?? [],
      leadDays: l.price?.leadDays ?? null,
      priceChanged: l.priceChanged,
      error: l.error,
    })),
    subtotal: view.subtotal,
    vatPct: view.vatPct,
    count: view.lines.length,
  };
}

const itemBody = z.object({ productId: uuid, quantity: z.number().int().positive().max(1_000_000), selections, urgency, artworkFileIds: z.array(uuid).max(10).optional(), note });

export const cartRoutes = [
  api.get("cart", { auth: "public" }, async ({ ctx, req }) => cartSummary(ctx, await findCart(ctx, req.cookies.get(CART_COOKIE)?.value))),

  api.post("cart/items", { auth: "public", body: itemBody }, async ({ ctx, body, req }) => {
    const g = guestToken(req, ctx);
    const cart = await getOrCreateCart(ctx, g.token);
    const { item } = await addCartItem(ctx, cart, { ...body, note: body.note ?? undefined });
    return withCartCookie({ id: item.id, cart: await cartSummary(ctx, cart) }, g);
  }),

  api.patch(
    "cart/items/:id",
    { auth: "public", body: z.object({ quantity: z.number().int().positive().max(1_000_000).optional(), selections: selections.optional(), urgency: urgency.optional(), artworkFileIds: z.array(uuid).max(10).optional() }) },
    async ({ ctx, body, params, req }) => {
      const cart = await findCart(ctx, req.cookies.get(CART_COOKIE)?.value);
      if (!cart) return cartSummary(ctx, null);
      await updateCartItem(ctx, cart, params.id!, body);
      return cartSummary(ctx, cart);
    },
  ),

  api.delete("cart/items/:id", { auth: "public" }, async ({ ctx, params, req }) => {
    const cart = await findCart(ctx, req.cookies.get(CART_COOKIE)?.value);
    if (cart) await removeCartItem(ctx, cart, params.id!);
    return cartSummary(ctx, cart);
  }),

  api.post(
    "checkout",
    {
      auth: "customer",
      body: z.object({
        deliveryMethodId: uuid,
        addressId: uuid.optional().nullable(),
        address: address.optional().nullable(),
        note,
        expectedTotal: rial,
        idempotencyKey,
        payment: z.enum(["NOW", "LATER"]),
      }),
    },
    async ({ ctx, body }) => {
      const r = await checkout(ctx, { ...body, note: body.note ?? null });
      if (body.payment === "LATER") return { orders: r.orders, redirectUrl: null };
      // One gateway trip per order; the first is paid now, others from the account page.
      const pay = await startOnlinePayment(ctx, r.orders[0]!.id, { idempotencyKey: body.idempotencyKey });
      return { orders: r.orders, redirectUrl: pay.redirectUrl };
    },
  ),
];
