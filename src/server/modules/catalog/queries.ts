import { and, asc, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  productCategories,
  productImages,
  productMethods,
  productOptionGroups,
  productOptionValues,
  products,
} from "@/server/db/schema";
import { notFound } from "@/server/core/errors";
import { type EngineProduct, productSpecSchema } from "@/server/modules/pricing/types";

export type ProductRow = typeof products.$inferSelect;

export interface ProductDetail {
  product: ProductRow;
  category: typeof productCategories.$inferSelect | null;
  images: (typeof productImages.$inferSelect)[];
  methods: (typeof productMethods.$inferSelect)[];
  groups: ((typeof productOptionGroups.$inferSelect) & { values: (typeof productOptionValues.$inferSelect)[] })[];
}

export async function loadProductDetail(db: Executor, by: { id: string } | { slug: string }, opts: { includeInactive?: boolean } = {}): Promise<ProductDetail> {
  const [row] = await db
    .select()
    .from(products)
    .where("id" in by ? eq(products.id, by.id) : eq(products.slug, by.slug))
    .limit(1);
  if (!row || (!opts.includeInactive && !row.isActive)) throw notFound("محصول");
  // Sequential on purpose: `db` may be a transaction client, which cannot run queries in parallel.
  const category = row.categoryId ? ((await db.select().from(productCategories).where(eq(productCategories.id, row.categoryId)))[0] ?? null) : null;
  const images = await db.select().from(productImages).where(eq(productImages.productId, row.id)).orderBy(asc(productImages.sortOrder));
  const methods = await db.select().from(productMethods).where(eq(productMethods.productId, row.id)).orderBy(asc(productMethods.sortOrder));
  const groups = await db
    .select()
    .from(productOptionGroups)
    .where(opts.includeInactive ? eq(productOptionGroups.productId, row.id) : and(eq(productOptionGroups.productId, row.id), eq(productOptionGroups.isActive, true)))
    .orderBy(asc(productOptionGroups.sortOrder));
  const values = groups.length
    ? await db
        .select()
        .from(productOptionValues)
        .where(
          opts.includeInactive
            ? inArray(productOptionValues.groupId, groups.map((g) => g.id))
            : and(inArray(productOptionValues.groupId, groups.map((g) => g.id)), eq(productOptionValues.isActive, true)),
        )
        .orderBy(asc(productOptionValues.sortOrder))
    : [];
  return {
    product: row,
    category,
    images,
    methods,
    groups: groups.map((g) => ({ ...g, values: values.filter((v) => v.groupId === g.id) })),
  };
}

export function toEngineProduct(d: ProductDetail): EngineProduct {
  return {
    id: d.product.id,
    name: d.product.name,
    spec: productSpecSchema.parse(d.product.spec),
    minQuantity: d.product.minQuantity,
    maxQuantity: d.product.maxQuantity,
    methods: d.methods.map((m) => ({ methodCode: m.methodCode, minQuantity: m.minQuantity, maxQuantity: m.maxQuantity, sortOrder: m.sortOrder })),
    groups: d.groups.map((g) => ({
      id: g.id,
      key: g.key,
      label: g.label,
      type: g.type,
      required: g.required,
      config: g.config ?? null,
      values: g.values.map((v) => ({ id: v.id, key: v.key, label: v.label, isDefault: v.isDefault, effects: v.effects })),
    })),
  };
}

export async function listCategories(db: Executor) {
  return db.select().from(productCategories).where(eq(productCategories.isActive, true)).orderBy(asc(productCategories.sortOrder));
}

export async function listProducts(db: Executor, opts: { categoryId?: string; featured?: boolean; includeInactive?: boolean } = {}) {
  const conds = [];
  if (!opts.includeInactive) conds.push(eq(products.isActive, true));
  if (opts.categoryId) conds.push(eq(products.categoryId, opts.categoryId));
  if (opts.featured) conds.push(eq(products.isFeatured, true));
  const rows = await db
    .select({ product: products, category: productCategories })
    .from(products)
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(products.sortOrder), asc(products.name));
  const ids = rows.map((r) => r.product.id);
  const images = ids.length ? await db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder)) : [];
  return rows.map((r) => ({ ...r.product, category: r.category, image: images.find((i) => i.productId === r.product.id) ?? null }));
}

/** Active products with option groups, shaped for the staff order/quote builder. */
export async function builderProducts(db: Executor) {
  const list = await listProducts(db);
  const out = [];
  for (const p of list) {
    const d = await loadProductDetail(db, { id: p.id });
    out.push({
      id: d.product.id,
      name: d.product.name,
      unitLabel: d.product.unitLabel,
      minQuantity: d.product.minQuantity,
      maxQuantity: d.product.maxQuantity,
      quantityPresets: d.product.quantityPresets,
      groups: d.groups.map((g) => ({
        key: g.key,
        label: g.label,
        type: g.type,
        required: g.required,
        config: g.config ?? null,
        values: g.values.map((v) => ({ key: v.key, label: v.label, isDefault: v.isDefault, customTrim: !!v.effects.customTrim })),
      })),
    });
  }
  return out;
}
