import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { customers, materials, pricingRuleSets, pricingRuleVersions, products } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { AppError, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { loadProductDetail, toEngineProduct } from "@/server/modules/catalog/queries";
import { calculatePrice } from "./engine";
import { type EngineMaterial, type PriceBreakdown, type PricingRules, pricingRulesSchema, type Selections, type UrgencyLevel } from "./types";

export async function publishedVersion(db: Executor, ruleSetId: string) {
  const [v] = await db
    .select()
    .from(pricingRuleVersions)
    .where(and(eq(pricingRuleVersions.ruleSetId, ruleSetId), eq(pricingRuleVersions.status, "PUBLISHED")))
    .limit(1);
  if (!v) throw new AppError("INVALID_STATE", "نسخه فعال قیمت‌گذاری برای این محصول وجود ندارد.");
  return v;
}

export async function engineMaterials(db: Executor): Promise<EngineMaterial[]> {
  const rows = await db
    .select({ sku: materials.sku, name: materials.name, unit: materials.unit, standardCost: materials.standardCost, sheetWidthMm: materials.sheetWidthMm, sheetHeightMm: materials.sheetHeightMm })
    .from(materials)
    .where(eq(materials.isActive, true));
  return rows;
}

export interface PriceInput {
  productId: string;
  quantity: number;
  selections: Selections;
  urgency: UrgencyLevel;
  customerId?: string | null;
  forceMethod?: string;
  /** Price against a specific (e.g. draft) version instead of the published one. */
  ruleVersionId?: string;
}

/** The single entry point every interface uses to price a product. */
export async function priceProduct(db: Executor, input: PriceInput): Promise<PriceBreakdown> {
  const detail = await loadProductDetail(db, { id: input.productId });
  const version = input.ruleVersionId
    ? await db.select().from(pricingRuleVersions).where(eq(pricingRuleVersions.id, input.ruleVersionId)).then((r) => r[0])
    : await publishedVersion(db, detail.product.pricingRuleSetId);
  if (!version || version.ruleSetId !== detail.product.pricingRuleSetId) throw notFound("نسخه قیمت‌گذاری");
  let customerDiscountPct = 0;
  if (input.customerId) {
    const [c] = await db.select({ d: customers.discountPct }).from(customers).where(eq(customers.id, input.customerId)).limit(1);
    customerDiscountPct = c?.d ?? 0;
  }
  return calculatePrice({
    product: toEngineProduct(detail),
    rules: pricingRulesSchema.parse(version.data),
    ruleVersionId: version.id,
    materials: await engineMaterials(db),
    request: { quantity: input.quantity, selections: input.selections, urgency: input.urgency, customerDiscountPct, forceMethod: input.forceMethod },
  });
}

// ── Rule-set administration (versioned) ─────────────────────────────────────

export async function listRuleSets(ctx: Ctx) {
  assertCan(ctx, "catalog.manage");
  const sets = await ctx.db.select().from(pricingRuleSets).orderBy(asc(pricingRuleSets.name));
  const versions = sets.length
    ? await ctx.db
        .select({ id: pricingRuleVersions.id, ruleSetId: pricingRuleVersions.ruleSetId, version: pricingRuleVersions.version, status: pricingRuleVersions.status, notes: pricingRuleVersions.notes, createdAt: pricingRuleVersions.createdAt, publishedAt: pricingRuleVersions.publishedAt })
        .from(pricingRuleVersions)
        .where(inArray(pricingRuleVersions.ruleSetId, sets.map((s) => s.id)))
        .orderBy(desc(pricingRuleVersions.version))
    : [];
  const productCounts = await ctx.db.select({ ruleSetId: products.pricingRuleSetId, n: sql<number>`count(*)::int` }).from(products).groupBy(products.pricingRuleSetId);
  return sets.map((s) => ({ ...s, versions: versions.filter((v) => v.ruleSetId === s.id), productCount: productCounts.find((p) => p.ruleSetId === s.id)?.n ?? 0 }));
}

export async function getRuleVersion(ctx: Ctx, versionId: string) {
  assertCan(ctx, "catalog.manage");
  const [v] = await ctx.db.select().from(pricingRuleVersions).where(eq(pricingRuleVersions.id, versionId)).limit(1);
  if (!v) throw notFound("نسخه قیمت‌گذاری");
  return v;
}

/** Copies a version into a new DRAFT (the only editable state). */
export async function createDraft(ctx: Ctx, fromVersionId: string, notes?: string) {
  assertCan(ctx, "catalog.manage");
  return inTx(ctx, async (tx) => {
    const src = await getRuleVersion(tx, fromVersionId);
    const existingDraft = await tx.db
      .select({ id: pricingRuleVersions.id })
      .from(pricingRuleVersions)
      .where(and(eq(pricingRuleVersions.ruleSetId, src.ruleSetId), eq(pricingRuleVersions.status, "DRAFT")))
      .limit(1);
    if (existingDraft[0]) throw invalidState("برای این مجموعه یک پیش‌نویس باز وجود دارد.", { draftId: existingDraft[0].id });
    await tx.db.execute(sql`SELECT id FROM pricing_rule_sets WHERE id = ${src.ruleSetId} FOR UPDATE`);
    const [{ max }] = (await tx.db
      .select({ max: sql<number>`coalesce(max(${pricingRuleVersions.version}), 0)::int` })
      .from(pricingRuleVersions)
      .where(eq(pricingRuleVersions.ruleSetId, src.ruleSetId))) as [{ max: number }];
    const [draft] = await tx.db
      .insert(pricingRuleVersions)
      .values({ ruleSetId: src.ruleSetId, version: max + 1, status: "DRAFT", data: src.data, notes: notes ?? null, createdBy: actorUserId(tx) })
      .returning();
    await audit(tx, { action: "pricing.draft.create", entityType: "pricing_rule_version", entityId: draft!.id, after: { version: draft!.version, from: src.version } });
    return draft!;
  });
}

export async function updateDraft(ctx: Ctx, versionId: string, data: unknown, notes?: string) {
  assertCan(ctx, "catalog.manage");
  const parsed = pricingRulesSchema.safeParse(data);
  if (!parsed.success) throw validation("قوانین قیمت‌گذاری معتبر نیست.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return inTx(ctx, async (tx) => {
    const [v] = await tx.db.select().from(pricingRuleVersions).where(eq(pricingRuleVersions.id, versionId)).for("update");
    if (!v) throw notFound("نسخه قیمت‌گذاری");
    if (v.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل ویرایش است. نسخه‌های منتشرشده تغییرناپذیرند.");
    await tx.db.update(pricingRuleVersions).set({ data: parsed.data, notes: notes ?? v.notes }).where(eq(pricingRuleVersions.id, versionId));
    await audit(tx, { action: "pricing.draft.update", entityType: "pricing_rule_version", entityId: versionId, before: v.data, after: parsed.data });
    return { ...v, data: parsed.data };
  });
}

/** Publishes a draft; the previous published version is archived. Old orders keep their snapshots. */
export async function publishDraft(ctx: Ctx, versionId: string) {
  assertCan(ctx, "catalog.manage");
  return inTx(ctx, async (tx) => {
    const [v] = await tx.db.select().from(pricingRuleVersions).where(eq(pricingRuleVersions.id, versionId)).for("update");
    if (!v) throw notFound("نسخه قیمت‌گذاری");
    if (v.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل انتشار است.");
    pricingRulesSchema.parse(v.data);
    const [prev] = await tx.db
      .update(pricingRuleVersions)
      .set({ status: "ARCHIVED" })
      .where(and(eq(pricingRuleVersions.ruleSetId, v.ruleSetId), eq(pricingRuleVersions.status, "PUBLISHED")))
      .returning({ id: pricingRuleVersions.id, version: pricingRuleVersions.version });
    await tx.db
      .update(pricingRuleVersions)
      .set({ status: "PUBLISHED", publishedAt: new Date(), publishedBy: actorUserId(tx) })
      .where(eq(pricingRuleVersions.id, versionId));
    await audit(tx, { action: "pricing.publish", entityType: "pricing_rule_version", entityId: versionId, before: prev ? { published: prev.version } : null, after: { published: v.version } });
    return { id: versionId, version: v.version, archived: prev?.version ?? null };
  });
}

export async function discardDraft(ctx: Ctx, versionId: string) {
  assertCan(ctx, "catalog.manage");
  return inTx(ctx, async (tx) => {
    const [v] = await tx.db.select().from(pricingRuleVersions).where(eq(pricingRuleVersions.id, versionId)).for("update");
    if (!v || v.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل حذف است.");
    await tx.db.update(pricingRuleVersions).set({ status: "ARCHIVED", notes: `${v.notes ?? ""} (حذف پیش‌نویس)`.trim() }).where(eq(pricingRuleVersions.id, versionId));
    await audit(tx, { action: "pricing.draft.discard", entityType: "pricing_rule_version", entityId: versionId });
  });
}

export type { PricingRules };
