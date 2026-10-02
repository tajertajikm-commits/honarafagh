/**
 * Reference & demo configuration for Honar Afagh.
 *
 * Everything here is ordinary data that managers can change from the panel
 * after seeding. Prices are in rial (approximate 1405 market levels) and are
 * placeholders for the owner's real rates.
 */
import type { Permission } from "@/server/auth/permissions";
import type { OptionEffects, PricingRules, ProductSpec } from "@/server/modules/pricing/types";

// ── Suppliers ───────────────────────────────────────────────────────────────

/** Paper suppliers are phoned for quotes; lithography is outsourced. */
export const SUPPLIERS = [
  { key: "paper-pars", name: "بازرگانی کاغذ پارس", kind: "PAPER", contactName: "آقای رحیمی", phone: "02133912040" },
  { key: "paper-arya", name: "کاغذ آریا", kind: "PAPER", contactName: "آقای صدری", phone: "02133945512" },
  { key: "paper-sepid", name: "پخش کاغذ سپید", kind: "PAPER", contactName: "خانم نیک‌نام", phone: "02166702288" },
  { key: "litho-novin", name: "لیتوگرافی نوین", kind: "LITHO", contactName: "خانم اکبری", phone: "02166754410" },
  { key: "litho-ziba", name: "لیتوگرافی زیبا", kind: "LITHO", contactName: "آقای فرهادی", phone: "02133118870" },
  { key: "consumables", name: "لوازم چاپ آریا", kind: "OTHER", contactName: "آقای کاظمی", phone: "02133990012" },
];

type MaterialSeed = {
  sku: string;
  name: string;
  /** PAPER | CARDBOARD | FILM | UV | BINDING | PLATE | PACKAGING | OTHER */
  category: string;
  unit: string;
  standardCost: number;
  reorderPoint: number;
  reorderQuantity: number;
  supplier: string;
  location: string;
  onHand: number;
  paper?: { paperType: string; brand: string; grammage: number; w: number; h: number; color: string };
};

