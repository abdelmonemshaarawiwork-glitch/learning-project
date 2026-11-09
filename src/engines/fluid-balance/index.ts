/**
 * Fluid balance engine.
 *   Total intake  = Σ intake records
 *   Total output  = Σ output records
 *   Net balance   = Total intake − Total output
 * Records from different patients are never combined: every function that aggregates
 * requires a patient id and throws if a record belongs to another patient.
 */
import { addDays, addHours, startOfDay, startOfHour } from 'date-fns';
import { parseIsoSafe } from '@/utils/dates';
import { preciseSum } from '@/utils/rounding';

export interface BalanceRecord {
  patientId: string;
  dateTime: string;
  amountMl: number;
  category: string;
}

export class PatientMixError extends Error {
  constructor() {
    super('Records from different patients cannot be combined in one fluid balance.');
    this.name = 'PatientMixError';
  }
}

export function assertSinglePatient(patientId: string, ...lists: readonly (readonly BalanceRecord[])[]): void {
  for (const list of lists) for (const r of list) if (r.patientId !== patientId) throw new PatientMixError();
}

/** Keeps records with start ≤ dateTime < end (either bound optional). */
export function filterByInterval<T extends BalanceRecord>(records: readonly T[], start?: string | null, end?: string | null): T[] {
  const s = start ? parseIsoSafe(start)?.getTime() : undefined;
  const e = end ? parseIsoSafe(end)?.getTime() : undefined;
  return records.filter((r) => {
    const t = parseIsoSafe(r.dateTime)?.getTime();
    if (t === undefined) return false;
    if (s !== undefined && t < s) return false;
    if (e !== undefined && t >= e) return false;
    return true;
  });
}

export interface BalanceTotals {
  intakeMl: number;
  outputMl: number;
  netMl: number;
}

export function computeTotals(patientId: string, intake: readonly BalanceRecord[], output: readonly BalanceRecord[]): BalanceTotals {
  assertSinglePatient(patientId, intake, output);
  const intakeMl = preciseSum(intake.map((r) => r.amountMl));
  const outputMl = preciseSum(output.map((r) => r.amountMl));
  return { intakeMl, outputMl, netMl: intakeMl - outputMl };
}

export function totalsByCategory(records: readonly BalanceRecord[]): Record<string, number> {
  const groups: Record<string, number[]> = {};
  for (const r of records) (groups[r.category] ??= []).push(r.amountMl);
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, preciseSum(v)]));
}

export interface BalanceBucket {
  start: string;
  end: string;
  intakeMl: number;
  outputMl: number;
  netMl: number;
  cumulativeIntakeMl: number;
  cumulativeOutputMl: number;
  cumulativeNetMl: number;
}

const MAX_BUCKETS = 24 * 62;

function bucketize(
  patientId: string,
  intake: readonly BalanceRecord[],
  output: readonly BalanceRecord[],
  start: string,
  end: string,
  floor: (d: Date) => Date,
  step: (d: Date) => Date,
): BalanceBucket[] {
  assertSinglePatient(patientId, intake, output);
  const s = parseIsoSafe(start);
  const e = parseIsoSafe(end);
  if (!s || !e || e.getTime() <= s.getTime()) return [];
  const buckets: BalanceBucket[] = [];
  let cursor = floor(s);
  let cumIn = 0;
  let cumOut = 0;
  while (cursor.getTime() < e.getTime() && buckets.length < MAX_BUCKETS) {
    const next = step(cursor);
    const bs = cursor.toISOString();
    const be = next.toISOString();
    const inMl = preciseSum(filterByInterval(intake, bs, be).map((r) => r.amountMl));
    const outMl = preciseSum(filterByInterval(output, bs, be).map((r) => r.amountMl));
    cumIn += inMl;
    cumOut += outMl;
    buckets.push({
      start: bs,
      end: be,
      intakeMl: inMl,
      outputMl: outMl,
      netMl: inMl - outMl,
      cumulativeIntakeMl: cumIn,
      cumulativeOutputMl: cumOut,
      cumulativeNetMl: cumIn - cumOut,
    });
    cursor = next;
  }
  return buckets;
}

/** Hourly buckets in the device's local time zone. Cumulative values start at `start`. */
export function bucketByHour(patientId: string, intake: readonly BalanceRecord[], output: readonly BalanceRecord[], start: string, end: string): BalanceBucket[] {
  return bucketize(patientId, intake, output, start, end, startOfHour, (d) => addHours(d, 1));
}

/** Calendar-day buckets in the device's local time zone. */
export function bucketByDay(patientId: string, intake: readonly BalanceRecord[], output: readonly BalanceRecord[], start: string, end: string): BalanceBucket[] {
  return bucketize(patientId, intake, output, start, end, startOfDay, (d) => addDays(d, 1));
}
