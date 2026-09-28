import { z } from "zod";
import { listCategories, listProducts, loadProductDetail } from "@/server/modules/catalog/queries";
import { priceProduct } from "@/server/modules/pricing/service";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { AppError } from "@/server/core/errors";
import { api } from "../router";
import { selections, urgency, uuid } from "./schemas";

/** Public price view: no costs, margins or internal breakdown. */
function publicPrice(p: Awaited<ReturnType<typeof priceProduct>>) {
  return {
    subtotal: p.subtotal,
    vatPct: p.vatPct,
    vatAmount: p.vatAmount,
    total: p.total,
    unitPrice: p.unitPrice,
    discountAmount: p.discountAmount,
    urgencyAmount: p.urgencyAmount,
    leadDays: p.leadDays,
    method: p.method,
    summary: p.spec.summary,
    ruleVersionId: p.ruleVersionId,
  };
}

export const catalogRoutes = [
  api.get("catalog/categories", { auth: "public" }, async ({ ctx }) => listCategories(ctx.db)),
  api.get("catalog/products", { auth: "public", query: z.object({ categoryId: uuid.optional(), featured: z.enum(["1", "0"]).optional() }) }, async ({ ctx, query }) =>
    (await listProducts(ctx.db, { categoryId: query.categoryId, featured: query.featured === "1" })).map((p) => ({ id: p.id, slug: p.slug, name: p.name, subtitle: p.subtitle, category: p.category?.name ?? null, image: p.image?.url ?? null, unitLabel: p.unitLabel })),
  ),
  api.get("catalog/products/by-slug/:slug", { auth: "public" }, async ({ ctx, params }) => {
    const d = await loadProductDetail(ctx.db, { slug: params.slug! });
    return {
      id: d.product.id,
      slug: d.product.slug,
      name: d.product.name,
      description: d.product.description,
      unitLabel: d.product.unitLabel,
      minQuantity: d.product.minQuantity,
      maxQuantity: d.product.maxQuantity,
      quantityStep: d.product.quantityStep,
      quantityPresets: d.product.quantityPresets,
      groups: d.groups.map((g) => ({ key: g.key, label: g.label, helpText: g.helpText, type: g.type, required: g.required, config: g.config, values: g.values.map((v) => ({ key: v.key, label: v.label, description: v.description, isDefault: v.isDefault })) })),
    };
  }),

  api.post(
    "pricing/quote",
    { auth: "public", body: z.object({ productId: uuid, quantity: z.number().int().positive().max(1_000_000), selections, urgency }) },
    async ({ ctx, body }) => {
      if (ctx.ip) await enforceRateLimit(ctx.db, `price:${ctx.ip}`, 240, 60);
      const customerId = ctx.actor.kind === "customer" ? ctx.actor.customerId : null;
      try {
        return publicPrice(await priceProduct(ctx.db, { ...body, customerId }));
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError("VALIDATION", "محاسبه قیمت برای این ترکیب ممکن نیست.");
      }
    },
  ),
];
