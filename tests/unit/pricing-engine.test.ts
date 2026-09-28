import { describe, expect, it } from "vitest";
import { calculatePrice, costWithMethod, markupFor, PricingError, resolveSpec } from "@/server/modules/pricing/engine";
import { fitCount, layoutForms, printableArea } from "@/server/modules/pricing/imposition";
import type { PricingRules } from "@/server/modules/pricing/types";
import { engineProduct, materials, rules } from "../helpers/engine";

const materialMap = new Map(materials.map((m) => [m.sku, m]));
const calc = (slug: string, quantity: number, selections: Record<string, string | number | boolean> = {}, extra: Partial<Parameters<typeof calculatePrice>[0]["request"]> = {}, r: PricingRules = rules) =>
  calculatePrice({
    product: engineProduct(slug),
    rules: r,
    ruleVersionId: "rv-test",
    materials,
    request: { quantity, selections, urgency: "STANDARD", ...extra },
    now: new Date("2026-09-28T08:00:00Z"),
  });

describe("imposition", () => {
  it("fits items in both orientations and picks the better one", () => {
    expect(fitCount({ w: 440, h: 310 }, { w: 89, h: 54 })).toBe(24); // rotated wins (8×3 vs 4×5)
    expect(fitCount({ w: 100, h: 100 }, { w: 101, h: 10 })).toBe(0 + Math.floor(100 / 10) * Math.floor(100 / 101));
    expect(fitCount({ w: 1000, h: 700 }, { w: 700, h: 500 })).toBe(2); // 70×100 parent → two 50×70 press sheets
  });

  it("computes printable area from gripper and side margins", () => {
    expect(printableArea({ w: 700, h: 500 }, { gripper: 12, side: 5 })).toEqual({ w: 690, h: 483 });
  });

  it("gangs identical copies when a unit fits on one sheet", () => {
    expect(layoutForms(1000, 1, 24)).toEqual({ ups: 24, forms: 1, runSheets: 42 });
    expect(layoutForms(100, 2, 8)).toEqual({ ups: 8, forms: 1, runSheets: 25 });
  });

  it("uses multiple forms (signatures) for units larger than one sheet", () => {
    // 50 leaves per notebook, 8 per sheet → 7 forms, each run for every unit
    expect(layoutForms(100, 50, 8)).toEqual({ ups: 8, forms: 7, runSheets: 700 });
  });
});

describe("resolveSpec", () => {
  it("applies option effects to components", () => {
    const spec = resolveSpec(engineProduct("business-card"), 1000, { paper: "kt300", sides: "4-4", lamination: "matte", corners: true });
    const main = spec.components[0]!;
    expect(main.materialByMethod).toEqual({ OFFSET: "P-KT300-70", DIGITAL: "P-KT300-SRA3" });
    expect([main.colorsFront, main.colorsBack]).toEqual([4, 4]);
    expect(spec.operations.map((o) => o.code)).toEqual(["CUTTING", "LAMINATION_MATTE", "CORNER_ROUND"]);
  });

  it("derives leaves from page count", () => {
    const spec = resolveSpec(engineProduct("notebook"), 100, { pages: 120 });
    expect(spec.components.find((c) => c.key === "inner")!.leavesPerUnit).toBe(60);
  });

  it("rejects invalid input with a user-facing error", () => {
    const p = engineProduct("notebook");
    expect(() => resolveSpec(p, 5, {})).toThrow(PricingError);
    expect(() => resolveSpec(p, 100, { pages: 30 })).toThrow(/بین/);
    expect(() => resolveSpec(p, 100, { pages: 50 })).toThrow(/مضرب/);
    expect(() => resolveSpec(p, 100, { binding: "gold" })).toThrow(/معتبر/);
  });

  it("uses custom dimensions only when the custom size option is chosen", () => {
    const p = engineProduct("sticker");
    expect(resolveSpec(p, 100, { size: "s70", width: 120, height: 90 }).trim).toEqual({ w: 70, h: 70 });
    expect(resolveSpec(p, 100, { size: "custom", width: 120, height: 90 }).trim).toEqual({ w: 120, h: 90 });
  });
});