export const MATERIALS: MaterialSeed[] = [
  // Offset stock: parent sheets 70×100 cm
  { sku: "P-GL135-70", name: "گلاسه ۱۳۵ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 280_000, reorderPoint: 2000, reorderQuantity: 5000, supplier: "paper-pars", location: "MAIN", onHand: 12_000, paper: { paperType: "گلاسه", brand: "APP", grammage: 135, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-GL300-70", name: "گلاسه ۳۰۰ گرم ۷۰×۱۰۰", category: "CARDBOARD", unit: "SHEET", standardCost: 650_000, reorderPoint: 1000, reorderQuantity: 3000, supplier: "paper-pars", location: "MAIN", onHand: 4_500, paper: { paperType: "گلاسه", brand: "APP", grammage: 300, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-TH70-70", name: "تحریر ۷۰ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 120_000, reorderPoint: 3000, reorderQuantity: 10_000, supplier: "paper-pars", location: "MAIN", onHand: 800, paper: { paperType: "تحریر", brand: "چوکا", grammage: 70, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-TH80-70", name: "تحریر ۸۰ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 140_000, reorderPoint: 2000, reorderQuantity: 5000, supplier: "paper-pars", location: "MAIN", onHand: 6_000, paper: { paperType: "تحریر", brand: "چوکا", grammage: 80, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-KT300-70", name: "کتان ۳۰۰ گرم ۷۰×۱۰۰", category: "CARDBOARD", unit: "SHEET", standardCost: 1_200_000, reorderPoint: 300, reorderQuantity: 1000, supplier: "paper-pars", location: "MAIN", onHand: 650, paper: { paperType: "کتان", brand: "Fedrigoni", grammage: 300, w: 1000, h: 700, color: "شیری" } },
  // Digital stock: pre-cut SRA3 (32×45 cm)
  { sku: "P-GL135-SRA3", name: "گلاسه ۱۳۵ گرم SRA3", category: "PAPER", unit: "SHEET", standardCost: 45_000, reorderPoint: 1000, reorderQuantity: 5000, supplier: "paper-pars", location: "DIGI", onHand: 4_000, paper: { paperType: "گلاسه", brand: "APP", grammage: 135, w: 450, h: 320, color: "سفید" } },
  { sku: "P-GL300-SRA3", name: "گلاسه ۳۰۰ گرم SRA3", category: "CARDBOARD", unit: "SHEET", standardCost: 110_000, reorderPoint: 800, reorderQuantity: 3000, supplier: "paper-pars", location: "DIGI", onHand: 2_500, paper: { paperType: "گلاسه", brand: "APP", grammage: 300, w: 450, h: 320, color: "سفید" } },
  { sku: "P-TH80-SRA3", name: "تحریر ۸۰ گرم SRA3", category: "PAPER", unit: "SHEET", standardCost: 25_000, reorderPoint: 2000, reorderQuantity: 10_000, supplier: "paper-pars", location: "DIGI", onHand: 9_000, paper: { paperType: "تحریر", brand: "چوکا", grammage: 80, w: 450, h: 320, color: "سفید" } },
  { sku: "P-KT300-SRA3", name: "کتان ۳۰۰ گرم SRA3", category: "CARDBOARD", unit: "SHEET", standardCost: 200_000, reorderPoint: 300, reorderQuantity: 1000, supplier: "paper-pars", location: "DIGI", onHand: 180, paper: { paperType: "کتان", brand: "Fedrigoni", grammage: 300, w: 450, h: 320, color: "شیری" } },
  { sku: "P-STK-SRA3", name: "کاغذ استیکر گلاسه SRA3", category: "PAPER", unit: "SHEET", standardCost: 150_000, reorderPoint: 500, reorderQuantity: 2000, supplier: "paper-pars", location: "DIGI", onHand: 1_200, paper: { paperType: "استیکر", brand: "Fasson", grammage: 80, w: 450, h: 320, color: "سفید" } },
  // Plates & consumables
  { sku: "PL-CTP-5274", name: "زینک CTP ۵۲×۷۴", category: "PLATE", unit: "PIECE", standardCost: 1_200_000, reorderPoint: 60, reorderQuantity: 200, supplier: "litho-novin", location: "MAIN", onHand: 140 },
  { sku: "F-LAM-GLOSS", name: "فیلم سلفون براق", category: "FILM", unit: "SQM", standardCost: 45_000, reorderPoint: 500, reorderQuantity: 2000, supplier: "consumables", location: "MAIN", onHand: 3_000 },
  { sku: "F-LAM-MATTE", name: "فیلم سلفون مات", category: "FILM", unit: "SQM", standardCost: 55_000, reorderPoint: 500, reorderQuantity: 2000, supplier: "consumables", location: "MAIN", onHand: 2_400 },
  { sku: "V-UV-SPOT", name: "ورنی UV موضعی", category: "UV", unit: "LITER", standardCost: 3_500_000, reorderPoint: 10, reorderQuantity: 40, supplier: "consumables", location: "MAIN", onHand: 28 },
  { sku: "FO-GOLD", name: "فویل طلایی", category: "OTHER", unit: "METER", standardCost: 90_000, reorderPoint: 100, reorderQuantity: 500, supplier: "consumables", location: "MAIN", onHand: 420 },
  { sku: "B-WIRE", name: "سیم دوبل (وایر) A5/A4", category: "BINDING", unit: "PIECE", standardCost: 18_000, reorderPoint: 300, reorderQuantity: 2000, supplier: "consumables", location: "MAIN", onHand: 1_500 },
  { sku: "B-GLUE", name: "چسب گرم صحافی", category: "BINDING", unit: "KG", standardCost: 2_800_000, reorderPoint: 10, reorderQuantity: 50, supplier: "consumables", location: "MAIN", onHand: 35 },
  { sku: "C-IVORY350-SRA3", name: "مقوا ایندربرد ۳۵۰ گرم SRA3", category: "CARDBOARD", unit: "SHEET", standardCost: 160_000, reorderPoint: 400, reorderQuantity: 1500, supplier: "paper-pars", location: "DIGI", onHand: 900 },
  { sku: "C-GREY450-70", name: "مقوا پشت‌طوسی ۴۵۰ گرم ۷۰×۱۰۰", category: "CARDBOARD", unit: "SHEET", standardCost: 520_000, reorderPoint: 300, reorderQuantity: 1000, supplier: "paper-pars", location: "MAIN", onHand: 220 },
  { sku: "PK-SHRINK", name: "نایلون شیرینگ", category: "PACKAGING", unit: "ROLL", standardCost: 1_900_000, reorderPoint: 5, reorderQuantity: 20, supplier: "consumables", location: "MAIN", onHand: 12 },
  { sku: "PK-CARTON", name: "کارتن بسته‌بندی متوسط", category: "PACKAGING", unit: "PIECE", standardCost: 250_000, reorderPoint: 100, reorderQuantity: 500, supplier: "consumables", location: "MAIN", onHand: 380 },
  { sku: "INK-CMYK", name: "مرکب افست CMYK (ست)", category: "OTHER", unit: "KG", standardCost: 9_000_000, reorderPoint: 20, reorderQuantity: 60, supplier: "consumables", location: "MAIN", onHand: 45 },
];

// ── Pricing rules (version 1) ───────────────────────────────────────────────

export const PRICING_RULES: PricingRules = {
  methods: {
    OFFSET: {
      kind: "OFFSET",
      pressSheet: { w: 700, h: 500 },
      margin: { gripper: 12, side: 5 },
      plateSku: "PL-CTP-5274",
      makeReadyCostPerPlate: 1_000_000,
      runCostPer1000PerColor: 1_200_000,
      minRunThousands: 1,
      makeReadyWasteSheetsPerColor: 25,
      runningWastePct: 3,
      leadDays: 6,
      alwaysOperations: ["PREPRESS_OFFSET", "PACKAGING"],
      machineType: "OFFSET_PRESS",
      throughputSheetsPerHour: 8000,
      makeReadyMinutesPerPlate: 10,
      plateMakingMinutesPerPlate: 5,
    },
    DIGITAL: {
      kind: "DIGITAL",
      pressSheet: { w: 450, h: 320 },
      margin: { gripper: 5, side: 5 },
      clickCostColor: 25_000,
      clickCostBlack: 6_000,
      setupCost: 300_000,
      wastePct: 2,
      minWasteSheets: 3,
      leadDays: 2,
      alwaysOperations: ["PREPRESS_DIGITAL", "PACKAGING"],
      machineType: "DIGITAL_PRESS",
      throughputSidesPerHour: 3600,
      setupMinutes: 10,
    },
  },
  operations: {
    PREPRESS_OFFSET: { name: "پیش از چاپ افست (مونتاژ و تفکیک)", stepType: "PREPRESS", basis: "JOB", setupCost: 2_500_000, rate: 0, ratePerLeaf: 0, minCharge: 0, costCategory: "LABOR", consumes: [], minutes: { setup: 45, perBasis: 0 }, leadDays: 0 },
    PREPRESS_DIGITAL: { name: "پیش‌پردازش و RIP", stepType: "PREPRESS", basis: "JOB", setupCost: 500_000, rate: 0, ratePerLeaf: 0, minCharge: 0, costCategory: "LABOR", consumes: [], minutes: { setup: 15, perBasis: 0 }, leadDays: 0 },
    CUTTING: { name: "برش گیوتین", stepType: "CUTTING", basis: "SHEET", setupCost: 300_000, rate: 250, ratePerLeaf: 0, minCharge: 500_000, costCategory: "MACHINE", consumes: [], minutes: { setup: 10, perBasis: 0.01 }, leadDays: 0 },
    PLOTTER_CUTTING: { name: "برش پلاتر (فرم دلخواه)", stepType: "PLOTTER_CUTTING", basis: "SHEET", setupCost: 500_000, rate: 9_000, ratePerLeaf: 0, minCharge: 1_000_000, costCategory: "MACHINE", consumes: [], minutes: { setup: 10, perBasis: 1.2 }, leadDays: 0 },
    LAMINATION_GLOSS: { name: "سلفون براق", stepType: "LAMINATION", basis: "SHEET_SIDE", setupCost: 500_000, rate: 45_000, ratePerLeaf: 0, minCharge: 1_500_000, costCategory: "MACHINE", consumes: [{ sku: "F-LAM-GLOSS", perBasis: 0.35 }], minutes: { setup: 15, perBasis: 0.03 }, leadDays: 0 },
    LAMINATION_MATTE: { name: "سلفون مات", stepType: "LAMINATION", basis: "SHEET_SIDE", setupCost: 500_000, rate: 50_000, ratePerLeaf: 0, minCharge: 1_500_000, costCategory: "MACHINE", consumes: [{ sku: "F-LAM-MATTE", perBasis: 0.35 }], minutes: { setup: 15, perBasis: 0.03 }, leadDays: 0 },
    UV_SPOT: { name: "UV موضعی", stepType: "UV_COATING", basis: "SHEET", setupCost: 2_000_000, rate: 60_000, ratePerLeaf: 0, minCharge: 3_000_000, costCategory: "MACHINE", consumes: [{ sku: "V-UV-SPOT", perBasis: 0.004 }], minutes: { setup: 40, perBasis: 0.05 }, leadDays: 1 },
    FOIL_GOLD: { name: "طلاکوب", stepType: "FOIL_STAMPING", basis: "UNIT", setupCost: 4_000_000, rate: 12_000, ratePerLeaf: 0, minCharge: 5_000_000, costCategory: "MACHINE", consumes: [{ sku: "FO-GOLD", perBasis: 0.06 }], minutes: { setup: 45, perBasis: 0.02 }, leadDays: 1 },
    EMBOSS: { name: "برجسته‌کاری", stepType: "EMBOSSING", basis: "UNIT", setupCost: 3_500_000, rate: 10_000, ratePerLeaf: 0, minCharge: 4_500_000, costCategory: "MACHINE", consumes: [], minutes: { setup: 40, perBasis: 0.02 }, leadDays: 1 },
    CORNER_ROUND: { name: "گردکردن گوشه", stepType: "CORNER_ROUNDING", basis: "UNIT", setupCost: 0, rate: 1_500, ratePerLeaf: 0, minCharge: 300_000, costCategory: "LABOR", consumes: [], minutes: { setup: 5, perBasis: 0.004 }, leadDays: 0 },
    BIND_WIRE: { name: "صحافی سیمی (وایر)", stepType: "BINDING", basis: "UNIT", setupCost: 300_000, rate: 40_000, ratePerLeaf: 250, minCharge: 800_000, costCategory: "LABOR", consumes: [{ sku: "B-WIRE", perBasis: 1 }], minutes: { setup: 10, perBasis: 0.8 }, leadDays: 0 },
    BIND_PERFECT: { name: "صحافی چسب گرم (ته‌چسب)", stepType: "BINDING", basis: "UNIT", setupCost: 800_000, rate: 35_000, ratePerLeaf: 150, minCharge: 1_500_000, costCategory: "MACHINE", consumes: [{ sku: "B-GLUE", perBasis: 0.012 }], minutes: { setup: 20, perBasis: 0.25 }, leadDays: 1 },
    BIND_STITCH: { name: "دوخت منگنه (ته‌دوخت)", stepType: "BINDING", basis: "UNIT", setupCost: 300_000, rate: 6_000, ratePerLeaf: 60, minCharge: 600_000, costCategory: "MACHINE", consumes: [], minutes: { setup: 10, perBasis: 0.05 }, leadDays: 0 },
    PACKAGING: { name: "بسته‌بندی", stepType: "PACKAGING", basis: "UNIT", setupCost: 200_000, rate: 400, ratePerLeaf: 0, minCharge: 300_000, costCategory: "LABOR", consumes: [{ sku: "PK-CARTON", perBasis: 0.002 }], minutes: { setup: 10, perBasis: 0.01 }, leadDays: 0 },
  },
  flagFees: {
    NEEDS_DESIGN: { name: "خدمات طراحی گرافیک", flat: 15_000_000, perUnit: 0, costCategory: "LABOR" },
  },
  markup: {
    tiers: [
      { minQty: 0, pct: 45 },
      { minQty: 500, pct: 40 },
      { minQty: 1000, pct: 35 },
      { minQty: 5000, pct: 30 },
    ],
  },
  urgency: {
    STANDARD: { multiplier: 1, leadDaysFactor: 1, label: "عادی" },
    EXPRESS: { multiplier: 1.25, leadDaysFactor: 0.6, label: "فوری" },
    RUSH: { multiplier: 1.5, leadDaysFactor: 0.4, label: "خیلی فوری" },
  },
  minimumOrderPrice: 5_000_000,
  roundTo: 10_000,
  vatPct: 10,
  materialCosts: {},
};

// ── Workflow templates ──────────────────────────────────────────────────────

// ── Catalog ─────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { slug: "business-cards", name: "کارت ویزیت", description: "کارت ویزیت روی کاغذهای ویژه با انواع روکش", icon: "id-card" },
  { slug: "marketing", name: "تبلیغاتی", description: "تراکت، بروشور و سربرگ", icon: "megaphone" },
  { slug: "stationery", name: "دفتر و نوشت‌افزار", description: "دفترچه، کاتالوگ و چاپ صحافی‌شده", icon: "notebook" },
  { slug: "labels", name: "برچسب و استیکر", description: "استیکر با برش فرم دلخواه", icon: "sticker" },
].map((c, i) => ({ ...c, sortOrder: i }));

interface OptionValueSeed {
  key: string;
  label: string;
  description?: string;
  effects: OptionEffects;
  isDefault?: boolean;
}
interface OptionGroupSeed {
  key: string;
  label: string;
  helpText?: string;
  type: "SELECT" | "NUMBER" | "TOGGLE";
  required: boolean;
  config?: Record<string, unknown>;
  values: OptionValueSeed[];
}
export interface ProductSeed {
  slug: string;
  category: string;
  name: string;
  subtitle: string;
  description: string;
  unitLabel: string;
  minQuantity: number;
  maxQuantity: number | null;
  quantityStep: number;
  quantityPresets: number[];
  isFeatured: boolean;
  highlights: string[];
  image: string;
  spec: ProductSpec;
  methods: { methodCode: "DIGITAL" | "OFFSET"; minQuantity: number; maxQuantity: number | null }[];
  groups: OptionGroupSeed[];
}

const paperOption = (component: string, choices: { key: string; label: string; offset: string; digital: string; description?: string }[], defaultKey: string): OptionGroupSeed => ({
  key: component === "main" ? "paper" : `${component}_paper`,
  label: component === "main" ? "جنس کاغذ" : component === "cover" ? "کاغذ جلد" : "کاغذ صفحات داخلی",
  type: "SELECT",
  required: true,
  values: choices.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    isDefault: c.key === defaultKey,
    effects: { material: { component, byMethod: { OFFSET: c.offset, DIGITAL: c.digital } } },
  })),
});

