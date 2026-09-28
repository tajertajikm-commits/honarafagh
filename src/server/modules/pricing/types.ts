import { z } from "zod";

/**
 * Pricing engine contracts.
 *
 * Everything here is data that managers edit from the panel. The engine
 * (./engine.ts) is a pure function of (product definition, rule version,
 * selections, material catalog) → price breakdown + material requirements +
 * step time estimates. Nothing about a specific product is hard-coded.
 */

const nonNeg = z.number().finite().min(0);
const posInt = z.number().int().positive();
const sku = z.string().min(1).max(48);

export const sizeSchema = z.object({ w: z.number().positive().max(5000), h: z.number().positive().max(5000) });
export type Size = z.infer<typeof sizeSchema>;

export const METHOD_CODES = ["OFFSET", "DIGITAL"] as const;
export const methodCodeSchema = z.string().min(2).max(24).regex(/^[A-Z_]+$/);

// ── Product definition (products.spec) ──────────────────────────────────────

export const componentSpecSchema = z.object({
  key: z.string().min(1).max(32),
  name: z.string().min(1),
  /** TRIM: one leaf is the trimmed size. SPREAD: a leaf is two pages wide (covers, folded items). */
  leaf: z.enum(["TRIM", "SPREAD"]).default("TRIM"),
  leaves: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("FIXED"), count: posInt }),
    z.object({ mode: z.literal("FROM_PAGES"), pagesOption: z.string(), pagesPerLeaf: z.number().int().min(1).max(4).default(2) }),
  ]),
  bleedMm: nonNeg.max(20).default(3),
  defaults: z
    .object({
      colorsFront: z.number().int().min(0).max(8).default(4),
      colorsBack: z.number().int().min(0).max(8).default(0),
      material: sku.optional(),
    })
    .default({ colorsFront: 4, colorsBack: 0 }),
});
export type ComponentSpec = z.infer<typeof componentSpecSchema>;

export const productSpecSchema = z.object({
  defaultTrim: sizeSchema,
  components: z.array(componentSpecSchema).min(1),
  /** Operations every unit of this product needs regardless of options (e.g. trimming). */
  baseOperations: z.array(z.lazy(() => operationRefSchema)).default([]),
  methodSelection: z.enum(["CHEAPEST", "PRIORITY"]).default("CHEAPEST"),
  /** Optional per-product markup override (percent). */
  markupPct: nonNeg.max(500).optional(),
});
export type ProductSpec = z.infer<typeof productSpecSchema>;

// ── Option effects (product_option_values.effects) ──────────────────────────

export const operationRefSchema = z.object({
  code: z.string().min(1),
  component: z.string().optional(),
  sides: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type OperationRef = z.infer<typeof operationRefSchema>;

export const optionEffectsSchema = z.object({
  trim: sizeSchema.optional(),
  customTrim: z.boolean().optional(),
  material: z
    .object({ component: z.string(), sku: sku.optional(), byMethod: z.record(z.string(), sku).optional() })
    .optional(),
  colors: z.object({ component: z.string(), front: z.number().int().min(0).max(8), back: z.number().int().min(0).max(8) }).optional(),
  operations: z.array(operationRefSchema).optional(),
  flags: z.array(z.string().regex(/^[A-Z_]+$/)).optional(),
  leadDays: z.number().int().min(0).max(60).optional(),
  /** Price adjustments that are not costs (e.g. premium options). Rial. */
  fee: z.object({ flat: nonNeg.optional(), perUnit: nonNeg.optional(), pct: nonNeg.max(500).optional() }).optional(),
});
export type OptionEffects = z.infer<typeof optionEffectsSchema>;

/** product_option_groups.config for NUMBER groups */
export const numberConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  unit: z.string().optional(),
  default: z.number().optional(),
  effect: z.enum(["PAGES", "TRIM_W", "TRIM_H", "NONE"]).default("NONE"),
  /** For PAGES: which product component the page count applies to. */
  component: z.string().optional(),
});
export type NumberConfig = z.infer<typeof numberConfigSchema>;

// ── Rule version data (pricing_rule_versions.data) ──────────────────────────

const marginSchema = z.object({ gripper: nonNeg.max(60).default(12), side: nonNeg.max(60).default(5) });

