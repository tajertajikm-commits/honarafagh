import { AppError } from "@/server/core/errors";
import { fitCount, layoutForms, printableArea } from "./imposition";
import {
  type ComponentImposition,
  type CostLine,
  type DigitalParams,
  type EngineMaterial,
  type EngineOptionGroup,
  type EngineProduct,
  type MaterialNeed,
  type MethodCosting,
  type OffsetParams,
  type OperationRef,
  type PriceBreakdown,
  type PriceRequest,
  type PricingRules,
  type ResolvedSpec,
  type Size,
  type StepEstimate,
  numberConfigSchema,
  type OPERATION_BASES,
} from "./types";

export const ENGINE_VERSION = 1;

export class PricingError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION", message, details);
    this.name = "PricingError";
  }
}

const roundRial = (n: number) => Math.round(n);
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

// ── 1. Resolve customer selections into a production spec ───────────────────

export function resolveSpec(product: EngineProduct, quantity: number, selections: PriceRequest["selections"]): ResolvedSpec {
  if (!Number.isInteger(quantity) || quantity < product.minQuantity) {
    throw new PricingError(`حداقل تیراژ این محصول ${product.minQuantity} است.`);
  }
  if (product.maxQuantity != null && quantity > product.maxQuantity) {
    throw new PricingError(`حداکثر تیراژ این محصول ${product.maxQuantity} است.`);
  }

  const spec = product.spec;
  const components = spec.components.map((c) => ({
    key: c.key,
    name: c.name,
    leaf: c.leaf,
    leavesPerUnit: c.leaves.mode === "FIXED" ? c.leaves.count : 0,
    bleedMm: c.bleedMm,
    colorsFront: c.defaults.colorsFront,
    colorsBack: c.defaults.colorsBack,
    materialSku: c.defaults.material ?? null,
    materialByMethod: {} as Record<string, string>,
  }));
  const componentByKey = new Map(components.map((c) => [c.key, c]));
  const findComponent = (key: string, group: string) => {
    const c = componentByKey.get(key);
    if (!c) throw new PricingError(`پیکربندی گزینه «${group}» نامعتبر است.`, { component: key });
    return c;
  };

  let trim: Size = { ...spec.defaultTrim };
  let customTrim = false;
  const numbers: { group: EngineOptionGroup; value: number }[] = [];
  const operations: OperationRef[] = [];
  const flags = new Set<string>();
  let optionLeadDays = 0;
  const fees = { flat: 0, perUnit: 0, pct: 0 };
  const summary: ResolvedSpec["summary"] = [];

  for (const group of product.groups) {
    const raw = selections[group.key];

    if (group.type === "NUMBER") {
      const cfg = numberConfigSchema.parse(group.config ?? {});
      const value = raw === undefined || raw === "" ? cfg.default : Number(raw);
      if (value === undefined || !Number.isFinite(value)) {
        if (group.required) throw new PricingError(`مقدار «${group.label}» را وارد کنید.`);
        continue;
      }
      if (value < cfg.min || value > cfg.max) {
        throw new PricingError(`«${group.label}» باید بین ${cfg.min} و ${cfg.max} باشد.`);
      }
      if (Math.abs((value - cfg.min) / cfg.step - Math.round((value - cfg.min) / cfg.step)) > 1e-9) {
        throw new PricingError(`«${group.label}» باید مضربی از ${cfg.step} باشد.`);
      }
      numbers.push({ group, value });
      summary.push({ group: group.label, value: `${value}${cfg.unit ? " " + cfg.unit : ""}` });
      continue;
    }

    let valueKey: string | undefined;
    if (group.type === "TOGGLE") {
      const on = raw === true || raw === "true" || raw === "on";
      if (!on) continue;
      valueKey = group.values[0]?.key;
    } else {
      valueKey = typeof raw === "string" && raw ? raw : group.values.find((v) => v.isDefault)?.key;
      if (!valueKey) {
        if (group.required) throw new PricingError(`گزینه «${group.label}» را انتخاب کنید.`);
        continue;
      }
    }

    const value = group.values.find((v) => v.key === valueKey);
    if (!value) throw new PricingError(`گزینه انتخاب‌شده برای «${group.label}» معتبر نیست.`);
    summary.push({ group: group.label, value: value.label });

    const fx = value.effects;
    if (fx.trim) trim = { ...fx.trim };
    if (fx.customTrim) customTrim = true;
    if (fx.material) {
      const c = findComponent(fx.material.component, group.label);
      if (fx.material.sku) c.materialSku = fx.material.sku;
      if (fx.material.byMethod) c.materialByMethod = { ...c.materialByMethod, ...fx.material.byMethod };
    }
    if (fx.colors) {
      const c = findComponent(fx.colors.component, group.label);
      c.colorsFront = fx.colors.front;
      c.colorsBack = fx.colors.back;
    }
    if (fx.operations) operations.push(...fx.operations);
    fx.flags?.forEach((f) => flags.add(f));
    if (fx.leadDays) optionLeadDays += fx.leadDays;
    if (fx.fee) {
      fees.flat += fx.fee.flat ?? 0;
      fees.perUnit += fx.fee.perUnit ?? 0;
      fees.pct += fx.fee.pct ?? 0;
    }
  }

  for (const { group, value } of numbers) {
    const cfg = numberConfigSchema.parse(group.config ?? {});
    if (cfg.effect === "TRIM_W" && customTrim) trim.w = value;
    if (cfg.effect === "TRIM_H" && customTrim) trim.h = value;
    if (cfg.effect === "PAGES") {
      for (const c of spec.components) {
        if (c.leaves.mode === "FROM_PAGES" && c.leaves.pagesOption === group.key) {
          findComponent(c.key, group.label).leavesPerUnit = Math.ceil(value / c.leaves.pagesPerLeaf);
        }
      }
    }
  }

  for (const c of components) {
    if (c.leavesPerUnit <= 0) throw new PricingError(`تعداد صفحات «${c.name}» مشخص نشده است.`);
  }

  return {
    quantity,
    trim,
    components,
    operations: [...spec.baseOperations, ...operations],
    flags: [...flags].sort(),
    optionLeadDays,
    fees,
    summary,
  };
}