const designOption: OptionGroupSeed = {
  key: "design",
  label: "فایل طرح",
  type: "SELECT",
  required: true,
  values: [
    { key: "own", label: "فایل آماده دارم", isDefault: true, effects: {} },
    { key: "service", label: "طراحی توسط هنر آفاق", description: "طراح ما با شما هماهنگ می‌کند", effects: { flags: ["NEEDS_DESIGN"], leadDays: 2 } },
  ],
};

export const PRODUCTS: ProductSeed[] = [
  {
    slug: "business-card",
    category: "business-cards",
    name: "کارت ویزیت",
    subtitle: "اولین برداشت، ماندگار",
    description: "کارت ویزیت با کیفیت چاپ افست یا دیجیتال روی گلاسه یا کتان ۳۰۰ گرم. برای تیراژهای کم با چاپ دیجیتال و برای تیراژ بالا با چاپ افست تولید می‌شود؛ سیستم به‌صورت خودکار مقرون‌به‌صرفه‌ترین روش را انتخاب می‌کند.",
    unitLabel: "عدد",
    minQuantity: 100,
    maxQuantity: 50_000,
    quantityStep: 100,
    quantityPresets: [500, 1000, 2000, 5000],
    isFeatured: true,
    highlights: ["ابعاد استاندارد ۸٫۵×۵ سانتی‌متر", "سلفون مات یا براق", "گوشه گرد و UV موضعی"],
    image: "/catalog/business-card.svg",
    spec: {
      defaultTrim: { w: 85, h: 50 },
      components: [{ key: "main", name: "کارت", leaf: "TRIM", leaves: { mode: "FIXED", count: 1 }, bleedMm: 2, defaults: { colorsFront: 4, colorsBack: 0 } }],
      baseOperations: [{ code: "CUTTING" }],
      methodSelection: "CHEAPEST",
    },
    methods: [
      { methodCode: "DIGITAL", minQuantity: 100, maxQuantity: 3000 },
      { methodCode: "OFFSET", minQuantity: 1000, maxQuantity: null },
    ],
    groups: [
      paperOption("main", [
        { key: "gl300", label: "گلاسه ۳۰۰ گرم", offset: "P-GL300-70", digital: "P-GL300-SRA3" },
        { key: "kt300", label: "کتان ۳۰۰ گرم", description: "بافت‌دار و لوکس", offset: "P-KT300-70", digital: "P-KT300-SRA3" },
      ], "gl300"),
      {
        key: "sides",
        label: "چاپ",
        type: "SELECT",
        required: true,
        values: [
          { key: "4-0", label: "یک‌رو رنگی", isDefault: true, effects: { colors: { component: "main", front: 4, back: 0 } } },
          { key: "4-4", label: "دو رو رنگی", effects: { colors: { component: "main", front: 4, back: 4 } } },
        ],
      },
      {
        key: "lamination",
        label: "روکش سلفون",
        type: "SELECT",
        required: true,
        values: [
          { key: "none", label: "بدون روکش", isDefault: true, effects: {} },
          { key: "matte", label: "سلفون مات دو رو", effects: { operations: [{ code: "LAMINATION_MATTE", sides: 2 }] } },
          { key: "gloss", label: "سلفون براق دو رو", effects: { operations: [{ code: "LAMINATION_GLOSS", sides: 2 }] } },
        ],
      },
      { key: "spot_uv", label: "UV موضعی", helpText: "برجستگی براق روی بخش‌هایی از طرح", type: "TOGGLE", required: false, values: [{ key: "on", label: "UV موضعی", effects: { operations: [{ code: "UV_SPOT" }] } }] },
      { key: "corners", label: "گوشه گرد", type: "TOGGLE", required: false, values: [{ key: "on", label: "گوشه گرد", effects: { operations: [{ code: "CORNER_ROUND" }] } }] },
      designOption,
    ],
  },
  {
    slug: "flyer",
    category: "marketing",
    name: "تراکت و پوستر کوچک",
    subtitle: "معرفی سریع کسب‌وکار شما",
    description: "تراکت تبلیغاتی در قطع‌های A6 تا A4 روی گلاسه ۱۳۵ گرم یا تحریر. مناسب توزیع گسترده، منو و اطلاع‌رسانی.",
    unitLabel: "برگ",
    minQuantity: 50,
    maxQuantity: 100_000,
    quantityStep: 50,
    quantityPresets: [500, 1000, 2500, 5000, 10000],
    isFeatured: true,
    highlights: ["قطع A6، A5 و A4", "یک‌رو یا دو رو رنگی", "تحویل سریع دیجیتال برای تیراژ کم"],
    image: "/catalog/flyer.svg",
    spec: {
      defaultTrim: { w: 148, h: 210 },
      components: [{ key: "main", name: "تراکت", leaf: "TRIM", leaves: { mode: "FIXED", count: 1 }, bleedMm: 3, defaults: { colorsFront: 4, colorsBack: 0 } }],
      baseOperations: [{ code: "CUTTING" }],
      methodSelection: "CHEAPEST",
    },
    methods: [
      { methodCode: "DIGITAL", minQuantity: 50, maxQuantity: 1500 },
      { methodCode: "OFFSET", minQuantity: 500, maxQuantity: null },
    ],
    groups: [
      {
        key: "size",
        label: "قطع",
        type: "SELECT",
        required: true,
        values: [
          { key: "a6", label: "A6 (۱۰٫۵×۱۴٫۸)", effects: { trim: { w: 105, h: 148 } } },
          { key: "a5", label: "A5 (۱۴٫۸×۲۱)", isDefault: true, effects: { trim: { w: 148, h: 210 } } },
          { key: "a4", label: "A4 (۲۱×۲۹٫۷)", effects: { trim: { w: 210, h: 297 } } },
        ],
      },
      paperOption("main", [
        { key: "gl135", label: "گلاسه ۱۳۵ گرم", offset: "P-GL135-70", digital: "P-GL135-SRA3" },
        { key: "th80", label: "تحریر ۸۰ گرم", offset: "P-TH80-70", digital: "P-TH80-SRA3" },
      ], "gl135"),
      {
        key: "sides",
        label: "چاپ",
        type: "SELECT",
        required: true,
        values: [
          { key: "4-0", label: "یک‌رو رنگی", isDefault: true, effects: { colors: { component: "main", front: 4, back: 0 } } },
          { key: "4-4", label: "دو رو رنگی", effects: { colors: { component: "main", front: 4, back: 4 } } },
          { key: "1-0", label: "یک‌رو تک‌رنگ", effects: { colors: { component: "main", front: 1, back: 0 } } },
        ],
      },
      designOption,
    ],
  },
  {
    slug: "notebook",
    category: "stationery",
    name: "دفترچه سیمی و ته‌چسب",
    subtitle: "دفتر اختصاصی با برند شما",
    description: "دفترچه با جلد رنگی ۳۰۰ گرم و صفحات داخلی تحریر، با صحافی سیمی یا ته‌چسب. مناسب هدایای سازمانی، همایش‌ها و مدارس.",
    unitLabel: "جلد",
    minQuantity: 10,
    maxQuantity: 20_000,
    quantityStep: 10,
    quantityPresets: [50, 100, 300, 1000],
    isFeatured: true,
    highlights: ["جلد رنگی با سلفون", "۴۰ تا ۲۰۰ صفحه", "صحافی سیمی یا ته‌چسب"],
    image: "/catalog/notebook.svg",
    spec: {
      defaultTrim: { w: 148, h: 210 },
      components: [
        { key: "cover", name: "جلد", leaf: "TRIM", leaves: { mode: "FIXED", count: 2 }, bleedMm: 3, defaults: { colorsFront: 4, colorsBack: 0 } },
        { key: "inner", name: "صفحات داخلی", leaf: "TRIM", leaves: { mode: "FROM_PAGES", pagesOption: "pages", pagesPerLeaf: 2 }, bleedMm: 0, defaults: { colorsFront: 1, colorsBack: 1 } },
      ],
      baseOperations: [{ code: "CUTTING", component: "inner" }],
      methodSelection: "CHEAPEST",
    },
    methods: [
      { methodCode: "DIGITAL", minQuantity: 10, maxQuantity: 300 },
      { methodCode: "OFFSET", minQuantity: 100, maxQuantity: null },
    ],
    groups: [
      {
        key: "size",
        label: "قطع",
        type: "SELECT",
        required: true,
        values: [
          { key: "a5", label: "A5 (۱۴٫۸×۲۱)", isDefault: true, effects: { trim: { w: 148, h: 210 } } },
          { key: "a4", label: "A4 (۲۱×۲۹٫۷)", effects: { trim: { w: 210, h: 297 } } },
        ],
      },
      { key: "pages", label: "تعداد صفحات داخلی", helpText: "هر برگ دو صفحه است", type: "NUMBER", required: true, config: { min: 40, max: 200, step: 20, default: 100, unit: "صفحه", effect: "PAGES", component: "inner" }, values: [] },
      paperOption("cover", [
        { key: "gl300", label: "گلاسه ۳۰۰ گرم", offset: "P-GL300-70", digital: "P-GL300-SRA3" },
        { key: "kt300", label: "کتان ۳۰۰ گرم", offset: "P-KT300-70", digital: "P-KT300-SRA3" },
      ], "gl300"),
      {
        key: "inner_print",
        label: "صفحات داخلی",
        type: "SELECT",
        required: true,
        values: [
          { key: "lined", label: "خط‌دار (چاپ تک‌رنگ)", isDefault: true, effects: { colors: { component: "inner", front: 1, back: 1 } } },
          { key: "blank", label: "سفید بدون چاپ", effects: { colors: { component: "inner", front: 0, back: 0 } } },
          { key: "color", label: "چاپ رنگی", effects: { colors: { component: "inner", front: 4, back: 4 } } },
        ],
      },
      paperOption("inner", [
        { key: "th70", label: "تحریر ۷۰ گرم", offset: "P-TH70-70", digital: "P-TH80-SRA3" },
        { key: "th80", label: "تحریر ۸۰ گرم", offset: "P-TH80-70", digital: "P-TH80-SRA3" },
      ], "th70"),
      {
        key: "cover_lamination",
        label: "روکش جلد",
        type: "SELECT",
        required: true,
        values: [
          { key: "matte", label: "سلفون مات", isDefault: true, effects: { operations: [{ code: "LAMINATION_MATTE", component: "cover" }] } },
          { key: "gloss", label: "سلفون براق", effects: { operations: [{ code: "LAMINATION_GLOSS", component: "cover" }] } },
          { key: "none", label: "بدون روکش", effects: {} },
        ],
      },
      {
        key: "binding",
        label: "صحافی",
        type: "SELECT",
        required: true,
        values: [
          { key: "wire", label: "سیمی (وایر)", isDefault: true, effects: { operations: [{ code: "BIND_WIRE", component: "inner" }] } },
          { key: "perfect", label: "ته‌چسب", effects: { operations: [{ code: "BIND_PERFECT", component: "inner" }] } },
        ],
      },
      designOption,
    ],
  },
  {
    slug: "catalog",
    category: "stationery",
    name: "کاتالوگ و بروشور چندصفحه‌ای",
    subtitle: "معرفی کامل محصولات",
    description: "کاتالوگ منگنه‌ای یا ته‌چسب با صفحات رنگی گلاسه و جلد ضخیم. مناسب معرفی محصولات و گزارش سالانه.",
    unitLabel: "جلد",
    minQuantity: 20,
    maxQuantity: 20_000,
    quantityStep: 10,
    quantityPresets: [100, 250, 500, 1000],
    isFeatured: false,
    highlights: ["۸ تا ۶۴ صفحه رنگی", "جلد ۳۰۰ گرم با سلفون", "منگنه یا ته‌چسب"],
    image: "/catalog/catalog.svg",
    spec: {
      defaultTrim: { w: 210, h: 297 },
      components: [
        { key: "cover", name: "جلد", leaf: "SPREAD", leaves: { mode: "FIXED", count: 1 }, bleedMm: 3, defaults: { colorsFront: 4, colorsBack: 0 } },
        { key: "inner", name: "صفحات داخلی", leaf: "TRIM", leaves: { mode: "FROM_PAGES", pagesOption: "pages", pagesPerLeaf: 2 }, bleedMm: 3, defaults: { colorsFront: 4, colorsBack: 4 } },
      ],
      baseOperations: [{ code: "CUTTING", component: "inner" }],
      methodSelection: "CHEAPEST",
    },
    methods: [
      { methodCode: "DIGITAL", minQuantity: 20, maxQuantity: 300 },
      { methodCode: "OFFSET", minQuantity: 200, maxQuantity: null },
    ],
    groups: [
      { key: "pages", label: "تعداد صفحات داخلی", type: "NUMBER", required: true, config: { min: 8, max: 64, step: 4, default: 16, unit: "صفحه", effect: "PAGES", component: "inner" }, values: [] },
      {
        key: "binding",
        label: "صحافی",
        type: "SELECT",
        required: true,
        values: [
          { key: "stitch", label: "منگنه (ته‌دوخت)", isDefault: true, effects: { operations: [{ code: "BIND_STITCH", component: "inner" }] } },
          { key: "perfect", label: "ته‌چسب", effects: { operations: [{ code: "BIND_PERFECT", component: "inner" }] } },
        ],
      },
      {
        key: "cover_lamination",
        label: "روکش جلد",
        type: "SELECT",
        required: true,
        values: [
          { key: "gloss", label: "سلفون براق", isDefault: true, effects: { operations: [{ code: "LAMINATION_GLOSS", component: "cover" }] } },
          { key: "matte", label: "سلفون مات", effects: { operations: [{ code: "LAMINATION_MATTE", component: "cover" }] } },
        ],
      },
      designOption,
    ],
  },
  {
    slug: "letterhead",
    category: "marketing",
    name: "سربرگ اداری",
    subtitle: "هویت رسمی مکاتبات",
    description: "سربرگ A4 و A5 روی تحریر ۸۰ گرم، مناسب چاپگرهای لیزری و جوهرافشان.",
    unitLabel: "برگ",
    minQuantity: 100,
    maxQuantity: 50_000,
    quantityStep: 100,
    quantityPresets: [500, 1000, 2000, 5000],
    isFeatured: false,
    highlights: ["تحریر ۸۰ گرم", "سازگار با پرینتر", "A4 یا A5"],
    image: "/catalog/letterhead.svg",
    spec: {
      defaultTrim: { w: 210, h: 297 },
      components: [{ key: "main", name: "سربرگ", leaf: "TRIM", leaves: { mode: "FIXED", count: 1 }, bleedMm: 3, defaults: { colorsFront: 4, colorsBack: 0, material: undefined } }],
      baseOperations: [{ code: "CUTTING" }],
      methodSelection: "CHEAPEST",
    },
    methods: [
      { methodCode: "DIGITAL", minQuantity: 100, maxQuantity: 1000 },
      { methodCode: "OFFSET", minQuantity: 500, maxQuantity: null },
    ],
    groups: [
      {
        key: "size",
        label: "قطع",
        type: "SELECT",
        required: true,
        values: [
          { key: "a4", label: "A4", isDefault: true, effects: { trim: { w: 210, h: 297 } } },
          { key: "a5", label: "A5", effects: { trim: { w: 148, h: 210 } } },
        ],
      },
      paperOption("main", [{ key: "th80", label: "تحریر ۸۰ گرم", offset: "P-TH80-70", digital: "P-TH80-SRA3" }], "th80"),
      designOption,
    ],
  },
  {
    slug: "sticker",
    category: "labels",
    name: "استیکر و لیبل",
    subtitle: "برش فرم دلخواه",
    description: "استیکر کاغذی گلاسه با چاپ دیجیتال و برش پلاتر به هر شکلی که بخواهید. مناسب بسته‌بندی و برندینگ محصولات.",
    unitLabel: "عدد",
    minQuantity: 50,
    maxQuantity: 10_000,
    quantityStep: 50,
    quantityPresets: [100, 250, 500, 1000],
    isFeatured: true,
    highlights: ["برش پلاتر با هر فرم", "کاغذ استیکر گلاسه", "ابعاد سفارشی"],
    image: "/catalog/sticker.svg",
    spec: {
      defaultTrim: { w: 50, h: 50 },
      components: [{ key: "main", name: "استیکر", leaf: "TRIM", leaves: { mode: "FIXED", count: 1 }, bleedMm: 2, defaults: { colorsFront: 4, colorsBack: 0, material: "P-STK-SRA3" } }],
      baseOperations: [{ code: "PLOTTER_CUTTING" }],
      methodSelection: "PRIORITY",
    },
    methods: [{ methodCode: "DIGITAL", minQuantity: 50, maxQuantity: null }],
    groups: [
      {
        key: "size",
        label: "ابعاد",
        type: "SELECT",
        required: true,
        values: [
          { key: "s50", label: "۵×۵ سانتی‌متر", isDefault: true, effects: { trim: { w: 50, h: 50 } } },
          { key: "s70", label: "۷×۷ سانتی‌متر", effects: { trim: { w: 70, h: 70 } } },
          { key: "s100", label: "۱۰×۱۰ سانتی‌متر", effects: { trim: { w: 100, h: 100 } } },
          { key: "custom", label: "ابعاد دلخواه", effects: { customTrim: true } },
        ],
      },
      { key: "width", label: "عرض (میلی‌متر)", type: "NUMBER", required: false, config: { min: 20, max: 300, step: 1, default: 60, unit: "میلی‌متر", effect: "TRIM_W" }, values: [] },
      { key: "height", label: "ارتفاع (میلی‌متر)", type: "NUMBER", required: false, config: { min: 20, max: 420, step: 1, default: 60, unit: "میلی‌متر", effect: "TRIM_H" }, values: [] },
      {
        key: "finish",
        label: "روکش",
        type: "SELECT",
        required: true,
        values: [
          { key: "none", label: "بدون روکش", isDefault: true, effects: {} },
          { key: "gloss", label: "سلفون براق", effects: { operations: [{ code: "LAMINATION_GLOSS" }] } },
        ],
      },
      designOption,
    ],
  },
];