describe("costWithMethod", () => {
  it("costs a digital business card run exactly", () => {
    const spec = resolveSpec(engineProduct("business-card"), 1000, {});
    const c = costWithMethod({ spec, method: "DIGITAL", rules, materials: materialMap });
    const imp = c.impositions[0]!;
    expect(imp).toMatchObject({ ups: 24, forms: 1, runSheets: 42, wasteSheets: 3, pressSheets: 45, stockSheets: 45, plates: 0 });
    const byCode = Object.fromEntries(c.lines.map((l) => [l.code, l.amount]));
    expect(byCode).toMatchObject({
      CLICKS: 45 * 25_000,
      PAPER: 45 * 110_000,
      SETUP: 300_000,
      PREPRESS_DIGITAL: 500_000,
      CUTTING: 500_000, // 300,000 + 42×250 is below the 500,000 minimum
      PACKAGING: 600_000,
      "PACKAGING:PK-CARTON": 2 * 250_000,
    });
    expect(c.costTotal).toBe(8_475_000);
  });

  it("costs offset with plates, make-ready waste and parent-sheet yield", () => {
    const spec = resolveSpec(engineProduct("business-card"), 1000, {});
    const c = costWithMethod({ spec, method: "OFFSET", rules, materials: materialMap });
    const imp = c.impositions[0]!;
    expect(imp).toMatchObject({ ups: 60, runSheets: 17, plates: 4, wasteSheets: 101, pressSheets: 118, pressSheetsPerStockSheet: 2, stockSheets: 59 });
    expect(c.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: "PL-CTP-5274", quantity: 4, purpose: "PLATE", stepType: "PLATE_MAKING" }),
        expect.objectContaining({ sku: "P-GL300-70", quantity: 59, purpose: "PAPER", stepType: "OFFSET_PRINTING" }),
      ]),
    );
    expect(c.steps.map((s) => s.stepType)).toEqual(expect.arrayContaining(["PLATE_MAKING", "OFFSET_PRINTING", "PREPRESS", "CUTTING", "PACKAGING"]));
  });

  it("does not print or plate blank components", () => {
    const spec = resolveSpec(engineProduct("notebook"), 500, { inner_print: "blank" });
    const c = costWithMethod({ spec, method: "OFFSET", rules, materials: materialMap });
    const inner = c.impositions.find((i) => i.component === "inner")!;
    expect(inner.plates).toBe(0);
    expect(inner.wasteSheets).toBe(0);
    expect(c.lines.filter((l) => l.component === "inner" && l.code === "PRESS_RUN")).toHaveLength(0);
    expect(inner.stockSheets).toBeGreaterThan(0); // paper is still needed
  });

  it("throws when a referenced material is missing", () => {
    const spec = resolveSpec(engineProduct("business-card"), 500, {});
    const partial = new Map(materialMap);
    partial.delete("P-GL300-SRA3");
    expect(() => costWithMethod({ spec, method: "DIGITAL", rules, materials: partial })).toThrow(/P-GL300-SRA3/);
  });

  it("throws when the item does not fit on the press sheet", () => {
    const tiny: PricingRules = { ...rules, methods: { ...rules.methods, DIGITAL: { ...rules.methods.DIGITAL!, pressSheet: { w: 60, h: 60 } } as PricingRules["methods"][string] } };
    const spec = resolveSpec(engineProduct("flyer"), 100, {});
    expect(() => costWithMethod({ spec, method: "DIGITAL", rules: tiny, materials: materialMap })).toThrow(PricingError);
  });
});

