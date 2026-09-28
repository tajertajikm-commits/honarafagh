import type { Executor } from "@/server/db/client";
import { priceProduct } from "@/server/modules/pricing/service";

const cache = new Map<string, { at: number; value: number | null }>();
const TTL = 5 * 60_000;

/** "From X toman" price at the product's first preset with default options (cached briefly). */
export async function startingPrice(db: Executor, product: { id: string; minQuantity: number; quantityPresets: number[] }): Promise<{ quantity: number; subtotal: number } | null> {
  const quantity = product.quantityPresets[0] ?? product.minQuantity;
  const key = `${product.id}:${quantity}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value == null ? null : { quantity, subtotal: hit.value };
  try {
    const p = await priceProduct(db, { productId: product.id, quantity, selections: {}, urgency: "STANDARD" });
    cache.set(key, { at: Date.now(), value: p.subtotal });
    return { quantity, subtotal: p.subtotal };
  } catch {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
}