// ── Roles & people ──────────────────────────────────────────────────────────

const P = (...codes: Permission[]) => codes;

/**
 * Roles follow the real responsibilities. A person can hold several roles;
 * permissions can be changed from the panel (کارکنان و نقش‌ها).
 */
export const ROLES: { code: string; name: string; description: string; permissions: Permission[] }[] = [
  {
    code: "MANAGER",
    name: "مدیر",
    description: "تأیید سفارش‌ها، تأیید کیفیت افست، انتخاب تأمین‌کننده کاغذ، دید کامل",
    permissions: P(
      "dashboard.view", "order.view", "order.create", "order.approve.digital", "order.approve.offset", "order.price", "order.priority", "order.cancel",
      "artwork.review", "digital.queue", "offset.queue", "offset.paper.approve", "offset.quality",
      "customer.view", "customer.manage", "payment.view", "payment.record", "invoice.manage",
      "inventory.manage", "catalog.manage", "employee.manage", "audit.view", "settings.manage",
    ),
  },
  {
    code: "DIGITAL_MANAGER",
    name: "مدیر دیجیتال",
    description: "تأیید سفارش‌های دیجیتال، تولید، کیفیت نهایی، بسته‌بندی و ارسال دیجیتال",
    permissions: P("order.approve.digital", "order.priority", "artwork.review", "digital.queue", "digital.production", "digital.quality", "digital.dispatch"),
  },
  {
    code: "DIGITAL_OPERATOR",
    name: "اپراتور دیجیتال",
    description: "اجرای ایستگاه‌های تولید دیجیتال",
    permissions: P("digital.queue", "digital.production"),
  },
  {
    code: "ACCOUNTANT",
    name: "حسابدار",
    description: "مشتریان، پرداخت‌ها و فاکتورها؛ تأیید سفارش‌های افست",
    permissions: P("order.view", "order.create", "order.approve.offset", "order.price", "offset.queue", "customer.view", "customer.manage", "payment.view", "payment.record", "invoice.manage"),
  },
  {
    code: "OFFSET_MANAGER",
    name: "مدیر لیتوگرافی و افست",
    description: "تأیید سفارش‌های افست، لیتوگرافی، استعلام کاغذ، تعیین ماشین، پس از چاپ و ارسال",
    permissions: P("order.approve.offset", "order.priority", "artwork.review", "offset.queue", "offset.litho", "offset.paper", "offset.press.assign", "offset.postpress", "offset.shipping", "inventory.manage"),
  },
  {
    code: "OFFSET_PRODUCTION",
    name: "تولید افست",
    description: "تعیین ماشین و چاپ افست، پس از چاپ، بسته‌بندی و ارسال",
    permissions: P("offset.queue", "offset.press.assign", "offset.print", "offset.postpress", "offset.packaging", "offset.shipping"),
  },
  {
    code: "DESIGNER",
    name: "طراح",
    description: "طراحی سفارش‌هایی که مشتری طراحی خواسته است",
    permissions: P("design.work", "artwork.review"),
  },
];

