/**
 * Calendar helpers. A "date key" is a YYYY-MM-DD string for a calendar day in
 * the user's own timezone. Day arithmetic is done on the calendar date itself
 * (via UTC), so it is immune to DST shifts and midnight edge cases.
 */

export const DEFAULT_TIMEZONE = "UTC";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

function zonedParts(ts: number, tz: string) {
  const parts = partsFormatter(safeTimeZone(tz)).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** The calendar day (YYYY-MM-DD) that `ts` falls on in timezone `tz`. */
export function dateKeyInTz(ts: number, tz: string): string {
  const p = zonedParts(ts, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight in timezone `tz`. */
export function minutesOfDayInTz(ts: number, tz: string): number {
  const p = zonedParts(ts, tz);
  return p.hour * 60 + p.minute;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = keyToUtcDate(value);
  return !Number.isNaN(d.getTime()) && utcDateToKey(d) === value;
}

function keyToUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, days: number): string {
  const d = keyToUtcDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateToKey(d);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((keyToUtcDate(b).getTime() - keyToUtcDate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(key: string): number {
  return keyToUtcDate(key).getUTCDay();
}

/** Monday-based start of the week containing `key`. */
export function startOfWeek(key: string): string {
  const wd = weekdayOf(key);
  const offset = (wd + 6) % 7;
  return addDays(key, -offset);
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return utcDateToKey(d).slice(0, 7);
}

/** Inclusive list of date keys from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** A Date at noon UTC on that calendar day, safe for locale formatting with timeZone: "UTC". */
export function keyToDisplayDate(key: string): Date {
  const d = keyToUtcDate(key);
  d.setUTCHours(12);
  return d;
}
