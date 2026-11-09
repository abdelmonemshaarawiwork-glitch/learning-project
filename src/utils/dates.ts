import { differenceInYears, format, isValid, parseISO } from 'date-fns';

export type DateFormatPref = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';
export type TimeFormatPref = '24h' | '12h';

export interface DateDisplayPrefs {
  dateFormat: DateFormatPref;
  timeFormat: TimeFormatPref;
}

export const DEFAULT_DATE_PREFS: DateDisplayPrefs = { dateFormat: 'dd/MM/yyyy', timeFormat: '24h' };

export const HOUR_MS = 3_600_000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseIsoSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export function isValidIso(value: string | null | undefined): boolean {
  return parseIsoSafe(value) !== null;
}

/** ISO (UTC) → value for <input type="datetime-local"> in the device's local time zone. */
export function toLocalInputValue(iso: string | null | undefined): string {
  const d = parseIsoSafe(iso);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : '';
}

/** <input type="datetime-local"> value (local time) → ISO (UTC). Returns null for empty/invalid. */
export function fromLocalInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : null;
}

export function formatDate(iso: string | null | undefined, prefs: DateDisplayPrefs = DEFAULT_DATE_PREFS): string {
  const d = iso && iso.length === 10 ? parseISO(iso) : parseIsoSafe(iso);
  return d && isValid(d) ? format(d, prefs.dateFormat) : '—';
}

export function formatTime(iso: string | null | undefined, prefs: DateDisplayPrefs = DEFAULT_DATE_PREFS): string {
  const d = parseIsoSafe(iso);
  return d ? format(d, prefs.timeFormat === '24h' ? 'HH:mm' : 'h:mm a') : '—';
}

export function formatDateTime(iso: string | null | undefined, prefs: DateDisplayPrefs = DEFAULT_DATE_PREFS): string {
  const d = parseIsoSafe(iso);
  if (!d) return '—';
  return format(d, `${prefs.dateFormat} ${prefs.timeFormat === '24h' ? 'HH:mm' : 'h:mm a'}`);
}

/** Hours between two ISO timestamps (b − a), as a decimal number. */
export function hoursBetween(a: string, b: string): number {
  const da = parseIsoSafe(a);
  const db = parseIsoSafe(b);
  if (!da || !db) throw new RangeError('Invalid date');
  return (db.getTime() - da.getTime()) / HOUR_MS;
}

export function addHoursIso(iso: string, hours: number): string {
  const d = parseIsoSafe(iso);
  if (!d) throw new RangeError('Invalid date');
  return new Date(d.getTime() + hours * HOUR_MS).toISOString();
}

/** Formats a decimal hour duration as "5 h 30 min". */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const sign = hours < 0 ? '−' : '';
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${sign}${m} min`;
  return m === 0 ? `${sign}${h} h` : `${sign}${h} h ${m} min`;
}

/** Age in completed years on a given date. */
export function ageInCompletedYears(dateOfBirth: string, atIso: string): number | null {
  const dob = parseISO(dateOfBirth);
  const at = parseIsoSafe(atIso);
  if (!isValid(dob) || !at) return null;
  const years = differenceInYears(at, dob);
  return years >= 0 ? years : null;
}