/** Demo phone numbers; the names are the printing house's real staff. */
export const EMPLOYEES = [
  { key: "hamed", phone: "09120000001", fullName: "حامد نورصالحی", code: "E001", title: "مدیر", roles: ["MANAGER"] },
  { key: "labafi", phone: "09120000002", fullName: "آقای لبافی", code: "E002", title: "مدیر دیجیتال", roles: ["DIGITAL_MANAGER"] },
  { key: "azad", phone: "09120000003", fullName: "خانم آزاد", code: "E003", title: "اپراتور دیجیتال", roles: ["DIGITAL_OPERATOR"] },
  { key: "abdali", phone: "09120000004", fullName: "حسین عبدالی", code: "E004", title: "حسابدار", roles: ["ACCOUNTANT"] },
  { key: "gholipour", phone: "09120000005", fullName: "آقای قلی‌پور", code: "E005", title: "مدیر لیتوگرافی و افست", roles: ["OFFSET_MANAGER"] },
  { key: "hajghasemi", phone: "09120000006", fullName: "مجتبی حاج‌قاسمی", code: "E006", title: "مسئول چاپ و تولید افست", roles: ["OFFSET_PRODUCTION"] },
  { key: "memarian", phone: "09120000007", fullName: "آقای معماریان", code: "E007", title: "مسئول طراحی", roles: ["DESIGNER"] },
] as const;