describe("calculatePrice", () => {
  it("picks the cheapest eligible method and prices it", () => {
    const p = calc("business-card", 1000);
    expect(p.method).toBe("DIGITAL");
    expect(p.alternatives.map((a) => a.method).sort()).toEqual(["DIGITAL", "OFFSET"]);
    expect(p.costTotal).toBe(8_475_000);
    expect(p.markupPct).toBe(35);
    expect(p.markupAmount).toBe(2_966_250);
    expect(p.subtotal).toBe(11_450_000); // rounded up to 10,000 rial
    expect(p.roundingAmount).toBe(8_750);
    expect(p.vatAmount).toBe(1_145_000);
    expect(p.total).toBe(12_595_000);
    expect(p.profit).toBe(11_450_000 - 8_475_000);
    expect(p.marginPct).toBeCloseTo(25.98, 2);
    expect(p.unitPrice).toBe(11_450);
  });

  it("uses offset for large runs where digital is not eligible", () => {
    const p = calc("business-card", 10_000);
    expect(p.method).toBe("OFFSET");
    expect(p.alternatives).toHaveLength(1);
  });

  it("offset becomes cheaper than digital as quantity grows", () => {
    const small = calc("flyer", 600, { size: "a4" });
    const large = calc("flyer", 1500, { size: "a4" });
    const smallDigital = small.alternatives.find((a) => a.method === "DIGITAL")!;
    const smallOffset = small.alternatives.find((a) => a.method === "OFFSET")!;
    expect(smallDigital.costTotal).toBeLessThan(smallOffset.costTotal);
    const largeDigital = large.alternatives.find((a) => a.method === "DIGITAL")!;
    const largeOffset = large.alternatives.find((a) => a.method === "OFFSET")!;
    // Unit cost of offset drops much faster than digital
    expect(largeOffset.costTotal / 1500).toBeLessThan(smallOffset.costTotal / 600);
    expect(largeDigital.costTotal / 1500).toBeGreaterThan((smallDigital.costTotal / 600) * 0.9);
  });

  it("respects forced method", () => {
    expect(calc("business-card", 2000, {}, { forceMethod: "OFFSET" }).method).toBe("OFFSET");
  });

  it("applies urgency to price and lead time", () => {
    const standard = calc("flyer", 500);
    const rush = calc("flyer", 500, {}, { urgency: "RUSH" });
    expect(rush.urgencyMultiplier).toBe(1.5);
    expect(rush.subtotal).toBeGreaterThan(standard.subtotal * 1.49);
    expect(rush.leadDays).toBeLessThan(standard.leadDays);
    expect(rush.leadDays).toBeGreaterThanOrEqual(1);
  });

  it("applies customer discount before rounding and VAT", () => {
    const base = calc("flyer", 1000);
    const disc = calc("flyer", 1000, {}, { customerDiscountPct: 10 });
    expect(disc.discountAmount).toBeGreaterThan(0);
    expect(disc.subtotal).toBeLessThan(base.subtotal);
    expect(disc.vatAmount).toBe(Math.round(disc.subtotal * 0.1));
  });

  it("enforces the minimum order price", () => {
    const r: PricingRules = { ...rules, minimumOrderPrice: 500_000_000 };
    const p = calc("flyer", 50, {}, {}, r);
    expect(p.minimumApplied).toBe(true);
    expect(p.subtotal).toBe(500_000_000);
  });

  it("adds design service fee and flags", () => {
    const own = calc("flyer", 500);
    const service = calc("flyer", 500, { design: "service" });
    expect(service.flags).toContain("NEEDS_DESIGN");
    expect(service.costTotal - own.costTotal).toBe(15_000_000);
    expect(service.leadDays).toBeGreaterThan(own.leadDays);
  });

  it("computes the full material list for a notebook (real-world scenario)", () => {
    const p = calc("notebook", 100, { pages: 100, binding: "wire", cover_lamination: "matte" });
    const skus = p.materials.map((m) => m.sku);
    expect(skus).toEqual(expect.arrayContaining(["B-WIRE", "F-LAM-MATTE", "PK-CARTON"]));
    expect(p.materials.find((m) => m.sku === "B-WIRE")!.quantity).toBe(100);
    expect(p.materials.filter((m) => m.purpose === "PAPER")).toHaveLength(2);
    expect(p.steps.map((s) => s.stepType)).toEqual(expect.arrayContaining(["BINDING", "LAMINATION", "CUTTING"]));
    expect(p.subtotal % rules.roundTo).toBe(0);
  });

  it("is deterministic for identical input", () => {
    expect(calc("catalog", 250, { pages: 24 })).toEqual(calc("catalog", 250, { pages: 24 }));
  });

  it("selects markup tier by quantity", () => {
    expect(markupFor(rules, 10)).toBe(45);
    expect(markupFor(rules, 500)).toBe(40);
    expect(markupFor(rules, 999)).toBe(40);
    expect(markupFor(rules, 1000)).toBe(35);
    expect(markupFor(rules, 20_000)).toBe(30);
    expect(markupFor(rules, 20_000, 12)).toBe(12);
  });

  it("rejects quantities with no eligible method", () => {
    expect(() => calc("business-card", 60_000)).toThrow(PricingError);
  });
});
