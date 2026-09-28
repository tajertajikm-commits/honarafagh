/**
 * Reference & demo configuration for Honar Afagh.
 *
 * Everything here is ordinary data that managers can change from the panel
 * after seeding. Prices are in rial (approximate 1405 market levels) and are
 * placeholders for the owner's real rates.
 */
import type { Permission } from "@/server/auth/permissions";
import type { OptionEffects, PricingRules, ProductSpec } from "@/server/modules/pricing/types";
import type { TemplateStepInput } from "@/server/modules/workflow/types";

// ── Production methods, machine types, step types ───────────────────────────

export const PRODUCTION_METHODS = [
  { code: "OFFSET", name: "چاپ افست", description: "تیراژ بالا، زینک و ماشین ورقی چهاررنگ", sortOrder: 1 },
  { code: "DIGITAL", name: "چاپ دیجیتال", description: "تیراژ پایین و فوری، بدون زینک", sortOrder: 2 },
];

export const MACHINE_TYPES = [
  { code: "CTP", name: "زینک‌ساز CTP", capacityUnit: "PLATE" },
  { code: "OFFSET_PRESS", name: "ماشین چاپ افست", capacityUnit: "SHEET" },
  { code: "DIGITAL_PRESS", name: "ماشین چاپ دیجیتال", capacityUnit: "SIDE" },
  { code: "GUILLOTINE", name: "گیوتین برش", capacityUnit: "LIFT" },
  { code: "LAMINATOR", name: "دستگاه سلفون", capacityUnit: "SHEET" },
  { code: "UV_COATER", name: "دستگاه UV", capacityUnit: "SHEET" },
  { code: "FOIL_STAMPER", name: "دستگاه طلاکوب و برجسته", capacityUnit: "UNIT" },
  { code: "DIE_CUTTER", name: "دستگاه قالب‌برش", capacityUnit: "SHEET" },
  { code: "PLOTTER", name: "کاتر پلاتر", capacityUnit: "SHEET" },
  { code: "BINDER", name: "دستگاه صحافی", capacityUnit: "UNIT" },
];

export const STEP_TYPES = [
  { code: "DESIGN", name: "طراحی", category: "DESIGN", machineTypeCode: null, color: "#8B5CF6" },
  { code: "GATE_FILE", name: "تأیید فایل", category: "GATE", machineTypeCode: null, color: "#64748B" },
  { code: "GATE_MATERIAL", name: "آماده‌بودن مواد", category: "GATE", machineTypeCode: null, color: "#64748B" },
  { code: "GATE_PAYMENT", name: "کنترل پیش‌پرداخت", category: "GATE", machineTypeCode: null, color: "#64748B" },
  { code: "PREPRESS", name: "پیش از چاپ", category: "PREPRESS", machineTypeCode: null, color: "#0EA5E9" },
  { code: "PLATE_MAKING", name: "زینک‌سازی", category: "PREPRESS", machineTypeCode: "CTP", color: "#0284C7" },
  { code: "PAPER_CUTTING", name: "برش کاغذ", category: "PREPRESS", machineTypeCode: "GUILLOTINE", color: "#0369A1" },
  { code: "OFFSET_PRINTING", name: "چاپ افست", category: "PRINTING", machineTypeCode: "OFFSET_PRESS", color: "#F26422" },
  { code: "DIGITAL_PRINTING", name: "چاپ دیجیتال", category: "PRINTING", machineTypeCode: "DIGITAL_PRESS", color: "#ED1D26" },
  { code: "QC", name: "کنترل کیفیت", category: "QC", machineTypeCode: null, color: "#16A34A" },
  { code: "LAMINATION", name: "سلفون / لمینیت", category: "FINISHING", machineTypeCode: "LAMINATOR", color: "#FDB913" },
  { code: "UV_COATING", name: "پوشش UV", category: "FINISHING", machineTypeCode: "UV_COATER", color: "#EAB308" },
  { code: "CUTTING", name: "برش", category: "FINISHING", machineTypeCode: "GUILLOTINE", color: "#CA8A04" },
  { code: "FOIL_STAMPING", name: "طلاکوب", category: "FINISHING", machineTypeCode: "FOIL_STAMPER", color: "#A16207" },
  { code: "EMBOSSING", name: "برجسته‌کاری", category: "FINISHING", machineTypeCode: "FOIL_STAMPER", color: "#A16207" },
  { code: "DIE_CUTTING", name: "قالب‌برش", category: "FINISHING", machineTypeCode: "DIE_CUTTER", color: "#854D0E" },
  { code: "PLOTTER_CUTTING", name: "برش پلاتر", category: "FINISHING", machineTypeCode: "PLOTTER", color: "#854D0E" },
  { code: "CORNER_ROUNDING", name: "گردکردن گوشه", category: "FINISHING", machineTypeCode: null, color: "#92400E" },
  { code: "BINDING", name: "صحافی", category: "FINISHING", machineTypeCode: "BINDER", color: "#78350F" },
  { code: "PACKAGING", name: "بسته‌بندی", category: "PACKAGING", machineTypeCode: null, color: "#475569" },
].map((s, i) => ({ ...s, sortOrder: i }));

// ── Materials ───────────────────────────────────────────────────────────────

export const MATERIAL_CATEGORIES = [
  { code: "PAPER", name: "کاغذ و مقوا" },
  { code: "PLATE", name: "زینک" },
  { code: "INK", name: "مرکب و تونر" },
  { code: "FILM", name: "فیلم سلفون" },
  { code: "VARNISH", name: "ورنی و UV" },
  { code: "FOIL", name: "فویل" },
  { code: "BINDING", name: "ملزومات صحافی" },
  { code: "PACKAGING", name: "بسته‌بندی" },
].map((c, i) => ({ ...c, sortOrder: i }));