/** Demo staff password (DEMO_MODE only; shown on the panel login page). */
export const DEMO_STAFF_PASSWORD = "honar1405";

export const MACHINES = [
  { code: "OFF-1C", name: "ماشین تک‌رنگ GTO", category: "ONE_COLOR" as const },
  { code: "OFF-4C", name: "هایدلبرگ SM74 چهاررنگ", category: "FOUR_COLOR" as const },
  { code: "OFF-8C", name: "کوموری لیتریون هشت‌رنگ", category: "EIGHT_COLOR" as const },
  { code: "DIG-01", name: "زیراکس Versant 280", category: "DIGITAL" as const },
  { code: "DIG-02", name: "کونیکا AccurioPress C4080", category: "DIGITAL" as const },
];

/** Delivery choices offered at checkout; the shipment records what really happened. */
export const DELIVERY_METHODS = [
  { code: "PICKUP", name: "تحویل حضوری از چاپخانه", description: "خیابان جمهوری، کوچه چاپخانه، پلاک ۱۲", method: "PICKUP" as const, baseFee: 0 },
  { code: "COURIER", name: "پیک هنر آفاق (تهران)", description: "ارسال با پیک چاپخانه ظرف ۲۴ ساعت", method: "COURIER" as const, baseFee: 1_500_000 },
  { code: "POST", name: "پست پیشتاز", description: "ارسال به سراسر کشور", method: "POST" as const, baseFee: 1_200_000 },
  { code: "EXTERNAL", name: "باربری / تیپاکس", description: "ارسال سریع بین‌شهری", method: "EXTERNAL" as const, baseFee: 2_000_000 },
  { code: "CUSTOMER_COURIER", name: "پیک مشتری", description: "پیک خودتان سفارش را تحویل می‌گیرد", method: "CUSTOMER_COURIER" as const, baseFee: 0 },
];

