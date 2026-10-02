import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  productCategories,
  productImages,
  productMethods,
  productOptionGroups,
  productOptionValues,
  products,
} from "@/server/db/schema";
import { type Ctx, assertCan, inTx } from "@/server/core/context";
import { conflict, isUniqueViolation, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { numberConfigSchema, optionEffectsSchema, productSpecSchema } from "@/server/modules/pricing/types";

const slug = z.string().regex(/^[a-z0-9-]{2,80}$/, "نامک فقط حروف کوچک لاتین، عدد و خط تیره");

export const productDefinitionSchema = z.object({
  slug,
  name: z.string().min(2),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable(),
  pricingRuleSetId: z.string().uuid(),
  spec: productSpecSchema,
  unitLabel: z.string().min(1),
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().nullable(),
  quantityStep: z.number().int().min(1),
  quantityPresets: z.array(z.number().int().positive()).max(8),
  requiresArtwork: z.boolean(),
  offersDesignService: z.boolean(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  highlights: z.array(z.string()).max(6),
  /** Site-relative path or https URL only (never javascript:, data: …). */
  imageUrl: z.string().max(500).regex(/^(\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/, "آدرس تصویر باید مسیر داخلی یا https باشد.").nullable().optional(),
  methods: z
    .array(z.object({ methodCode: z.enum(["DIGITAL", "OFFSET"]), minQuantity: z.number().int().min(1), maxQuantity: z.number().int().nullable() }))
    .min(1),
  groups: z.array(
    z.object({
      key: z.string().regex(/^[a-z0-9_]{1,40}$/),
      label: z.string().min(1),
      helpText: z.string().nullable().optional(),
      type: z.enum(["SELECT", "NUMBER", "TOGGLE"]),
      required: z.boolean(),
      config: numberConfigSchema.partial().nullable().optional(),
      isActive: z.boolean().default(true),
      values: z.array(
        z.object({
          key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
          label: z.string().min(1),
          description: z.string().nullable().optional(),
          effects: optionEffectsSchema,
          isDefault: z.boolean().default(false),
          isActive: z.boolean().default(true),
        }),
      ),
    }),
  ),
});
export type ProductDefinition = z.infer<typeof productDefinitionSchema>;

/**
 * Saves a complete product definition (basic info, methods, options) in one
 * transaction. Existing orders are unaffected: they carry price snapshots.
 */
export async function saveProduct(ctx: Ctx, productId: string | null, raw: unknown) {
  assertCan(ctx, "catalog.manage");
  const parsed = productDefinitionSchema.safeParse(raw);
  if (!parsed.success) throw validation("تعریف محصول نامعتبر است.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const d = parsed.data;
  const componentKeys = new Set(d.spec.components.map((c) => c.key));
  for (const g of d.groups) {
    if (g.type === "SELECT" && g.values.length === 0) throw validation(`گروه «${g.label}» گزینه ندارد.`);
    if (g.values.filter((v) => v.isDefault).length > 1) throw validation(`گروه «${g.label}» بیش از یک پیش‌فرض دارد.`);
    for (const v of g.values) {
      const refs = [v.effects.material?.component, v.effects.colors?.component, ...(v.effects.operations ?? []).map((o) => o.component)].filter(Boolean) as string[];
      const unknown = refs.find((r) => !componentKeys.has(r));
      if (unknown) throw validation(`گزینه «${v.label}» به بخش ناشناخته «${unknown}» اشاره دارد.`);
    }
  }
  return inTx(ctx, async (tx) => {
    const base = {
      slug: d.slug,
      name: d.name,
      subtitle: d.subtitle ?? null,
      description: d.description ?? null,
      categoryId: d.categoryId,
      pricingRuleSetId: d.pricingRuleSetId,
      spec: d.spec,
      unitLabel: d.unitLabel,
      minQuantity: d.minQuantity,
      maxQuantity: d.maxQuantity,
      quantityStep: d.quantityStep,
      quantityPresets: d.quantityPresets,
      requiresArtwork: d.requiresArtwork,
      offersDesignService: d.offersDesignService,
      isActive: d.isActive,
      isFeatured: d.isFeatured,
      highlights: d.highlights,
    };
    let id = productId;
    let before: unknown = null;
    try {
      if (id) {
        const [b] = await tx.db.select().from(products).where(eq(products.id, id)).for("update");
        if (!b) throw notFound("محصول");
        before = b;
        await tx.db.update(products).set(base).where(eq(products.id, id));
      } else {
        const [row] = await tx.db.insert(products).values(base).returning();
        id = row!.id;
      }
    } catch (err) {
      if (isUniqueViolation(err, "products_slug_uq")) throw conflict("محصولی با این نامک وجود دارد.");
      throw err;
    }
    await tx.db.delete(productMethods).where(eq(productMethods.productId, id));
    await tx.db.insert(productMethods).values(d.methods.map((m, i) => ({ ...m, productId: id!, sortOrder: i })));
    const oldGroups = await tx.db.select({ id: productOptionGroups.id }).from(productOptionGroups).where(eq(productOptionGroups.productId, id));
    if (oldGroups.length) await tx.db.delete(productOptionValues).where(inArray(productOptionValues.groupId, oldGroups.map((g) => g.id)));
    await tx.db.delete(productOptionGroups).where(eq(productOptionGroups.productId, id));
    for (const [gi, g] of d.groups.entries()) {
      const [group] = await tx.db
        .insert(productOptionGroups)
        .values({ productId: id, key: g.key, label: g.label, helpText: g.helpText ?? null, type: g.type, required: g.required, config: g.config ?? null, isActive: g.isActive, sortOrder: gi })
        .returning();
      if (g.values.length) {
        await tx.db.insert(productOptionValues).values(g.values.map((v, vi) => ({ groupId: group!.id, key: v.key, label: v.label, description: v.description ?? null, effects: v.effects, isDefault: v.isDefault, isActive: v.isActive, sortOrder: vi })));
      }
    }
    if (d.imageUrl !== undefined) {
      await tx.db.delete(productImages).where(eq(productImages.productId, id));
      if (d.imageUrl) await tx.db.insert(productImages).values({ productId: id, url: d.imageUrl, alt: d.name });
    }
    await audit(tx, { action: productId ? "product.update" : "product.create", entityType: "product", entityId: id, before, after: d });
    return id;
  });
}

export async function setProductActive(ctx: Ctx, productId: string, isActive: boolean) {
  assertCan(ctx, "catalog.manage");
  const [row] = await ctx.db.update(products).set({ isActive }).where(eq(products.id, productId)).returning({ id: products.id });
  if (!row) throw notFound("محصول");
  await audit(ctx, { action: "product.active", entityType: "product", entityId: productId, after: { isActive } });
}

export async function upsertCategory(ctx: Ctx, input: { id?: string; slug: string; name: string; description?: string | null; icon?: string | null; sortOrder?: number; isActive?: boolean }) {
  assertCan(ctx, "catalog.manage");
  slug.parse(input.slug);
  try {
    if (input.id) {
      const [row] = await ctx.db.update(productCategories).set({ ...input, id: undefined }).where(eq(productCategories.id, input.id)).returning();
      return row;
    }
    const [row] = await ctx.db.insert(productCategories).values(input).returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("دسته‌ای با این نامک وجود دارد.");
    throw err;
  }
}

/** Loads a product as an editable definition (the same shape saveProduct accepts). */
export async function productDefinitionFor(ctx: Ctx, productId: string): Promise<ProductDefinition> {
  assertCan(ctx, "catalog.manage");
  const [p] = await ctx.db.select().from(products).where(eq(products.id, productId));
  if (!p) throw notFound("محصول");
  const methods = await ctx.db.select().from(productMethods).where(eq(productMethods.productId, productId)).orderBy(productMethods.sortOrder);
  const groups = await ctx.db.select().from(productOptionGroups).where(eq(productOptionGroups.productId, productId)).orderBy(productOptionGroups.sortOrder);
  const values = groups.length ? await ctx.db.select().from(productOptionValues).where(inArray(productOptionValues.groupId, groups.map((g) => g.id))).orderBy(productOptionValues.sortOrder) : [];
  const [image] = await ctx.db.select().from(productImages).where(eq(productImages.productId, productId)).limit(1);
  return {
    slug: p.slug,
    name: p.name,
    subtitle: p.subtitle,
    description: p.description,
    categoryId: p.categoryId,
    pricingRuleSetId: p.pricingRuleSetId,
    spec: productSpecSchema.parse(p.spec),
    unitLabel: p.unitLabel,
    minQuantity: p.minQuantity,
    maxQuantity: p.maxQuantity,
    quantityStep: p.quantityStep,
    quantityPresets: p.quantityPresets,
    requiresArtwork: p.requiresArtwork,
    offersDesignService: p.offersDesignService,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    highlights: p.highlights,
    imageUrl: image?.url ?? null,
    methods: methods.map((m) => ({ methodCode: m.methodCode, minQuantity: m.minQuantity, maxQuantity: m.maxQuantity })),
    groups: groups.map((g) => ({
      key: g.key,
      label: g.label,
      helpText: g.helpText,
      type: g.type,
      required: g.required,
      config: g.config ?? null,
      isActive: g.isActive,
      values: values.filter((v) => v.groupId === g.id).map((v) => ({ key: v.key, label: v.label, description: v.description, effects: v.effects, isDefault: v.isDefault, isActive: v.isActive })),
    })),
  };
}
