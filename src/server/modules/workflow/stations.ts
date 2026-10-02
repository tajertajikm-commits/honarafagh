import type { Permission } from "@/server/auth/permissions";

/**
 * The two production processes, exactly as the printing house runs them.
 * They share infrastructure (steps, queues) but not their sequence.
 *
 * At approval the approver ticks the stations an order really needs; the
 * selected stations become that order's production plan. `phase` orders the
 * plan: a step enters its queue when every selected step of an earlier phase
 * is done. Offset lithography and paper procurement share phase 1, so they run
 * in parallel and printing waits for both.
 */
export type ProductionType = "DIGITAL" | "OFFSET";

export type StationKind =
  | "WORK" // start → finish
  | "PAPER_SELECT" // digital: pick paper/cardboard from stock
  | "LITHO" // offset: outsourced plates, finished when received
  | "PAPER_PROCURE" // offset: supplier quotes → manager decision → received
  | "PRINT" // offset: needs a press assignment
  | "QUALITY" // approve / reject (rejection sends work back)
  | "SHIPPING"; // dispatch → delivered

export interface Station {
  key: string;
  type: ProductionType;
  name: string;
  short: string;
  phase: number;
  kind: StationKind;
  /** Who may perform the step. */
  permission: Permission;
  /** Always part of the plan (cannot be unticked). */
  required: boolean;
  /** Pre-ticked in the approval form. */
  defaultOn: boolean;
  /** Cannot start until the artwork is approved / the design is completed. */
  needsArtwork: boolean;
  hint: string;
}

const D = (s: Omit<Station, "type">): Station => ({ ...s, type: "DIGITAL" });
const O = (s: Omit<Station, "type">): Station => ({ ...s, type: "OFFSET" });

export const STATIONS: readonly Station[] = [
  // ── Digital ────────────────────────────────────────────────────────────────
  D({ key: "D_SHEET", name: "شیت‌بندی و مونتاژ", short: "شیت", phase: 1, kind: "WORK", permission: "digital.production", required: false, defaultOn: true, needsArtwork: true, hint: "چیدمان طرح روی شیت چاپ" }),
  D({ key: "D_PAPER", name: "انتخاب کاغذ / مقوا", short: "کاغذ", phase: 2, kind: "PAPER_SELECT", permission: "digital.production", required: false, defaultOn: true, needsArtwork: false, hint: "برداشت کاغذ یا مقوا از انبار" }),
  D({ key: "D_PRINT", name: "چاپ دیجیتال", short: "چاپ", phase: 3, kind: "WORK", permission: "digital.production", required: false, defaultOn: true, needsArtwork: true, hint: "چاپ روی دستگاه دیجیتال" }),
  D({ key: "D_CUT", name: "برش / قالب / خط‌تا", short: "برش", phase: 4, kind: "WORK", permission: "digital.production", required: false, defaultOn: true, needsArtwork: false, hint: "برش گیوتین، قالب‌زنی یا خط‌تا" }),
  D({ key: "D_LAMINATION", name: "سلفون", short: "سلفون", phase: 5, kind: "WORK", permission: "digital.production", required: false, defaultOn: false, needsArtwork: false, hint: "روکش سلفون مات یا براق" }),
  D({ key: "D_BINDING", name: "صحافی", short: "صحافی", phase: 6, kind: "WORK", permission: "digital.production", required: false, defaultOn: false, needsArtwork: false, hint: "منگنه، سیمی یا ته‌چسب" }),
  D({ key: "D_QUALITY", name: "تأیید کیفیت نهایی", short: "کیفیت", phase: 7, kind: "QUALITY", permission: "digital.quality", required: false, defaultOn: true, needsArtwork: false, hint: "بررسی نهایی پیش از بسته‌بندی" }),
  D({ key: "D_PACKAGING", name: "بسته‌بندی", short: "بسته‌بندی", phase: 8, kind: "WORK", permission: "digital.dispatch", required: false, defaultOn: true, needsArtwork: false, hint: "بسته‌بندی سفارش" }),
  D({ key: "D_SHIPPING", name: "ارسال", short: "ارسال", phase: 9, kind: "SHIPPING", permission: "digital.dispatch", required: true, defaultOn: true, needsArtwork: false, hint: "پیک، پست، باربری، پیک مشتری یا تحویل حضوری" }),

  // ── Offset ─────────────────────────────────────────────────────────────────
  O({ key: "O_LITHO", name: "لیتوگرافی (برون‌سپاری)", short: "لیتوگرافی", phase: 1, kind: "LITHO", permission: "offset.litho", required: false, defaultOn: true, needsArtwork: true, hint: "سفارش زینک به لیتوگرافی و دریافت آن" }),
  O({ key: "O_PAPER", name: "تأمین کاغذ", short: "کاغذ", phase: 1, kind: "PAPER_PROCURE", permission: "offset.paper", required: false, defaultOn: true, needsArtwork: false, hint: "استعلام قیمت، تأیید مدیر و دریافت کاغذ" }),
  O({ key: "O_PRINT", name: "چاپ افست", short: "چاپ", phase: 2, kind: "PRINT", permission: "offset.print", required: true, defaultOn: true, needsArtwork: true, hint: "چاپ روی ماشین تک‌رنگ، چهاررنگ یا هشت‌رنگ" }),
  O({ key: "O_PRINT_QUALITY", name: "تأیید کیفیت چاپ", short: "کیفیت چاپ", phase: 3, kind: "QUALITY", permission: "offset.quality", required: true, defaultOn: true, needsArtwork: false, hint: "بدون این تأیید کار به پس از چاپ نمی‌رود" }),
  O({ key: "O_CUT", name: "برش / قالب", short: "برش", phase: 4, kind: "WORK", permission: "offset.postpress", required: false, defaultOn: true, needsArtwork: false, hint: "برش گیوتین یا قالب‌زنی" }),
  O({ key: "O_LAMINATION", name: "سلفون", short: "سلفون", phase: 5, kind: "WORK", permission: "offset.postpress", required: false, defaultOn: false, needsArtwork: false, hint: "روکش سلفون" }),
  O({ key: "O_BINDING", name: "صحافی", short: "صحافی", phase: 6, kind: "WORK", permission: "offset.postpress", required: false, defaultOn: false, needsArtwork: false, hint: "صحافی و تکمیل" }),
  O({ key: "O_FINAL_QUALITY", name: "تأیید کیفیت نهایی", short: "کیفیت نهایی", phase: 7, kind: "QUALITY", permission: "offset.quality", required: true, defaultOn: true, needsArtwork: false, hint: "بدون این تأیید کار بسته‌بندی نمی‌شود" }),
  O({ key: "O_PACKAGING", name: "بسته‌بندی", short: "بسته‌بندی", phase: 8, kind: "WORK", permission: "offset.packaging", required: false, defaultOn: true, needsArtwork: false, hint: "بسته‌بندی سفارش" }),
  O({ key: "O_SHIPPING", name: "ارسال", short: "ارسال", phase: 9, kind: "SHIPPING", permission: "offset.shipping", required: true, defaultOn: true, needsArtwork: false, hint: "پیک، پست، باربری، پیک مشتری یا تحویل حضوری" }),
];