export const offsetParamsSchema = z.object({
  kind: z.literal("OFFSET"),
  pressSheet: sizeSchema,
  margin: marginSchema.default({ gripper: 12, side: 5 }),
  plateSku: sku,
  makeReadyCostPerPlate: nonNeg,
  runCostPer1000PerColor: nonNeg,
  minRunThousands: z.number().int().min(1).default(1),
  makeReadyWasteSheetsPerColor: nonNeg.default(50),
  runningWastePct: nonNeg.max(50).default(3),
  leadDays: z.number().int().min(0).default(5),
  alwaysOperations: z.array(z.string()).default([]),
  machineType: z.string().default("OFFSET_PRESS"),
  throughputSheetsPerHour: posInt.default(6000),
  makeReadyMinutesPerPlate: nonNeg.default(12),
  plateMakingMinutesPerPlate: nonNeg.default(6),
});
export type OffsetParams = z.infer<typeof offsetParamsSchema>;

export const digitalParamsSchema = z.object({
  kind: z.literal("DIGITAL"),
  pressSheet: sizeSchema,
  margin: marginSchema.default({ gripper: 5, side: 5 }),
  clickCostColor: nonNeg,
  clickCostBlack: nonNeg,
  setupCost: nonNeg.default(0),
  wastePct: nonNeg.max(50).default(2),
  minWasteSheets: z.number().int().min(0).default(5),
  leadDays: z.number().int().min(0).default(2),
  alwaysOperations: z.array(z.string()).default([]),
  machineType: z.string().default("DIGITAL_PRESS"),
  throughputSidesPerHour: posInt.default(3000),
  setupMinutes: nonNeg.default(10),
});
export type DigitalParams = z.infer<typeof digitalParamsSchema>;

export const methodParamsSchema = z.discriminatedUnion("kind", [offsetParamsSchema, digitalParamsSchema]);
export type MethodParams = z.infer<typeof methodParamsSchema>;

