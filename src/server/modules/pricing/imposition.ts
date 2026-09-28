import type { Size } from "./types";

/** How many rectangles of `item` fit in `area` on a straight grid, trying both orientations. */
export function fitCount(area: Size, item: Size): number {
  if (item.w <= 0 || item.h <= 0 || area.w <= 0 || area.h <= 0) return 0;
  const straight = Math.floor(area.w / item.w) * Math.floor(area.h / item.h);
  const rotated = Math.floor(area.w / item.h) * Math.floor(area.h / item.w);
  return Math.max(straight, rotated);
}

/** Printable area of a press sheet: gripper edge on one side, side margins elsewhere. */
export function printableArea(sheet: Size, margin: { gripper: number; side: number }): Size {
  return { w: sheet.w - 2 * margin.side, h: sheet.h - margin.gripper - margin.side };
}

export interface FormLayout {
  /** Leaves per press sheet side. */
  ups: number;
  /** Distinct sheet layouts (each needs its own plates on offset). */
  forms: number;
  /** Press sheets needed before waste. */
  runSheets: number;
}

/**
 * Lays out `leavesPerUnit` distinct leaves for `quantity` units.
 *  - When a unit's leaves fit on one sheet, identical copies are ganged (n-up).
 *  - Otherwise each unit needs several forms (signatures) and each form runs `quantity` times.
 */
export function layoutForms(quantity: number, leavesPerUnit: number, ups: number): FormLayout {
  if (ups <= 0) return { ups: 0, forms: 0, runSheets: 0 };
  if (leavesPerUnit <= ups) {
    const copiesPerSheet = Math.floor(ups / leavesPerUnit);
    return { ups, forms: 1, runSheets: Math.ceil(quantity / copiesPerSheet) };
  }
  const forms = Math.ceil(leavesPerUnit / ups);
  return { ups, forms, runSheets: forms * quantity };
}
