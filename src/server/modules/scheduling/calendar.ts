/**
 * Working-time calendar. Iran has used a fixed UTC+03:30 offset since DST was
 * abolished in 1401 (2022), so local time is a constant shift from UTC.
 */
export const TEHRAN_OFFSET_MIN = 210;

export interface WorkCalendar {
  /** JS weekday numbers (0=Sunday … 6=Saturday) that are full working days. */
  workdays: number[];
  /** Thursday works until `halfDayEnd`. */
  thursdayHalf: boolean;
  startMinute: number;
  endMinute: number;
  halfDayEndMinute: number;
  holidays?: string[]; // "YYYY-MM-DD" in local (Gregorian) date
}

export const DEFAULT_CALENDAR: WorkCalendar = {
  workdays: [6, 0, 1, 2, 3], // Sat–Wed
  thursdayHalf: true,
  startMinute: 8 * 60,
  endMinute: 17 * 60,
  halfDayEndMinute: 13 * 60,
};

export function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const toLocal = (d: Date) => new Date(d.getTime() + TEHRAN_OFFSET_MIN * 60_000);
const fromLocal = (d: Date) => new Date(d.getTime() - TEHRAN_OFFSET_MIN * 60_000);

/** Working window [start,end) in minutes-of-day for the local day containing `local`, or null. */
function windowFor(cal: WorkCalendar, local: Date): [number, number] | null {
  const iso = local.toISOString().slice(0, 10);
  if (cal.holidays?.includes(iso)) return null;
  const wd = local.getUTCDay();
  if (cal.workdays.includes(wd)) return [cal.startMinute, cal.endMinute];
  if (wd === 4 && cal.thursdayHalf) return [cal.startMinute, cal.halfDayEndMinute];
  return null;
}

/** Adds `minutes` of working time to `from` (UTC instant) and returns the UTC end instant. */
export function addWorkingMinutes(cal: WorkCalendar, from: Date, minutes: number): Date {
  let local = toLocal(from);
  let remaining = Math.max(0, minutes);
  for (let guard = 0; guard < 3660; guard++) {
    const win = windowFor(cal, local);
    const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
    if (win) {
      const start = Math.max(minuteOfDay, win[0]);
      if (start < win[1]) {
        const available = win[1] - start;
        const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
        if (remaining <= available) return fromLocal(new Date(dayStart.getTime() + (start + remaining) * 60_000));
        remaining -= available;
      }
    }
    // jump to next local midnight
    local = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1));
    if (remaining === 0) {
      const w = windowFor(cal, local);
      if (w) return fromLocal(new Date(local.getTime() + w[0] * 60_000));
    }
  }
  throw new Error("calendar has no working time");
}

/** Next instant at or after `from` that is inside working hours. */
export function nextWorkingInstant(cal: WorkCalendar, from: Date): Date {
  return addWorkingMinutes(cal, from, 0);
}

/** Working minutes between two instants (for delay/utilisation figures). */
export function workingMinutesBetween(cal: WorkCalendar, from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  let local = toLocal(from);
  const endLocal = toLocal(to);
  for (let guard = 0; guard < 3660 && local < endLocal; guard++) {
    const win = windowFor(cal, local);
    const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    if (win) {
      const s = Math.max(local.getTime(), dayStart + win[0] * 60_000);
      const e = Math.min(endLocal.getTime(), dayStart + win[1] * 60_000);
      if (e > s) total += (e - s) / 60_000;
    }
    local = new Date(dayStart + 86_400_000);
  }
  return Math.round(total);
}