export const OPERATION_BASES = ["JOB", "UNIT", "THOUSAND_UNITS", "SHEET", "SHEET_SIDE", "LEAF", "M2"] as const;
export const COST_CATEGORIES = ["MATERIAL", "MACHINE", "LABOR", "OUTSOURCE"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const operationRuleSchema = z.object({
  name: z.string().min(1),
  /** Workflow step type this operation is performed in (drives conditional steps). */
  stepType: z.string().min(1),
  basis: z.enum(OPERATION_BASES),
  setupCost: nonNeg.default(0),
  rate: nonNeg.default(0),
  /** Extra per-leaf rate for UNIT basis (e.g. binding cost grows with page count). */
  ratePerLeaf: nonNeg.default(0),
  minCharge: nonNeg.default(0),
  costCategory: z.enum(COST_CATEGORIES).default("MACHINE"),
  consumes: z.array(z.object({ sku, perBasis: nonNeg })).default([]),
  minutes: z.object({ setup: nonNeg.default(0), perBasis: nonNeg.default(0) }).default({ setup: 0, perBasis: 0 }),
  leadDays: z.number().int().min(0).default(0),
});
export type OperationRule = z.infer<typeof operationRuleSchema>;

export const URGENCY_LEVELS = ["STANDARD", "EXPRESS", "RUSH"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const pricingRulesSchema = z.object({
  methods: z.record(methodCodeSchema, methodParamsSchema),
  operations: z.record(z.string(), operationRuleSchema),
  flagFees: z.record(z.string(), z.object({ name: z.string(), flat: nonNeg.default(0), perUnit: nonNeg.default(0), costCategory: z.enum(COST_CATEGORIES).default("LABOR") })).default({}),
  markup: z.object({ tiers: z.array(z.object({ minQty: z.number().int().min(0), pct: nonNeg.max(500) })).min(1) }),
  urgency: z.record(
    z.enum(URGENCY_LEVELS),
    z.object({ multiplier: z.number().min(1).max(5), leadDaysFactor: z.number().min(0.1).max(1), label: z.string() }),
  ),
  minimumOrderPrice: nonNeg.default(0),
  roundTo: z.number().int().min(1).default(10_000),
  vatPct: nonNeg.max(50).default(10),
  /** Unit cost overrides (rial per material unit). Falls back to materials.standard_cost. */
  materialCosts: z.record(sku, nonNeg).default({}),
});
export type PricingRules = z.infer<typeof pricingRulesSchema>;

// ── Engine input / output ───────────────────────────────────────────────────

export interface EngineOptionValue {
  id: string;
  key: string;
  label: string;
  isDefault?: boolean;
  effects: OptionEffects;
}
export interface EngineOptionGroup {
  id: string;
  key: string;
  label: string;
  type: "SELECT" | "NUMBER" | "TOGGLE";
  required: boolean;
  config: Partial<NumberConfig> | null;
  values: EngineOptionValue[];
}
export interface EngineProductMethod {
  methodCode: string;
  minQuantity: number;
  maxQuantity: number | null;
  sortOrder: number;
}
export interface EngineProduct {
  id: string;
  name: string;
  spec: ProductSpec;
  minQuantity: number;
  maxQuantity: number | null;
  methods: EngineProductMethod[];
  groups: EngineOptionGroup[];
}
export interface EngineMaterial {
  sku: string;
  name: string;
  unit: string;
  standardCost: number;
  sheetWidthMm: number | null;
  sheetHeightMm: number | null;
}

/** Customer selections: option group key → value key (SELECT/TOGGLE) or number (NUMBER). */
export type Selections = Record<string, string | number | boolean>;

export interface PriceRequest {
  quantity: number;
  selections: Selections;
  urgency: UrgencyLevel;
  customerDiscountPct?: number;
  /** Restrict to one method (e.g. manager forcing Offset). */
  forceMethod?: string;
}

export interface CostLine {
  category: CostCategory;
  code: string;
  label: string;
  component?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  amount: number;
}

export interface MaterialNeed {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  component?: string;
  purpose: "PAPER" | "PLATE" | "OPERATION";
  stepType: string;
}

export interface StepEstimate {
  stepType: string;
  machineType?: string;
  minutes: number;
  quantity: number;
  unit: string;
}

export interface ComponentImposition {
  component: string;
  name: string;
  materialSku: string | null;
  leafSize: Size;
  leavesPerUnit: number;
  colorsFront: number;
  colorsBack: number;
  ups: number;
  forms: number;
  runSheets: number;
  wasteSheets: number;
  pressSheets: number;
  pressSheetsPerStockSheet: number;
  stockSheets: number;
  plates: number;
}

export interface ResolvedSpec {
  quantity: number;
  trim: Size;
  components: {
    key: string;
    name: string;
    leaf: "TRIM" | "SPREAD";
    leavesPerUnit: number;
    bleedMm: number;
    colorsFront: number;
    colorsBack: number;
    materialSku: string | null;
    materialByMethod: Record<string, string>;
  }[];
  operations: OperationRef[];
  flags: string[];
  optionLeadDays: number;
  fees: { flat: number; perUnit: number; pct: number };
  /** Human-readable summary of the chosen options for display & documents. */
  summary: { group: string; value: string }[];
}

export interface AppliedOperation {
  code: string;
  name: string;
  stepType: string;
  component?: string;
}

export interface MethodCosting {
  method: string;
  operations: AppliedOperation[];
  lines: CostLine[];
  costTotal: number;
  impositions: ComponentImposition[];
  materials: MaterialNeed[];
  steps: StepEstimate[];
  leadDays: number;
}

export interface PriceBreakdown {
  engineVersion: number;
  ruleVersionId: string;
  computedAt: string;
  productId: string;
  quantity: number;
  urgency: UrgencyLevel;
  method: string;
  alternatives: { method: string; costTotal: number; subtotal: number }[];
  spec: ResolvedSpec;
  /** Operations actually applied (option-chosen + base + method defaults) with their workflow step types. */
  operations: AppliedOperation[];
  lines: CostLine[];
  impositions: ComponentImposition[];
  materials: MaterialNeed[];
  steps: StepEstimate[];
  costTotal: number;
  markupPct: number;
  markupAmount: number;
  feesAmount: number;
  urgencyMultiplier: number;
  urgencyAmount: number;
  customerDiscountPct: number;
  discountAmount: number;
  minimumApplied: boolean;
  roundingAmount: number;
  /** Selling price excluding VAT. */
  subtotal: number;
  vatPct: number;
  vatAmount: number;
  total: number;
  unitPrice: number;
  profit: number;
  marginPct: number;
  leadDays: number;
  flags: string[];
  warnings: string[];
}