const BY_KEY = new Map(STATIONS.map((s) => [s.key, s]));

export function station(key: string): Station {
  const s = BY_KEY.get(key);
  if (!s) throw new Error(`unknown station ${key}`);
  return s;
}

export const stationsOf = (type: ProductionType) => STATIONS.filter((s) => s.type === type);

/** The approval permission per production type. */
export const APPROVE_PERMISSION: Record<ProductionType, Permission> = { DIGITAL: "order.approve.digital", OFFSET: "order.approve.offset" };
export const QUEUE_PERMISSION: Record<ProductionType, Permission> = { DIGITAL: "digital.queue", OFFSET: "offset.queue" };

/**
 * Validates an approver's selection and returns the plan in order. Required
 * stations are always added; the selection must contain real work besides
 * shipping.
 */
export function normalizePlan(type: ProductionType, selected: readonly string[]): Station[] {
  const all = stationsOf(type);
  for (const k of selected) if (!all.some((s) => s.key === k)) throw new Error(`station ${k} is not a ${type} station`);
  const plan = all.filter((s) => s.required || selected.includes(s.key));
  return plan;
}

/**
 * Suggested stations for a store order, derived from the operations the
 * pricing engine applied (lamination, binding, cutting …).
 */
export function suggestedPlan(type: ProductionType, operationStepTypes: readonly string[]): string[] {
  const ops = new Set(operationStepTypes);
  const has = (...codes: string[]) => codes.some((c) => ops.has(c));
  const keys = stationsOf(type)
    .filter((s) => {
      switch (s.key) {
        case "D_CUT":
        case "O_CUT":
          return has("CUTTING", "DIE_CUTTING", "PLOTTER_CUTTING", "PAPER_CUTTING", "CORNER_ROUNDING") || s.defaultOn;
        case "D_LAMINATION":
        case "O_LAMINATION":
          return has("LAMINATION", "UV_COATING");
        case "D_BINDING":
        case "O_BINDING":
          return has("BINDING");
        default:
          return s.defaultOn;
      }
    })
    .map((s) => s.key);
  return keys;
}
