import { productSpecSchema, pricingRulesSchema, type EngineMaterial, type EngineProduct } from "@/server/modules/pricing/types";
import { MATERIALS, PRICING_RULES, PRODUCTS } from "@/server/seed/reference";

export const rules = pricingRulesSchema.parse(PRICING_RULES);

export const materials: EngineMaterial[] = MATERIALS.map((m) => ({
  sku: m.sku,
  name: m.name,
  unit: m.unit,
  standardCost: m.standardCost,
  sheetWidthMm: m.paper?.w ?? null,
  sheetHeightMm: m.paper?.h ?? null,
}));

export function engineProduct(slug: string): EngineProduct {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`no product ${slug}`);
  return {
    id: `prod-${slug}`,
    name: p.name,
    spec: productSpecSchema.parse(p.spec),
    minQuantity: p.minQuantity,
    maxQuantity: p.maxQuantity,
    methods: p.methods.map((m, i) => ({ methodCode: m.methodCode, minQuantity: m.minQuantity, maxQuantity: m.maxQuantity, sortOrder: i })),
    groups: p.groups.map((g, gi) => ({
      id: `g-${gi}`,
      key: g.key,
      label: g.label,
      type: g.type,
      required: g.required,
      config: (g.config as EngineProduct["groups"][number]["config"]) ?? null,
      values: g.values.map((v, vi) => ({ id: `v-${gi}-${vi}`, key: v.key, label: v.label, isDefault: v.isDefault, effects: v.effects })),
    })),
  };
}
