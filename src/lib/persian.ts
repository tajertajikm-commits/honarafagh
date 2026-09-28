/**
 * Persian text, number, money and date helpers. Isomorphic (server + client).
 *
 * Conventions:
 *  - Money is stored as integer rial; the UI shows toman (rial / 10), which is
 *    what Iranian customers expect to read.
 *  - Numbers in running Persian text use Persian digits. Identifiers that are
 *    typed or copied (phone numbers in inputs, SKUs, tracking codes) keep Latin
 *    digits and are wrapped in LTR isolation by the UI.
 */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!);
}

export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Normalize Arabic code points and invisible characters so search and comparisons work. */
export function normalizeFa(input: string): string {
  return toEnDigits(input)
    .replace(/ي/g, "ی")
    .replace(/ى/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[ً-ٰٟ]/g, "") // harakat
    .replace(/ـ/g, "") // tatweel
    .replace(/[‎‏‪-‮]/g, "") // bidi marks
    .replace(/\s+/g, " ")
    .trim();
}

/** Accepts 0912…, +98912…, 0098912…, 912…, Persian digits → 09xxxxxxxxx, or null. */
export function normalizePhone(input: string): string | null {
  let s = toEnDigits(input).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

export function formatPhone(phone: string): string {
  // 0912 345 6789 — Latin digits, meant to be rendered inside an LTR isolate
  return phone.length === 11 ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

const groupFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

export function formatNumber(n: number, opts: { decimals?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  return (opts.decimals ? decimalFmt : groupFmt).format(n);
}

export function rialToToman(rial: number): number {
  return Math.round(rial / 10);
}

/** 12,500,000 rial → "۱٬۲۵۰٬۰۰۰ تومان" */
export function formatToman(rial: number, opts: { unit?: boolean } = {}): string {
  const s = groupFmt.format(rialToToman(rial));
  return opts.unit === false ? s : `${s} تومان`;
}

export function formatRial(rial: number): string {
  return `${groupFmt.format(rial)} ریال`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: decimals }).format(value)}٪`;
}

const TZ = "Asia/Tehran";
const dateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: TZ,
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const timeFmt = new Intl.DateTimeFormat("fa-IR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

type DateInput = Date | string | number | null | undefined;
const toDate = (d: DateInput) => (d == null ? null : d instanceof Date ? d : new Date(d));

/** ۷ مهر ۱۴۰۵ */
export function formatDate(d: DateInput): string {
  const date = toDate(d);
  return date ? dateFmt.format(date) : "—";
}
/** ۱۴۰۵/۰۷/۰۷ */
export function formatShortDate(d: DateInput): string {
  const date = toDate(d);
  return date ? shortDateFmt.format(date) : "—";
}
/** ۷ مهر، ۱۴:۳۰ */
export function formatDateTime(d: DateInput): string {
  const date = toDate(d);
  return date ? dateTimeFmt.format(date) : "—";
}
export function formatTime(d: DateInput): string {
  const date = toDate(d);
  return date ? timeFmt.format(date) : "—";
}
export function formatWeekday(d: DateInput): string {
  const date = toDate(d);
  return date ? weekdayFmt.format(date) : "—";
}

const rtf = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });
/** "۳ ساعت پیش", "فردا" */
export function formatRelative(d: DateInput, now: Date = new Date()): string {
  const date = toDate(d);
  if (!date) return "—";
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return "همین حالا";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return formatDate(date);
}

/** 135 → "۲ ساعت و ۱۵ دقیقه" */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${toFaDigits(r)} دقیقه`;
  if (r === 0) return `${toFaDigits(h)} ساعت`;
  return `${toFaDigits(h)} ساعت و ${toFaDigits(r)} دقیقه`;
}

export function formatOrderNumber(n: number): string {
  return toFaDigits(n);
}

/** Pluralisation is not needed in Persian; this keeps call sites readable. */
export function countLabel(n: number, noun: string): string {
  return `${formatNumber(n)} ${noun}`;
}

const dayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, day: "numeric" });
const dayMonthFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: TZ, day: "numeric", month: "long" });
/** "۵" — for dense chart axes. */
export function formatDay(d: DateInput): string {
  const date = toDate(d);
  return date ? dayFmt.format(date) : "—";
}
/** "۵ مهر" */
export function formatDayMonth(d: DateInput): string {
  const date = toDate(d);
  return date ? dayMonthFmt.format(date) : "—";
}