/** The value used when a customer has not chosen one: the flagged default, else the first. */
export function defaultValueKey(group: EngineOptionGroup): string | undefined {
  return (group.values.find((v) => v.isDefault) ?? group.values[0])?.key;
}

// ── 2. Cost a spec with one production method ───────────────────────────────

interface CostingInput {
  spec: ResolvedSpec;
  method: string;
  rules: PricingRules;
  materials: Map<string, EngineMaterial>;
}

function unitCost(rules: PricingRules, material: EngineMaterial): number {
  return rules.materialCosts[material.sku] ?? material.standardCost;
}

function leafSize(trim: Size, leaf: "TRIM" | "SPREAD", bleed: number): Size {
  const w = leaf === "SPREAD" ? trim.w * 2 : trim.w;
  return { w: w + 2 * bleed, h: trim.h + 2 * bleed };
}

export function costWithMethod({ spec, method, rules, materials }: CostingInput): MethodCosting {
  const params = rules.methods[method];
  if (!params) throw new PricingError(`قوانین قیمت‌گذاری برای روش «${method}» تعریف نشده است.`);

  const lines: CostLine[] = [];
  const needs: MaterialNeed[] = [];
  const steps: StepEstimate[] = [];
  const impositions: ComponentImposition[] = [];
  const printable = printableArea(params.pressSheet, params.margin);

  const getMaterial = (sku: string, context: string) => {
    const m = materials.get(sku);
    if (!m) throw new PricingError(`ماده «${sku}» برای ${context} در انبار تعریف نشده است.`, { sku });
    return m;
  };

  let printMinutes = 0;
  let printSheets = 0;
  let plateMinutes = 0;
  let totalPlates = 0;

  for (const c of spec.components) {
    const leaf = leafSize(spec.trim, c.leaf, c.bleedMm);
    const ups = fitCount(printable, leaf);
    if (ups === 0) {
      throw new PricingError(`ابعاد «${c.name}» برای ماشین ${method === "OFFSET" ? "افست" : "دیجیتال"} بزرگ است.`, { leaf, printable });
    }
    const layout = layoutForms(spec.quantity, c.leavesPerUnit, ups);
    const sides = (c.colorsFront > 0 ? 1 : 0) + (c.colorsBack > 0 ? 1 : 0);
    const totalColors = c.colorsFront + c.colorsBack;
    const printed = totalColors > 0;

    let wasteSheets = 0;
    let plates = 0;

    if (params.kind === "OFFSET") {
      const p = params as OffsetParams;
      if (printed) {
        plates = layout.forms * totalColors;
        wasteSheets = Math.ceil(layout.forms * totalColors * p.makeReadyWasteSheetsPerColor + (layout.runSheets * p.runningWastePct) / 100);
        const plateMat = getMaterial(p.plateSku, "زینک");
        const plateUnit = unitCost(rules, plateMat);
        lines.push({ category: "MATERIAL", code: "PLATE", label: "زینک", component: c.key, quantity: plates, unit: plateMat.unit, unitCost: plateUnit, amount: roundRial(plates * plateUnit) });
        needs.push({ sku: plateMat.sku, name: plateMat.name, unit: plateMat.unit, quantity: plates, component: c.key, purpose: "PLATE", stepType: "PLATE_MAKING" });
        lines.push({ category: "MACHINE", code: "MAKE_READY", label: "آماده‌سازی ماشین (مونتاژ و رنگ‌گیری)", component: c.key, quantity: plates, unit: "زینک", unitCost: p.makeReadyCostPerPlate, amount: roundRial(plates * p.makeReadyCostPerPlate) });
        const perFormRun = Math.ceil(layout.runSheets / layout.forms);
        const thousands = Math.max(p.minRunThousands, Math.ceil(perFormRun / 1000));
        const runUnits = layout.forms * totalColors * thousands;
        lines.push({ category: "MACHINE", code: "PRESS_RUN", label: "چاپ (هر هزار برگ در هر رنگ)", component: c.key, quantity: runUnits, unit: "هزار", unitCost: p.runCostPer1000PerColor, amount: roundRial(runUnits * p.runCostPer1000PerColor) });
        totalPlates += plates;
        plateMinutes += plates * p.plateMakingMinutesPerPlate;
        const passes = Math.max(1, sides);
        printMinutes += plates * p.makeReadyMinutesPerPlate + (((layout.runSheets + wasteSheets) * passes) / p.throughputSheetsPerHour) * 60;
        printSheets += layout.runSheets + wasteSheets;
      }
    } else {
      const p = params as DigitalParams;
      if (printed) {
        wasteSheets = Math.max(p.minWasteSheets, Math.ceil((layout.runSheets * p.wastePct) / 100));
        const pressSheets = layout.runSheets + wasteSheets;
        const sideCost = (colors: number) => (colors === 0 ? 0 : colors === 1 ? p.clickCostBlack : p.clickCostColor);
        const clickUnit = sideCost(c.colorsFront) + sideCost(c.colorsBack);
        lines.push({ category: "MACHINE", code: "CLICKS", label: "چاپ دیجیتال (هزینه هر برگ)", component: c.key, quantity: pressSheets, unit: "برگ", unitCost: clickUnit, amount: roundRial(pressSheets * clickUnit) });
        printMinutes += ((pressSheets * Math.max(1, sides)) / p.throughputSidesPerHour) * 60;
        printSheets += pressSheets;
      }
    }

    const pressSheets = layout.runSheets + wasteSheets;
    const sku = c.materialByMethod[method] ?? c.materialSku;
    let stockSheets = 0;
    let perStock = 1;
    if (sku) {
      const mat = getMaterial(sku, `کاغذ «${c.name}»`);
      if (mat.sheetWidthMm && mat.sheetHeightMm) {
        perStock = fitCount({ w: mat.sheetWidthMm, h: mat.sheetHeightMm }, params.pressSheet);
        if (perStock === 0) throw new PricingError(`کاغذ «${mat.name}» از برگ ماشین کوچک‌تر است.`, { sku });
      }
      stockSheets = Math.ceil(pressSheets / perStock);
      const paperUnit = unitCost(rules, mat);
      lines.push({ category: "MATERIAL", code: "PAPER", label: `کاغذ — ${mat.name}`, component: c.key, quantity: stockSheets, unit: mat.unit, unitCost: paperUnit, amount: roundRial(stockSheets * paperUnit) });
      needs.push({ sku: mat.sku, name: mat.name, unit: mat.unit, quantity: stockSheets, component: c.key, purpose: "PAPER", stepType: method === "OFFSET" ? "OFFSET_PRINTING" : "DIGITAL_PRINTING" });
    }

    impositions.push({
      component: c.key,
      name: c.name,
      materialSku: sku ?? null,
      leafSize: leaf,
      leavesPerUnit: c.leavesPerUnit,
      colorsFront: c.colorsFront,
      colorsBack: c.colorsBack,
      ups,
      forms: layout.forms,
      runSheets: layout.runSheets,
      wasteSheets,
      pressSheets,
      pressSheetsPerStockSheet: perStock,
      stockSheets,
      plates,
    });
  }

  if (params.kind === "DIGITAL" && printSheets > 0) {
    const p = params as DigitalParams;
    if (p.setupCost > 0) lines.push({ category: "MACHINE", code: "SETUP", label: "راه‌اندازی و کالیبراسیون", quantity: 1, unit: "کار", unitCost: p.setupCost, amount: roundRial(p.setupCost) });
    printMinutes += p.setupMinutes;
  }

  if (totalPlates > 0) steps.push({ stepType: "PLATE_MAKING", machineType: "CTP", minutes: Math.ceil(plateMinutes), quantity: totalPlates, unit: "زینک" });
  if (printSheets > 0) {
    steps.push({
      stepType: params.kind === "OFFSET" ? "OFFSET_PRINTING" : "DIGITAL_PRINTING",
      machineType: params.machineType,
      minutes: Math.ceil(printMinutes),
      quantity: printSheets,
      unit: "برگ",
    });
  }

  // Operations: those chosen by options + those every job of this method needs.
  const opRefs: OperationRef[] = [...params.alwaysOperations.map((code) => ({ code })), ...spec.operations];
  let opLeadDays = 0;
  const applied: MethodCosting["operations"] = [];
  for (const ref of opRefs) {
    const op = rules.operations[ref.code];
    if (!op) throw new PricingError(`عملیات «${ref.code}» در قوانین قیمت‌گذاری تعریف نشده است.`);
    applied.push({ code: ref.code, name: op.name, stepType: op.stepType, component: ref.component });
    const imp = impositions.find((i) => i.component === (ref.component ?? impositions[0]?.component)) ?? impositions[0]!;
    const sides = ref.sides ?? 1;
    const basisQty = (() => {
      switch (op.basis) {
        case "JOB":
          return 1;
        case "UNIT":
          return spec.quantity;
        case "THOUSAND_UNITS":
          return Math.ceil(spec.quantity / 1000);
        case "SHEET":
          return imp.runSheets;
        case "SHEET_SIDE":
          return imp.runSheets * sides;
        case "LEAF":
          return spec.quantity * imp.leavesPerUnit;
        case "M2":
          return (spec.trim.w / 1000) * (spec.trim.h / 1000) * spec.quantity * sides;
      }
    })();
    const leafExtra = op.basis === "UNIT" ? op.ratePerLeaf * imp.leavesPerUnit * spec.quantity : 0;
    const raw = op.setupCost + op.rate * basisQty + leafExtra;
    const amount = roundRial(Math.max(op.minCharge, raw));
    lines.push({
      category: op.costCategory,
      code: ref.code,
      label: op.name + (sides === 2 ? " (دو رو)" : ""),
      component: ref.component,
      quantity: round3(basisQty),
      unit: BASIS_UNIT[op.basis],
      unitCost: op.rate,
      amount,
    });
    for (const cons of op.consumes) {
      const mat = getMaterial(cons.sku, op.name);
      const q = round3(basisQty * cons.perBasis);
      if (q > 0) {
        needs.push({ sku: mat.sku, name: mat.name, unit: mat.unit, quantity: q, component: ref.component, purpose: "OPERATION", stepType: op.stepType });
        const cost = unitCost(rules, mat);
        lines.push({ category: "MATERIAL", code: `${ref.code}:${mat.sku}`, label: `${mat.name} (${op.name})`, component: ref.component, quantity: q, unit: mat.unit, unitCost: cost, amount: roundRial(q * cost) });
      }
    }
    const minutes = op.minutes.setup + op.minutes.perBasis * basisQty;
    if (minutes > 0) mergeStep(steps, { stepType: op.stepType, minutes: Math.ceil(minutes), quantity: round3(basisQty), unit: BASIS_UNIT[op.basis] });
    opLeadDays = Math.max(opLeadDays, op.leadDays);
  }

  // Flag-driven services (e.g. design service)
  for (const flag of spec.flags) {
    const fee = rules.flagFees[flag];
    if (!fee) continue;
    const amount = roundRial(fee.flat + fee.perUnit * spec.quantity);
    if (amount > 0) lines.push({ category: fee.costCategory, code: `FLAG:${flag}`, label: fee.name, quantity: 1, unit: "کار", unitCost: amount, amount });
  }

  return {
    method,
    operations: applied,
    lines,
    costTotal: lines.reduce((s, l) => s + l.amount, 0),
    impositions,
    materials: mergeNeeds(needs),
    steps,
    leadDays: params.leadDays + opLeadDays + spec.optionLeadDays,
  };
}