export const LOCATIONS = [
  { code: "MAIN", name: "انبار اصلی", description: "طبقه همکف، کنار سالن چاپ" },
  { code: "DIGI", name: "انبار دیجیتال", description: "قفسه‌های سالن دیجیتال" },
];

export const SUPPLIERS = [
  { key: "paper", name: "بازرگانی کاغذ پارس", contactName: "آقای رحیمی", phone: "02133912040", leadTimeDays: 2 },
  { key: "plate", name: "صنایع زینک‌سازی نوین", contactName: "خانم اکبری", phone: "02166754410", leadTimeDays: 3 },
  { key: "consumables", name: "لوازم چاپ آریا", contactName: "آقای کاظمی", phone: "02133990012", leadTimeDays: 4 },
];

type MaterialSeed = {
  sku: string;
  name: string;
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
  { sku: "P-GL135-70", name: "گلاسه ۱۳۵ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 280_000, reorderPoint: 2000, reorderQuantity: 5000, supplier: "paper", location: "MAIN", onHand: 12_000, paper: { paperType: "گلاسه", brand: "APP", grammage: 135, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-GL300-70", name: "گلاسه ۳۰۰ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 650_000, reorderPoint: 1000, reorderQuantity: 3000, supplier: "paper", location: "MAIN", onHand: 4_500, paper: { paperType: "گلاسه", brand: "APP", grammage: 300, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-TH70-70", name: "تحریر ۷۰ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 120_000, reorderPoint: 3000, reorderQuantity: 10_000, supplier: "paper", location: "MAIN", onHand: 800, paper: { paperType: "تحریر", brand: "چوکا", grammage: 70, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-TH80-70", name: "تحریر ۸۰ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 140_000, reorderPoint: 2000, reorderQuantity: 5000, supplier: "paper", location: "MAIN", onHand: 6_000, paper: { paperType: "تحریر", brand: "چوکا", grammage: 80, w: 1000, h: 700, color: "سفید" } },
  { sku: "P-KT300-70", name: "کتان ۳۰۰ گرم ۷۰×۱۰۰", category: "PAPER", unit: "SHEET", standardCost: 1_200_000, reorderPoint: 300, reorderQuantity: 1000, supplier: "paper", location: "MAIN", onHand: 650, paper: { paperType: "کتان", brand: "Fedrigoni", grammage: 300, w: 1000, h: 700, color: "شیری" } },
  // Digital stock: pre-cut SRA3 (32×45 cm)
  { sku: "P-GL135-SRA3", name: "گلاسه ۱۳۵ گرم SRA3", category: "PAPER", unit: "SHEET", standardCost: 45_000, reorderPoint: 1000, reorderQuantity: 5000, supplier: "paper", location: "DIGI", onHand: 4_000, paper: { paperType: "گلاسه", brand: "APP", grammage: 135, w: 450, h: 320, color: "سفید" } },
  { sku: "P-GL300-SRA3", name: "گلاسه ۳۰۰ گرم SRA3", category: "PAPER", unit: "SHEET", standardCost: 110_000, reorderPoint: 800, reorderQuantity: 3000, supplier: "paper", location: "DIGI", onHand: 2_500, paper: { paperType: "گلاسه", brand: "APP", grammage: 300, w: 450, h: 320, color: "سفید" } },
  { sku: "P-TH80-SRA3", name: "تحریر ۸۰ گرم SRA3", category: "PAPER", unit: "SHEET", standardCost: 25_000, reorderPoint: 2000, reorderQuantity: 10_000, supplier: "paper", location: "DIGI", onHand: 9_000, paper: { paperType: "تحریر", brand: "چوکا", grammage: 80, w: 450, h: 320, color: "سفید" } },
  { sku: "P-KT300-SRA3", name: "کتان ۳۰۰ گرم SRA3", category: "PAPER", unit: "SHEET", standardCost: 200_000, reorderPoint: 300, reorderQuantity: 1000, supplier: "paper", location: "DIGI", onHand: 180, paper: { paperType: "کتان", brand: "Fedrigoni", grammage: 300, w: 450, h: 320, color: "شیری" } },
  { sku: "P-STK-SRA3", name: "کاغذ استیکر گلاسه SRA3", category: "PAPER", unit: "SHEET", standardCost: 150_000, reorderPoint: 500, reorderQuantity: 2000, supplier: "paper", location: "DIGI", onHand: 1_200, paper: { paperType: "استیکر", brand: "Fasson", grammage: 80, w: 450, h: 320, color: "سفید" } },
  // Plates & consumables
  { sku: "PL-CTP-5274", name: "زینک CTP ۵۲×۷۴", category: "PLATE", unit: "PIECE", standardCost: 1_200_000, reorderPoint: 60, reorderQuantity: 200, supplier: "plate", location: "MAIN", onHand: 140 },
  { sku: "F-LAM-GLOSS", name: "فیلم سلفون براق", category: "FILM", unit: "SQM", standardCost: 45_000, reorderPoint: 500, reorderQuantity: 2000, supplier: "consumables", location: "MAIN", onHand: 3_000 },
  { sku: "F-LAM-MATTE", name: "فیلم سلفون مات", category: "FILM", unit: "SQM", standardCost: 55_000, reorderPoint: 500, reorderQuantity: 2000, supplier: "consumables", location: "MAIN", onHand: 2_400 },
  { sku: "V-UV-SPOT", name: "ورنی UV موضعی", category: "VARNISH", unit: "LITER", standardCost: 3_500_000, reorderPoint: 10, reorderQuantity: 40, supplier: "consumables", location: "MAIN", onHand: 28 },
  { sku: "FO-GOLD", name: "فویل طلایی", category: "FOIL", unit: "METER", standardCost: 90_000, reorderPoint: 100, reorderQuantity: 500, supplier: "consumables", location: "MAIN", onHand: 420 },
  { sku: "B-WIRE", name: "سیم دوبل (وایر) A5/A4", category: "BINDING", unit: "PIECE", standardCost: 18_000, reorderPoint: 300, reorderQuantity: 2000, supplier: "consumables", location: "MAIN", onHand: 1_500 },
  { sku: "B-GLUE", name: "چسب گرم صحافی", category: "BINDING", unit: "KG", standardCost: 2_800_000, reorderPoint: 10, reorderQuantity: 50, supplier: "consumables", location: "MAIN", onHand: 35 },
  { sku: "PK-CARTON", name: "کارتن بسته‌بندی متوسط", category: "PACKAGING", unit: "PIECE", standardCost: 250_000, reorderPoint: 100, reorderQuantity: 500, supplier: "consumables", location: "MAIN", onHand: 380 },
  { sku: "INK-CMYK", name: "مرکب افست CMYK (ست)", category: "INK", unit: "KG", standardCost: 9_000_000, reorderPoint: 20, reorderQuantity: 60, supplier: "consumables", location: "MAIN", onHand: 45 },
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

const PRINT_QC_CHECKLIST = ["تطابق رنگ با پروف تأییدشده", "رجیستر و هم‌خوانی رنگ‌ها", "نبود لکه، خط و کثیفی", "شمارش تعداد برگ چاپ‌شده"];
const FINAL_QC_CHECKLIST = ["ابعاد نهایی و دقت برش", "کیفیت عملیات تکمیلی", "کیفیت صحافی و ترتیب صفحات", "شمارش تعداد نهایی سفارش"];

/** Offset: derived from the owner's flowchart, with gates and exception paths made explicit. */
export const OFFSET_TEMPLATE_STEPS: TemplateStepInput[] = [
  { key: "DESIGN", name: "طراحی / اصلاح فایل", stepType: "DESIGN", dependsOn: [], condition: { type: "IF_FLAG", flag: "NEEDS_DESIGN" }, gate: null, machineType: null, defaultMinutes: 240, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FILE", checklist: [] },
  { key: "FILE_APPROVAL", name: "تأیید نهایی فایل", stepType: "GATE_FILE", dependsOn: ["DESIGN"], condition: { type: "ALWAYS" }, gate: { kind: "FILE_APPROVAL" }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FILE", checklist: [] },
  { key: "PREPRESS", name: "پیش از چاپ (مونتاژ، تفکیک رنگ)", stepType: "PREPRESS", dependsOn: ["FILE_APPROVAL"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 45, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FILE", checklist: ["بررسی رزولوشن و حاشیه برش", "تبدیل رنگ به CMYK", "مونتاژ و تهیه پروف"] },
  { key: "PAYMENT", name: "کنترل پیش‌پرداخت", stepType: "GATE_PAYMENT", dependsOn: [], condition: { type: "ALWAYS" }, gate: { kind: "PAYMENT" }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: [] },
  { key: "PAPER", name: "بررسی / تأمین کاغذ", stepType: "GATE_MATERIAL", dependsOn: [], condition: { type: "ALWAYS" }, gate: { kind: "MATERIAL", purposes: ["PAPER"] }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: [] },
  { key: "PLATE_STOCK", name: "بررسی / تأمین زینک", stepType: "GATE_MATERIAL", dependsOn: [], condition: { type: "ALWAYS" }, gate: { kind: "MATERIAL", purposes: ["PLATE"] }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: [] },
  { key: "PLATE_MAKING", name: "زینک‌سازی (CTP)", stepType: "PLATE_MAKING", dependsOn: ["PREPRESS", "PLATE_STOCK", "PAYMENT"], condition: { type: "ALWAYS" }, gate: null, machineType: "CTP", defaultMinutes: 20, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: ["کنترل زینک از نظر خط و خش"] },
  { key: "PAPER_CUTTING", name: "برش کاغذ به ابعاد ماشین", stepType: "PAPER_CUTTING", dependsOn: ["PAPER"], condition: { type: "ALWAYS" }, gate: null, machineType: "GUILLOTINE", defaultMinutes: 30, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: [] },
  { key: "PRINTING", name: "چاپ افست", stepType: "OFFSET_PRINTING", dependsOn: ["PLATE_MAKING", "PAPER_CUTTING"], condition: { type: "ALWAYS" }, gate: null, machineType: "OFFSET_PRESS", defaultMinutes: 60, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "PRODUCTION", checklist: [] },
  { key: "PRINT_QC", name: "کنترل کیفیت چاپ", stepType: "QC", dependsOn: ["PRINTING"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 20, minLagMinutes: 0, isQc: true, reworkTargets: ["PRINTING", "PLATE_MAKING"], milestone: "PRODUCTION", checklist: PRINT_QC_CHECKLIST },
  // Ink must dry before lamination (4 h).
  { key: "LAMINATION", name: "سلفون / لمینیت", stepType: "LAMINATION", dependsOn: ["PRINT_QC"], condition: { type: "IF_OPERATION", stepType: "LAMINATION" }, gate: null, machineType: "LAMINATOR", defaultMinutes: 45, minLagMinutes: 240, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "CUTTING", name: "برش", stepType: "CUTTING", dependsOn: ["LAMINATION"], condition: { type: "IF_OPERATION", stepType: "CUTTING" }, gate: null, machineType: "GUILLOTINE", defaultMinutes: 30, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "UV", name: "پوشش UV موضعی / کامل", stepType: "UV_COATING", dependsOn: ["CUTTING"], condition: { type: "IF_OPERATION", stepType: "UV_COATING" }, gate: null, machineType: "UV_COATER", defaultMinutes: 60, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "FOIL", name: "طلاکوب", stepType: "FOIL_STAMPING", dependsOn: ["UV"], condition: { type: "IF_OPERATION", stepType: "FOIL_STAMPING" }, gate: null, machineType: "FOIL_STAMPER", defaultMinutes: 60, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "EMBOSS", name: "برجسته‌کاری", stepType: "EMBOSSING", dependsOn: ["FOIL"], condition: { type: "IF_OPERATION", stepType: "EMBOSSING" }, gate: null, machineType: "FOIL_STAMPER", defaultMinutes: 60, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "DIE_CUT", name: "قالب‌برش", stepType: "DIE_CUTTING", dependsOn: ["EMBOSS"], condition: { type: "IF_OPERATION", stepType: "DIE_CUTTING" }, gate: null, machineType: "DIE_CUTTER", defaultMinutes: 60, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "CORNERS", name: "گردکردن گوشه", stepType: "CORNER_ROUNDING", dependsOn: ["DIE_CUT"], condition: { type: "IF_OPERATION", stepType: "CORNER_ROUNDING" }, gate: null, machineType: null, defaultMinutes: 20, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "BINDING", name: "صحافی", stepType: "BINDING", dependsOn: ["CORNERS"], condition: { type: "IF_OPERATION", stepType: "BINDING" }, gate: null, machineType: "BINDER", defaultMinutes: 90, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "FINAL_QC", name: "کنترل کیفیت نهایی", stepType: "QC", dependsOn: ["BINDING"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 30, minLagMinutes: 0, isQc: true, reworkTargets: ["PRINTING", "LAMINATION", "CUTTING", "UV", "BINDING"], milestone: "QC", checklist: FINAL_QC_CHECKLIST },
  { key: "PACKAGING", name: "بسته‌بندی", stepType: "PACKAGING", dependsOn: ["FINAL_QC"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 30, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "PACKAGING", checklist: ["برچسب سفارش روی بسته", "شمارش تعداد"] },
];

/**
 * Digital: no plates, no plate stock, no pre-cutting (SRA3 stock), inline QC
 * during printing, short cool-down instead of ink drying, plotter cutting for
 * shaped items, and cheap immediate reprints on rejection.
 */
export const DIGITAL_TEMPLATE_STEPS: TemplateStepInput[] = [
  { key: "DESIGN", name: "طراحی / اصلاح فایل", stepType: "DESIGN", dependsOn: [], condition: { type: "IF_FLAG", flag: "NEEDS_DESIGN" }, gate: null, machineType: null, defaultMinutes: 180, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FILE", checklist: [] },
  { key: "FILE_APPROVAL", name: "تأیید نهایی فایل", stepType: "GATE_FILE", dependsOn: ["DESIGN"], condition: { type: "ALWAYS" }, gate: { kind: "FILE_APPROVAL" }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FILE", checklist: [] },
  { key: "PREPRESS", name: "پیش‌پردازش، مونتاژ و RIP", stepType: "PREPRESS", dependsOn: ["FILE_APPROVAL"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 15, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FILE", checklist: ["پروفایل رنگ و RIP", "مونتاژ روی SRA3"] },
  { key: "PAYMENT", name: "کنترل پیش‌پرداخت", stepType: "GATE_PAYMENT", dependsOn: [], condition: { type: "ALWAYS" }, gate: { kind: "PAYMENT" }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: [] },
  { key: "PAPER", name: "آماده‌بودن کاغذ", stepType: "GATE_MATERIAL", dependsOn: [], condition: { type: "ALWAYS" }, gate: { kind: "MATERIAL", purposes: ["PAPER"] }, machineType: null, defaultMinutes: 0, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "MATERIALS", checklist: [] },
  { key: "PRINTING", name: "چاپ دیجیتال و کنترل حین چاپ", stepType: "DIGITAL_PRINTING", dependsOn: ["PREPRESS", "PAPER", "PAYMENT"], condition: { type: "ALWAYS" }, gate: null, machineType: "DIGITAL_PRESS", defaultMinutes: 20, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "PRODUCTION", checklist: ["کالیبراسیون رنگ پیش از چاپ", "کنترل برگ نمونه", "بررسی رجیستر پشت و رو"] },
  { key: "LAMINATION", name: "سلفون / لمینیت", stepType: "LAMINATION", dependsOn: ["PRINTING"], condition: { type: "IF_OPERATION", stepType: "LAMINATION" }, gate: null, machineType: "LAMINATOR", defaultMinutes: 20, minLagMinutes: 20, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "UV", name: "پوشش UV", stepType: "UV_COATING", dependsOn: ["LAMINATION"], condition: { type: "IF_OPERATION", stepType: "UV_COATING" }, gate: null, machineType: "UV_COATER", defaultMinutes: 40, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "CUTTING", name: "برش گیوتین", stepType: "CUTTING", dependsOn: ["UV"], condition: { type: "IF_OPERATION", stepType: "CUTTING" }, gate: null, machineType: "GUILLOTINE", defaultMinutes: 15, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "PLOTTER", name: "برش پلاتر", stepType: "PLOTTER_CUTTING", dependsOn: ["UV"], condition: { type: "IF_OPERATION", stepType: "PLOTTER_CUTTING" }, gate: null, machineType: "PLOTTER", defaultMinutes: 30, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "CORNERS", name: "گردکردن گوشه", stepType: "CORNER_ROUNDING", dependsOn: ["CUTTING", "PLOTTER"], condition: { type: "IF_OPERATION", stepType: "CORNER_ROUNDING" }, gate: null, machineType: null, defaultMinutes: 15, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "BINDING", name: "صحافی", stepType: "BINDING", dependsOn: ["CORNERS"], condition: { type: "IF_OPERATION", stepType: "BINDING" }, gate: null, machineType: "BINDER", defaultMinutes: 45, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "FINISHING", checklist: [] },
  { key: "FINAL_QC", name: "کنترل کیفیت نهایی", stepType: "QC", dependsOn: ["BINDING"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 15, minLagMinutes: 0, isQc: true, reworkTargets: ["PRINTING", "LAMINATION", "CUTTING", "PLOTTER", "BINDING"], milestone: "QC", checklist: FINAL_QC_CHECKLIST },
  { key: "PACKAGING", name: "بسته‌بندی", stepType: "PACKAGING", dependsOn: ["FINAL_QC"], condition: { type: "ALWAYS" }, gate: null, machineType: null, defaultMinutes: 15, minLagMinutes: 0, isQc: false, reworkTargets: [], milestone: "PACKAGING", checklist: ["برچسب سفارش روی بسته"] },
];

export const WORKFLOW_TEMPLATES = [
  { code: "OFFSET_STANDARD", name: "گردش‌کار استاندارد افست", methodCode: "OFFSET", description: "بر اساس فلوچارت فرایند سفارش افست هنر آفاق", steps: OFFSET_TEMPLATE_STEPS },
  { code: "DIGITAL_STANDARD", name: "گردش‌کار استاندارد دیجیتال", methodCode: "DIGITAL", description: "فرایند کوتاه چاپ دیجیتال با کنترل حین چاپ", steps: DIGITAL_TEMPLATE_STEPS },
];

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
  methods: { methodCode: string; workflowTemplateCode: string; minQuantity: number; maxQuantity: number | null }[];
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
      { methodCode: "DIGITAL", workflowTemplateCode: "DIGITAL_STANDARD", minQuantity: 100, maxQuantity: 3000 },
      { methodCode: "OFFSET", workflowTemplateCode: "OFFSET_STANDARD", minQuantity: 1000, maxQuantity: null },
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
      { methodCode: "DIGITAL", workflowTemplateCode: "DIGITAL_STANDARD", minQuantity: 50, maxQuantity: 1500 },
      { methodCode: "OFFSET", workflowTemplateCode: "OFFSET_STANDARD", minQuantity: 500, maxQuantity: null },
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
      { methodCode: "DIGITAL", workflowTemplateCode: "DIGITAL_STANDARD", minQuantity: 10, maxQuantity: 300 },
      { methodCode: "OFFSET", workflowTemplateCode: "OFFSET_STANDARD", minQuantity: 100, maxQuantity: null },
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
      { methodCode: "DIGITAL", workflowTemplateCode: "DIGITAL_STANDARD", minQuantity: 20, maxQuantity: 300 },
      { methodCode: "OFFSET", workflowTemplateCode: "OFFSET_STANDARD", minQuantity: 200, maxQuantity: null },
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
      { methodCode: "DIGITAL", workflowTemplateCode: "DIGITAL_STANDARD", minQuantity: 100, maxQuantity: 1000 },
      { methodCode: "OFFSET", workflowTemplateCode: "OFFSET_STANDARD", minQuantity: 500, maxQuantity: null },
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
    methods: [{ methodCode: "DIGITAL", workflowTemplateCode: "DIGITAL_STANDARD", minQuantity: 50, maxQuantity: null }],
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

export const ROLES: { code: string; name: string; description: string; workspaces: string[]; stepTypes: string[]; permissions: Permission[] | "ALL" }[] = [
  { code: "MANAGER", name: "مدیر", description: "دسترسی کامل و مرکز کنترل", workspaces: ["control", "sales", "accounting", "procurement", "warehouse", "studio", "station", "qc", "shipping"], stepTypes: STEP_TYPES.map((s) => s.code), permissions: "ALL" },
  { code: "SALES", name: "فروش", description: "استعلام، پیش‌فاکتور و ثبت سفارش", workspaces: ["sales"], stepTypes: [], permissions: P("order.view", "order.create", "order.edit", "quote.view", "quote.manage", "customer.view", "customer.manage", "file.view", "file.upload", "production.view", "payment.view", "payment.create", "delivery.view", "pricing.view") },
  { code: "ACCOUNTANT", name: "حسابدار", description: "پرداخت‌ها، مطالبات و تسویه", workspaces: ["accounting"], stepTypes: [], permissions: P("order.view", "customer.view", "payment.view", "payment.create", "payment.approve", "payment.refund", "report.view") },
  { code: "PROCUREMENT", name: "تأمین و خرید", description: "درخواست مواد، سفارش خرید و تأمین‌کنندگان", workspaces: ["procurement", "warehouse"], stepTypes: [], permissions: P("inventory.view", "procurement.view", "procurement.manage", "inventory.receive", "order.view") },
  { code: "WAREHOUSE", name: "انباردار", description: "موجودی، رزرو، دریافت و حواله", workspaces: ["warehouse"], stepTypes: [], permissions: P("inventory.view", "inventory.receive", "inventory.issue", "inventory.reserve", "inventory.waste", "procurement.view") },
  { code: "DESIGNER", name: "طراح", description: "طراحی و اصلاح فایل مشتری", workspaces: ["studio"], stepTypes: ["DESIGN"], permissions: P("file.view", "file.upload", "production.view", "production.execute", "order.view") },
  { code: "PREPRESS", name: "پیش از چاپ", description: "بررسی فنی فایل، مونتاژ و RIP", workspaces: ["studio", "station"], stepTypes: ["PREPRESS"], permissions: P("file.view", "file.upload", "file.review", "production.view", "production.execute", "order.view") },
  { code: "LITHOGRAPHY", name: "لیتوگرافی", description: "زینک‌سازی CTP", workspaces: ["station"], stepTypes: ["PLATE_MAKING"], permissions: P("production.view", "production.execute", "file.view") },
  { code: "OFFSET_OPERATOR", name: "اپراتور افست", description: "چاپ افست", workspaces: ["station"], stepTypes: ["OFFSET_PRINTING"], permissions: P("production.view", "production.execute", "file.view") },
  { code: "DIGITAL_OPERATOR", name: "اپراتور دیجیتال", description: "چاپ دیجیتال", workspaces: ["station"], stepTypes: ["DIGITAL_PRINTING", "PLOTTER_CUTTING"], permissions: P("production.view", "production.execute", "file.view") },
  { code: "CUTTING", name: "برش", description: "برش کاغذ و محصول", workspaces: ["station"], stepTypes: ["PAPER_CUTTING", "CUTTING", "CORNER_ROUNDING"], permissions: P("production.view", "production.execute") },
  { code: "LAMINATION", name: "سلفون", description: "سلفون و لمینیت", workspaces: ["station"], stepTypes: ["LAMINATION"], permissions: P("production.view", "production.execute") },
  { code: "UV", name: "UV", description: "پوشش UV", workspaces: ["station"], stepTypes: ["UV_COATING"], permissions: P("production.view", "production.execute") },
  { code: "FINISHING", name: "عملیات تکمیلی", description: "طلاکوب، برجسته و قالب‌برش", workspaces: ["station"], stepTypes: ["FOIL_STAMPING", "EMBOSSING", "DIE_CUTTING"], permissions: P("production.view", "production.execute") },
  { code: "BINDING", name: "صحافی", description: "صحافی", workspaces: ["station"], stepTypes: ["BINDING"], permissions: P("production.view", "production.execute") },
  { code: "PACKAGING", name: "بسته‌بندی", description: "بسته‌بندی", workspaces: ["station"], stepTypes: ["PACKAGING"], permissions: P("production.view", "production.execute") },
  { code: "QC", name: "کنترل کیفیت", description: "بازرسی کیفیت و تعیین دوباره‌کاری", workspaces: ["qc"], stepTypes: ["QC"], permissions: P("production.view", "qc.perform", "file.view", "order.view") },
  { code: "SHIPPING", name: "ارسال", description: "آماده‌سازی و تحویل مرسولات", workspaces: ["shipping"], stepTypes: [], permissions: P("order.view", "delivery.view", "delivery.manage", "delivery.execute") },
];

export const EMPLOYEES = [
  { phone: "09120000001", fullName: "مهدی تاجر تاجیک", code: "E001", title: "مدیرعامل", roles: ["MANAGER"], hourlyCost: 0 },
  { phone: "09120000002", fullName: "سارا محمدی", code: "E002", title: "کارشناس فروش", roles: ["SALES"], hourlyCost: 1_200_000 },
  { phone: "09120000003", fullName: "رضا کریمی", code: "E003", title: "حسابدار", roles: ["ACCOUNTANT"], hourlyCost: 1_300_000 },
  { phone: "09120000004", fullName: "علی احمدی", code: "E004", title: "انباردار", roles: ["WAREHOUSE", "PROCUREMENT"], hourlyCost: 1_000_000 },
  { phone: "09120000005", fullName: "نگار حسینی", code: "E005", title: "طراح گرافیک", roles: ["DESIGNER"], hourlyCost: 1_400_000 },
  { phone: "09120000006", fullName: "امیر رستمی", code: "E006", title: "کارشناس پیش از چاپ", roles: ["PREPRESS", "LITHOGRAPHY"], hourlyCost: 1_300_000 },
  { phone: "09120000007", fullName: "حسن مرادی", code: "E007", title: "اپراتور افست", roles: ["OFFSET_OPERATOR"], hourlyCost: 1_200_000 },
  { phone: "09120000008", fullName: "مریم صادقی", code: "E008", title: "اپراتور دیجیتال", roles: ["DIGITAL_OPERATOR"], hourlyCost: 1_100_000 },
  { phone: "09120000009", fullName: "جواد نوری", code: "E009", title: "اپراتور برش و سلفون", roles: ["CUTTING", "LAMINATION", "UV"], hourlyCost: 1_000_000 },
  { phone: "09120000010", fullName: "کاوه یزدانی", code: "E010", title: "صحاف", roles: ["BINDING", "FINISHING", "PACKAGING"], hourlyCost: 950_000 },
  { phone: "09120000011", fullName: "فاطمه رحمانی", code: "E011", title: "کنترل کیفیت", roles: ["QC"], hourlyCost: 1_100_000 },
  { phone: "09120000012", fullName: "بهروز قاسمی", code: "E012", title: "مسئول ارسال", roles: ["SHIPPING"], hourlyCost: 900_000 },
];

/** Demo staff password (DEMO_MODE only; shown on the panel login page). */
export const DEMO_STAFF_PASSWORD = "honar1405";

export const MACHINES = [
  { code: "CTP-01", name: "CTP کداک Magnus", typeCode: "CTP", methodCode: "OFFSET", capacityPerHour: 12, setupMinutes: 5, hourlyCost: 2_500_000, operator: "E006" },
  { code: "OFF-01", name: "هایدلبرگ SM74 چهاررنگ", typeCode: "OFFSET_PRESS", methodCode: "OFFSET", capacityPerHour: 8000, setupMinutes: 40, hourlyCost: 12_000_000, colors: 4, maxW: 740, maxH: 520, operator: "E007" },
  { code: "OFF-02", name: "کوموری لیتورون ۴۰", typeCode: "OFFSET_PRESS", methodCode: "OFFSET", capacityPerHour: 7000, setupMinutes: 45, hourlyCost: 11_000_000, colors: 4, maxW: 740, maxH: 520, operator: null },
  { code: "DIG-01", name: "زیراکس Versant 280", typeCode: "DIGITAL_PRESS", methodCode: "DIGITAL", capacityPerHour: 3600, setupMinutes: 10, hourlyCost: 4_000_000, colors: 4, maxW: 480, maxH: 330, operator: "E008" },
  { code: "DIG-02", name: "کونیکا AccurioPress C4080", typeCode: "DIGITAL_PRESS", methodCode: "DIGITAL", capacityPerHour: 4800, setupMinutes: 10, hourlyCost: 4_500_000, colors: 4, maxW: 480, maxH: 330, operator: null },
  { code: "GUI-01", name: "گیوتین پولار ۱۱۵", typeCode: "GUILLOTINE", methodCode: null, capacityPerHour: 3000, setupMinutes: 10, hourlyCost: 1_500_000, operator: "E009" },
  { code: "LAM-01", name: "دستگاه سلفون اتوماتیک", typeCode: "LAMINATOR", methodCode: null, capacityPerHour: 2000, setupMinutes: 15, hourlyCost: 1_800_000, operator: "E009" },
  { code: "UV-01", name: "دستگاه UV موضعی سیلک", typeCode: "UV_COATER", methodCode: null, capacityPerHour: 1200, setupMinutes: 40, hourlyCost: 2_000_000, operator: "E009" },
  { code: "FOIL-01", name: "طلاکوب و برجسته حرارتی", typeCode: "FOIL_STAMPER", methodCode: null, capacityPerHour: 2500, setupMinutes: 45, hourlyCost: 2_200_000, operator: "E010" },
  { code: "DIE-01", name: "قالب‌برش ملخی", typeCode: "DIE_CUTTER", methodCode: null, capacityPerHour: 1500, setupMinutes: 40, hourlyCost: 2_000_000, operator: "E010" },
  { code: "PLT-01", name: "کاتر پلاتر گرافتک", typeCode: "PLOTTER", methodCode: "DIGITAL", capacityPerHour: 50, setupMinutes: 10, hourlyCost: 1_200_000, operator: "E008" },
  { code: "BND-01", name: "دستگاه سیمی‌کن", typeCode: "BINDER", methodCode: null, capacityPerHour: 80, setupMinutes: 10, hourlyCost: 900_000, operator: "E010" },
  { code: "BND-02", name: "ته‌چسب اتوماتیک", typeCode: "BINDER", methodCode: null, capacityPerHour: 250, setupMinutes: 20, hourlyCost: 1_600_000, operator: "E010" },
];

export const DELIVERY_METHODS = [
  { code: "PICKUP", name: "تحویل حضوری از چاپخانه", description: "خیابان جمهوری، کوچه چاپخانه، پلاک ۱۲", kind: "PICKUP" as const, providerCode: null, baseFee: 0 },
  { code: "COURIER", name: "پیک هنر آفاق (تهران)", description: "ارسال با خودروی چاپخانه ظرف ۲۴ ساعت", kind: "INTERNAL" as const, providerCode: null, baseFee: 1_500_000 },
  { code: "POST", name: "پست پیشتاز", description: "ارسال به سراسر کشور", kind: "EXTERNAL" as const, providerCode: "MANUAL", baseFee: 1_200_000 },
  { code: "TIPAX", name: "تیپاکس", description: "ارسال سریع بین‌شهری", kind: "EXTERNAL" as const, providerCode: "MANUAL", baseFee: 2_000_000 },
];

export const VEHICLES = [
  { name: "وانت نیسان سفید", plateNumber: "۲۲ ب ۴۵۶ ایران ۱۰", kind: "VAN" },
  { name: "موتور پیک", plateNumber: "۱۳۵ - ۷۸۹۱۰", kind: "MOTORCYCLE" },
];

export const QC_DEFECT_TYPES = [
  { code: "COLOR", name: "اختلاف رنگ" },
  { code: "REGISTER", name: "خطای رجیستر" },
  { code: "SMUDGE", name: "لکه و کثیفی" },
  { code: "CUT", name: "خطای برش" },
  { code: "LAMINATION", name: "حباب یا چروک سلفون" },
  { code: "BINDING", name: "ایراد صحافی" },
  { code: "COUNT", name: "کسری تعداد" },
  { code: "OTHER", name: "سایر" },
].map((d, i) => ({ ...d, sortOrder: i }));

export const NOTIFICATION_TEMPLATES = [
  { eventType: "OrderPlaced", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "ثبت سفارش", body: "هنر آفاق: سفارش {{orderNumber}} ثبت شد. پیگیری: {{link}}" },
  { eventType: "OrderConfirmed", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "تأیید سفارش", body: "هنر آفاق: سفارش {{orderNumber}} تأیید شد و وارد برنامه تولید شد." },
  { eventType: "ProofSent", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "نمونه طرح آماده تأیید است", body: "هنر آفاق: نمونه طرح سفارش {{orderNumber}} آماده است. لطفاً بررسی و تأیید کنید: {{link}}" },
  { eventType: "PaymentReceived", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "دریافت پرداخت", body: "هنر آفاق: مبلغ {{amount}} برای سفارش {{orderNumber}} دریافت شد. سپاس از شما." },
  { eventType: "ProductionStarted", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "شروع تولید", body: "هنر آفاق: تولید سفارش {{orderNumber}} آغاز شد." },
  { eventType: "OrderReady", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "سفارش آماده است", body: "هنر آفاق: سفارش {{orderNumber}} آماده تحویل است." },
  { eventType: "DeliveryDispatched", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "ارسال سفارش", body: "هنر آفاق: سفارش {{orderNumber}} ارسال شد. {{trackingText}}" },
  { eventType: "DeliveryCompleted", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "تحویل سفارش", body: "هنر آفاق: سفارش {{orderNumber}} تحویل شد. از اعتماد شما سپاسگزاریم." },
  { eventType: "QuoteSent", channel: "SMS" as const, audience: "CUSTOMER" as const, title: "پیش‌فاکتور جدید", body: "هنر آفاق: پیش‌فاکتور {{quoteNumber}} برای شما صادر شد: {{link}}" },
  // In-app notifications shown in the customer's account (bell in the store header).
  { eventType: "OrderPlaced", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "سفارش ثبت شد", body: "سفارش {{orderNumber}} ثبت شد و در صف بررسی قرار گرفت." },
  { eventType: "OrderConfirmed", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "سفارش تأیید شد", body: "سفارش {{orderNumber}} تأیید شد و وارد برنامه تولید شد." },
  { eventType: "PaymentReceived", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "پرداخت موفق", body: "مبلغ {{amount}} برای سفارش {{orderNumber}} دریافت شد." },
  { eventType: "ProofSent", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "نمونه طرح آماده تأیید است", body: "نمونه طرح سفارش {{orderNumber}} آماده است؛ لطفاً بررسی و تأیید کنید." },
  { eventType: "ProductionStarted", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "تولید آغاز شد", body: "تولید سفارش {{orderNumber}} آغاز شد." },
  { eventType: "OrderReady", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "تولید تکمیل شد — سفارش آماده است", body: "سفارش {{orderNumber}} آماده تحویل است." },
  { eventType: "DeliveryAssigned", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "ارسال برنامه‌ریزی شد", body: "مرسوله سفارش {{orderNumber}} به مسئول ارسال سپرده شد." },
  { eventType: "DeliveryDispatched", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "سفارش در مسیر است", body: "سفارش {{orderNumber}} ارسال شد. {{trackingText}}" },
  { eventType: "DeliveryCompleted", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "سفارش تحویل شد", body: "سفارش {{orderNumber}} تحویل شد. از اعتماد شما سپاسگزاریم." },
  { eventType: "QuoteSent", channel: "IN_APP" as const, audience: "CUSTOMER" as const, title: "پیش‌فاکتور جدید", body: "پیش‌فاکتور {{quoteNumber}} برای شما صادر شد." },
  { eventType: "OrderPlaced", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "SALES", title: "سفارش جدید", body: "سفارش {{orderNumber}} از {{customerName}} ثبت شد." },
  { eventType: "InquiryReceived", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "SALES", title: "استعلام جدید", body: "استعلام {{inquiryNumber}} از {{customerName}} دریافت شد." },
  { eventType: "PaymentAwaitingApproval", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "ACCOUNTANT", title: "پرداخت در انتظار تأیید", body: "یک پرداخت برای سفارش {{orderNumber}} منتظر تأیید است." },
  { eventType: "MaterialShortage", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "PROCUREMENT", title: "کمبود مواد", body: "کمبود {{materialName}} برای سفارش {{orderNumber}} — درخواست تأمین ثبت شد." },
  { eventType: "StockLow", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "PROCUREMENT", title: "موجودی زیر نقطه سفارش", body: "موجودی {{materialName}} به زیر نقطه سفارش رسید." },
  { eventType: "QcFailed", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "MANAGER", title: "رد در کنترل کیفیت", body: "سفارش {{orderNumber}} در کنترل کیفیت رد شد و به دوباره‌کاری رفت." },
  { eventType: "IssueReported", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "MANAGER", title: "گزارش مشکل تولید", body: "مشکل در مرحله «{{taskName}}» سفارش {{orderNumber}}: {{description}}" },
  { eventType: "OrderReady", channel: "IN_APP" as const, audience: "ROLE" as const, roleCode: "SHIPPING", title: "سفارش آماده ارسال", body: "سفارش {{orderNumber}} بسته‌بندی شد و آماده ارسال است." },
];

export const DEFAULT_SETTINGS = {
  business: { name: "چاپخانه هنر آفاق", phone: "021-33912000", address: "تهران، خیابان جمهوری، کوچه چاپخانه، پلاک ۱۲", workdays: [6, 0, 1, 2, 3], thursdayHalf: true, workStart: "08:00", workEnd: "17:00" },
  orders: { defaultDepositPct: 50, quoteValidityDays: 7, autoConfirmPaidWebOrders: true },
};