type Template = { eventType: string; channel: "SMS" | "IN_APP"; audience: "CUSTOMER" | "STAFF"; permission?: string; title: string; body: string };
const customer = (eventType: string, title: string, body: string, sms?: string): Template[] => [
  { eventType, channel: "IN_APP", audience: "CUSTOMER", title, body },
  ...(sms ? [{ eventType, channel: "SMS" as const, audience: "CUSTOMER" as const, title, body: `هنر آفاق: ${sms}` }] : []),
];
/** `{type}` in a permission is replaced by digital/offset from the order. */
const staff = (eventType: string, permission: string, title: string, body: string): Template => ({ eventType, channel: "IN_APP", audience: "STAFF", permission, title, body });

export const NOTIFICATION_TEMPLATES: Template[] = [
  ...customer("OrderSubmitted", "سفارش ثبت شد", "سفارش {{orderCode}} ثبت شد و در انتظار تأیید است.", "سفارش {{orderCode}} ثبت شد. پیگیری: {{link}}"),
  ...customer("OrderApproved", "سفارش تأیید شد", "سفارش {{orderCode}} تأیید شد و به‌زودی آماده‌سازی آن آغاز می‌شود.", "سفارش {{orderCode}} تأیید شد."),
  ...customer("OrderNeedsInfo", "نیاز به اطلاعات بیشتر", "برای سفارش {{orderCode}} به توضیح بیشتری نیاز داریم: {{note}}", "برای سفارش {{orderCode}} به توضیح بیشتری نیاز داریم. لطفاً به حساب کاربری مراجعه کنید: {{link}}"),
  ...customer("OrderRejected", "سفارش پذیرفته نشد", "سفارش {{orderCode}} پذیرفته نشد: {{note}}", "متأسفانه سفارش {{orderCode}} پذیرفته نشد. جزئیات: {{link}}"),
  ...customer("ArtworkNeedsCorrection", "فایل نیاز به اصلاح دارد", "فایل سفارش {{orderCode}} نیاز به اصلاح دارد: {{note}}", "فایل سفارش {{orderCode}} نیاز به اصلاح دارد: {{link}}"),
  ...customer("OrderPriced", "مبلغ سفارش تعیین شد", "مبلغ سفارش {{orderCode}}: {{amount}}. می‌توانید از حساب کاربری پرداخت کنید."),
  ...customer("PaymentReceived", "پرداخت موفق", "مبلغ {{amount}} برای سفارش {{orderCode}} دریافت شد.", "مبلغ {{amount}} برای سفارش {{orderCode}} دریافت شد. سپاس از شما."),
  ...customer("OrderReady", "سفارش آماده است", "سفارش {{orderCode}} آماده شد.", "سفارش {{orderCode}} آماده است."),
  ...customer("OrderShipped", "سفارش ارسال شد", "سفارش {{orderCode}} ارسال شد. {{trackingText}}", "سفارش {{orderCode}} ارسال شد. {{trackingText}}"),
  ...customer("OrderDelivered", "سفارش تحویل شد", "سفارش {{orderCode}} تحویل شد. از اعتماد شما سپاسگزاریم.", "سفارش {{orderCode}} تحویل شد. سپاسگزاریم."),
  staff("OrderSubmitted", "order.approve.{type}", "سفارش جدید در انتظار تأیید", "سفارش {{orderCode}} از {{customerName}} منتظر تأیید شماست."),
  staff("CustomerReplied", "order.approve.{type}", "پاسخ مشتری", "مشتری برای سفارش {{orderCode}} توضیح فرستاد."),
  staff("ArtworkUploaded", "artwork.review", "فایل جدید برای بررسی", "فایل جدیدی برای سفارش {{orderCode}} بارگذاری شد."),
  staff("DesignAssigned", "design.work", "طراحی جدید", "طراحی سفارش {{orderCode}} به شما سپرده شد."),
  staff("QualityCheckNeeded", "{type}.quality", "در انتظار تأیید کیفیت", "سفارش {{orderCode}} منتظر تأیید کیفیت ({{stepName}}) است."),
  staff("PaperDecisionNeeded", "offset.paper.approve", "انتخاب تأمین‌کننده کاغذ", "قیمت‌های کاغذ سفارش {{orderCode}} ثبت شد و منتظر انتخاب شماست."),
  staff("PaymentAwaitingApproval", "payment.record", "پرداخت در انتظار تأیید", "یک پرداخت برای سفارش {{orderCode}} منتظر تأیید است."),
];

/** Seller information on invoices is configurable (تنظیمات). */
export const DEFAULT_SETTINGS = {
  business: {
    name: "چاپخانه هنر آفاق",
    legalName: "شرکت چاپ و نشر هنر آفاق",
    phone: "021-33912000",
    address: "تهران، خیابان جمهوری، کوچه چاپخانه، پلاک ۱۲",
    postalCode: "1131733561",
    economicCode: "411111111111",
    nationalId: "10101234567",
    registrationNo: "123456",
  },
  invoice: { vatPct: 10, paymentTerms: "تسویه کامل پیش از تحویل سفارش", officialNote: "این فاکتور بدون مهر و امضای فروشنده فاقد اعتبار است." },
};
