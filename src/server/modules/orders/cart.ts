import { and, asc, eq, inArray } from "drizzle-orm";
import { cartItems, carts, fileObjects, products } from "@/server/db/schema";
import { type Ctx, actorUserId, inTx } from "@/server/core/context";
import { AppError, forbidden, notFound, validation } from "@/server/core/errors";
import { sha256 } from "@/server/auth/tokens";
import { priceProduct } from "@/server/modules/pricing/service";
import type { PriceBreakdown, Selections, UrgencyLevel } from "@/server/modules/pricing/types";

export type Cart = typeof carts.$inferSelect;
const MAX_ITEMS = 30;

/** Customers have one cart; guests are identified by an opaque cookie token. */
export async function findCart(ctx: Ctx, guestToken?: string | null): Promise<Cart | null> {
  if (ctx.actor.kind === "customer") {
    const [c] = await ctx.db.select().from(carts).where(eq(carts.customerId, ctx.actor.customerId));
    return c ?? null;
  }
  if (!guestToken) return null;
  const [c] = await ctx.db.select().from(carts).where(eq(carts.tokenHash, sha256(guestToken)));
  return c ?? null;
}

export async function getOrCreateCart(ctx: Ctx, guestToken?: string | null): Promise<Cart> {
  const existing = await findCart(ctx, guestToken);
  if (existing) return existing;
  if (ctx.actor.kind === "customer") {
    const [c] = await ctx.db.insert(carts).values({ customerId: ctx.actor.customerId }).onConflictDoNothing().returning();
    return c ?? (await findCart(ctx))!;
  }
  if (!guestToken) throw new AppError("VALIDATION", "سبد خرید پیدا نشد.");
  const [c] = await ctx.db.insert(carts).values({ tokenHash: sha256(guestToken) }).onConflictDoNothing().returning();
  return c ?? (await findCart(ctx, guestToken))!;
}

async function assertOwnFiles(ctx: Ctx, fileIds: string[]) {
  if (fileIds.length === 0) return;
  const rows = await ctx.db.select({ id: fileObjects.id, uploadedBy: fileObjects.uploadedBy, purpose: fileObjects.purpose }).from(fileObjects).where(inArray(fileObjects.id, fileIds));
  const me = actorUserId(ctx);
  if (!me || rows.length !== fileIds.length || rows.some((r) => r.purpose !== "ARTWORK" || r.uploadedBy !== me)) {
    throw forbidden("فایل انتخاب‌شده معتبر نیست.");
  }
}

export interface CartItemInput {
  productId: string;
  quantity: number;
  selections: Selections;
  urgency: UrgencyLevel;
  artworkFileIds?: string[];
  note?: string;
}

export async function addCartItem(ctx: Ctx, cart: Cart, input: CartItemInput) {
  const price = await priceProduct(ctx.db, { ...input, customerId: cart.customerId });
  await assertOwnFiles(ctx, input.artworkFileIds ?? []);
  return inTx(ctx, async (tx) => {
    const existing = await tx.db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cartId, cart.id));
    if (existing.length >= MAX_ITEMS) throw validation("تعداد اقلام سبد به حداکثر رسیده است.");
    const [row] = await tx.db
      .insert(cartItems)
      .values({
        cartId: cart.id,
        productId: input.productId,
        quantity: input.quantity,
        selections: input.selections,
        urgency: input.urgency,
        quotedSubtotal: price.subtotal,
        pricingVersionId: price.ruleVersionId,
        artworkFileIds: input.artworkFileIds ?? [],
        needsDesign: price.flags.includes("NEEDS_DESIGN"),
        note: input.note ?? null,
      })
      .returning();
    return { item: row!, price };
  });
}

export async function updateCartItem(ctx: Ctx, cart: Cart, itemId: string, input: Partial<Pick<CartItemInput, "quantity" | "selections" | "urgency" | "artworkFileIds" | "note">>) {
  const [item] = await ctx.db.select().from(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  if (!item) throw notFound("قلم سبد");
  const next = { quantity: input.quantity ?? item.quantity, selections: input.selections ?? item.selections, urgency: input.urgency ?? item.urgency };
  const price = await priceProduct(ctx.db, { productId: item.productId, ...next, customerId: cart.customerId });
  if (input.artworkFileIds) await assertOwnFiles(ctx, input.artworkFileIds);
  const [row] = await ctx.db
    .update(cartItems)
    .set({ ...next, quotedSubtotal: price.subtotal, pricingVersionId: price.ruleVersionId, needsDesign: price.flags.includes("NEEDS_DESIGN"), artworkFileIds: input.artworkFileIds ?? item.artworkFileIds, note: input.note ?? item.note })
    .where(eq(cartItems.id, itemId))
    .returning();
  return { item: row!, price };
}

export async function removeCartItem(ctx: Ctx, cart: Cart, itemId: string) {
  await ctx.db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
}

export interface CartLine {
  item: typeof cartItems.$inferSelect;
  product: { id: string; name: string; slug: string; unitLabel: string };
  price: PriceBreakdown | null;
  error: string | null;
  priceChanged: boolean;
}

/** Re-prices every line against the current rules; the customer sees price changes before paying. */
export async function cartView(ctx: Ctx, cart: Cart | null): Promise<{ lines: CartLine[]; subtotal: number; vatPct: number }> {
  if (!cart) return { lines: [], subtotal: 0, vatPct: 10 };
  const rows = await ctx.db
    .select({ item: cartItems, product: { id: products.id, name: products.name, slug: products.slug, unitLabel: products.unitLabel, isActive: products.isActive } })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt));
  const lines: CartLine[] = [];
  for (const r of rows) {
    try {
      if (!r.product.isActive) throw new AppError("INVALID_STATE", "این محصول دیگر فروخته نمی‌شود.");
      const price = await priceProduct(ctx.db, { productId: r.item.productId, quantity: r.item.quantity, selections: r.item.selections, urgency: r.item.urgency, customerId: cart.customerId });
      lines.push({ item: r.item, product: r.product, price, error: null, priceChanged: price.subtotal !== r.item.quotedSubtotal });
    } catch (err) {
      lines.push({ item: r.item, product: r.product, price: null, error: err instanceof AppError ? err.message : "محاسبه قیمت ممکن نشد.", priceChanged: false });
    }
  }
  const priced = lines.filter((l) => l.price);
  return {
    lines,
    subtotal: priced.reduce((s, l) => s + l.price!.subtotal, 0),
    vatPct: priced[0]?.price?.vatPct ?? 10,
  };
}

/** Moves a guest cart's items into the customer's cart after login. */
export async function mergeGuestCart(ctx: Ctx, guestToken: string) {
  if (ctx.actor.kind !== "customer") return;
  const [guest] = await ctx.db.select().from(carts).where(eq(carts.tokenHash, sha256(guestToken)));
  if (!guest) return;
  const target = await getOrCreateCart(ctx);
  await ctx.db.update(cartItems).set({ cartId: target.id }).where(eq(cartItems.cartId, guest.id));
  await ctx.db.delete(carts).where(eq(carts.id, guest.id));
}