const BASIS_UNIT: Record<(typeof OPERATION_BASES)[number], string> = {
  JOB: "کار",
  UNIT: "عدد",
  THOUSAND_UNITS: "هزار عدد",
  SHEET: "برگ",
  SHEET_SIDE: "رو",
  LEAF: "برگ",
  M2: "مترمربع",
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function mergeStep(steps: StepEstimate[], s: StepEstimate) {
  const existing = steps.find((x) => x.stepType === s.stepType);
  if (existing) {
    existing.minutes += s.minutes;
    existing.quantity = round3(existing.quantity + s.quantity);
  } else steps.push(s);
}

function mergeNeeds(needs: MaterialNeed[]): MaterialNeed[] {
  const out = new Map<string, MaterialNeed>();
  for (const n of needs) {
    const key = `${n.sku}|${n.purpose}|${n.stepType}|${n.component ?? ""}`;
    const cur = out.get(key);
    if (cur) cur.quantity = round3(cur.quantity + n.quantity);
    else out.set(key, { ...n });
  }
  return [...out.values()];
}

// ── 3. Turn cost into a selling price ───────────────────────────────────────

export interface CalculateInput {
  product: EngineProduct;
  rules: PricingRules;
  ruleVersionId: string;
  materials: EngineMaterial[];
  request: PriceRequest;
  now?: Date;
}

export function calculatePrice(input: CalculateInput): PriceBreakdown {
  const { product, rules, request } = input;
  const spec = resolveSpec(product, request.quantity, request.selections);
  const materials = new Map(input.materials.map((m) => [m.sku, m]));

  const candidates = product.methods
    .filter((m) => request.quantity >= m.minQuantity && (m.maxQuantity == null || request.quantity <= m.maxQuantity))
    .filter((m) => !request.forceMethod || m.methodCode === request.forceMethod)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (candidates.length === 0) throw new PricingError("برای این تیراژ روش تولید مناسبی تعریف نشده است.");

  const costings: MethodCosting[] = [];
  const failures: string[] = [];
  for (const c of candidates) {
    try {
      costings.push(costWithMethod({ spec, method: c.methodCode, rules, materials }));
    } catch (err) {
      if (err instanceof PricingError) failures.push(err.message);
      else throw err;
    }
  }
  if (costings.length === 0) throw new PricingError(failures[0] ?? "محاسبه قیمت ممکن نشد.");

  const priced = costings.map((c) => ({ costing: c, ...priceFromCost(c.costTotal, spec, rules, product, request) }));
  const chosen =
    product.spec.methodSelection === "CHEAPEST"
      ? priced.reduce((best, p) => (p.subtotal < best.subtotal ? p : best))
      : priced[0]!;

  const urgency = rules.urgency[request.urgency];
  const leadDays = Math.max(1, Math.ceil(chosen.costing.leadDays * (urgency?.leadDaysFactor ?? 1)));
  const vatAmount = roundRial((chosen.subtotal * rules.vatPct) / 100);
  const profit = chosen.subtotal - chosen.costing.costTotal;

  const warnings: string[] = [];
  if (profit < 0) warnings.push("قیمت فروش کمتر از بهای تمام‌شده است.");

  return {
    engineVersion: ENGINE_VERSION,
    ruleVersionId: input.ruleVersionId,
    computedAt: (input.now ?? new Date()).toISOString(),
    productId: product.id,
    quantity: request.quantity,
    urgency: request.urgency,
    method: chosen.costing.method,
    alternatives: priced.map((p) => ({ method: p.costing.method, costTotal: p.costing.costTotal, subtotal: p.subtotal })),
    spec,
    operations: chosen.costing.operations,
    lines: chosen.costing.lines,
    impositions: chosen.costing.impositions,
    materials: chosen.costing.materials,
    steps: chosen.costing.steps,
    costTotal: chosen.costing.costTotal,
    markupPct: chosen.markupPct,
    markupAmount: chosen.markupAmount,
    feesAmount: chosen.feesAmount,
    urgencyMultiplier: chosen.urgencyMultiplier,
    urgencyAmount: chosen.urgencyAmount,
    customerDiscountPct: chosen.customerDiscountPct,
    discountAmount: chosen.discountAmount,
    minimumApplied: chosen.minimumApplied,
    roundingAmount: chosen.roundingAmount,
    subtotal: chosen.subtotal,
    vatPct: rules.vatPct,
    vatAmount,
    total: chosen.subtotal + vatAmount,
    unitPrice: Math.round((chosen.subtotal / request.quantity) * 100) / 100,
    profit,
    marginPct: chosen.subtotal > 0 ? Math.round((profit / chosen.subtotal) * 10000) / 100 : 0,
    leadDays,
    flags: spec.flags,
    warnings,
  };
}

export function markupFor(rules: PricingRules, quantity: number, productOverride?: number): number {
  if (productOverride != null) return productOverride;
  const tiers = [...rules.markup.tiers].sort((a, b) => a.minQty - b.minQty);
  let pct = tiers[0]!.pct;
  for (const t of tiers) if (quantity >= t.minQty) pct = t.pct;
  return pct;
}

function priceFromCost(cost: number, spec: ResolvedSpec, rules: PricingRules, product: EngineProduct, request: PriceRequest) {
  const markupPct = markupFor(rules, spec.quantity, product.spec.markupPct);
  const markupAmount = roundRial((cost * markupPct) / 100);
  const base = cost + markupAmount;
  const feesAmount = roundRial(spec.fees.flat + spec.fees.perUnit * spec.quantity + (base * spec.fees.pct) / 100);
  const beforeUrgency = base + feesAmount;
  const urgencyMultiplier = rules.urgency[request.urgency]?.multiplier ?? 1;
  const urgencyAmount = roundRial(beforeUrgency * (urgencyMultiplier - 1));
  const afterUrgency = beforeUrgency + urgencyAmount;
  const customerDiscountPct = Math.min(100, Math.max(0, request.customerDiscountPct ?? 0));
  const discountAmount = roundRial((afterUrgency * customerDiscountPct) / 100);
  let price = afterUrgency - discountAmount;
  const minimumApplied = price < rules.minimumOrderPrice;
  if (minimumApplied) price = rules.minimumOrderPrice;
  const rounded = ceilTo(price, rules.roundTo);
  return {
    markupPct,
    markupAmount,
    feesAmount,
    urgencyMultiplier,
    urgencyAmount,
    customerDiscountPct,
    discountAmount,
    minimumApplied,
    roundingAmount: rounded - price,
    subtotal: rounded,
  };
}
