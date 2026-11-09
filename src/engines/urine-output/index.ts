/**
 * Urine output rate calculator.
 *
 * rate (mL/kg/h) = urine volume (mL) / weight (kg) / measurement duration (h)
 *
 * Classification against a target happens ONLY when a VERIFIED, age-matching target
 * configuration is supplied. Otherwise the result is shown without a normal/abnormal label.
 */
import type { UrineOutputTarget } from '@/engines/tbsa/types';
import { hoursBetween, isValidIso } from '@/utils/dates';
import { formatCompact, isFiniteNumber, roundHalfAwayFromZero } from '@/utils/rounding';

export const URINE_RATE_DECIMALS = 2;

export interface UrineOutputInput {
  volumeMl: number;
  weightKg: number;
  start: string;
  end: string;
}

export interface UrineOutputResult {
  volumeMl: number;
  weightKg: number;
  start: string;
  end: string;
  durationHours: number;
  mlPerHour: number;
  mlPerKgPerHour: number;
  mlPerKgPerHourRounded: number;
  formulaText: string;
}

export type UrineOutputOutcome =
  | { ok: true; result: UrineOutputResult }
  | { ok: false; issues: { field: string; message: string }[] };

export function calculateUrineOutput(input: UrineOutputInput): UrineOutputOutcome {
  const issues: { field: string; message: string }[] = [];
  if (!isFiniteNumber(input.weightKg) || input.weightKg <= 0)
    issues.push({ field: 'weightKg', message: 'Weight must be greater than 0 kg.' });
  if (!isFiniteNumber(input.volumeMl) || input.volumeMl < 0)
    issues.push({ field: 'volumeMl', message: 'Urine volume cannot be negative.' });
  const startOk = isValidIso(input.start);
  const endOk = isValidIso(input.end);
  if (!startOk) issues.push({ field: 'start', message: 'Measurement start time is required.' });
  if (!endOk) issues.push({ field: 'end', message: 'Measurement end time is required.' });
  let durationHours = 0;
  if (startOk && endOk) {
    durationHours = hoursBetween(input.start, input.end);
    if (durationHours < 0) issues.push({ field: 'end', message: 'Measurement end must be after the start.' });
    else if (durationHours === 0) issues.push({ field: 'end', message: 'Measurement duration must be greater than zero.' });
  }
  if (issues.length > 0) return { ok: false, issues };

  const mlPerHour = input.volumeMl / durationHours;
  const mlPerKgPerHour = input.volumeMl / input.weightKg / durationHours;
  return {
    ok: true,
    result: {
      volumeMl: input.volumeMl,
      weightKg: input.weightKg,
      start: input.start,
      end: input.end,
      durationHours,
      mlPerHour,
      mlPerKgPerHour,
      mlPerKgPerHourRounded: roundHalfAwayFromZero(mlPerKgPerHour, URINE_RATE_DECIMALS),
      formulaText: `${formatCompact(input.volumeMl, 1)} mL ÷ ${formatCompact(input.weightKg, 2)} kg ÷ ${formatCompact(durationHours, 3)} h = ${formatCompact(mlPerKgPerHour, 4)} mL/kg/h`,
    },
  };
}

/** First target whose age (and optional weight) band contains the patient. */
export function selectUrineTarget(
  targets: readonly UrineOutputTarget[],
  ageYears: number | null,
  weightKg: number | null,
): UrineOutputTarget | null {
  return (
    targets.find((t) => {
      const ageBand = t.ageMinYears !== null || t.ageMaxYearsExclusive !== null;
      if (ageBand) {
        if (ageYears === null) return false;
        if (t.ageMinYears !== null && ageYears < t.ageMinYears) return false;
        if (t.ageMaxYearsExclusive !== null && ageYears >= t.ageMaxYearsExclusive) return false;
      }
      const weightBand = t.weightMinKg !== null || t.weightMaxKgExclusive !== null;
      if (weightBand) {
        if (weightKg === null) return false;
        if (t.weightMinKg !== null && weightKg < t.weightMinKg) return false;
        if (t.weightMaxKgExclusive !== null && weightKg >= t.weightMaxKgExclusive) return false;
      }
      return true;
    }) ?? null
  );
}

export type UrineClassification =
  | { status: 'not-classified'; message: string }
  | { status: 'below' | 'within' | 'above'; message: string; target: UrineOutputTarget };

export function classifyUrineOutput(rateMlPerKgPerHour: number, target: UrineOutputTarget | null): UrineClassification {
  if (!target) {
    return {
      status: 'not-classified',
      message: 'No verified urine-output target is configured for this patient; the result is not labelled.',
    };
  }
  const range = describeTarget(target);
  if (target.minMlPerKgPerHour !== null && rateMlPerKgPerHour < target.minMlPerKgPerHour)
    return { status: 'below', target, message: `Below the configured target (${range}).` };
  if (target.maxMlPerKgPerHour !== null && rateMlPerKgPerHour > target.maxMlPerKgPerHour)
    return { status: 'above', target, message: `Above the configured target (${range}).` };
  return { status: 'within', target, message: `Within the configured target (${range}).` };
}

export function describeTarget(t: UrineOutputTarget): string {
  const min = t.minMlPerKgPerHour;
  const max = t.maxMlPerKgPerHour;
  const range =
    min !== null && max !== null
      ? `${formatCompact(min, 2)}–${formatCompact(max, 2)} mL/kg/h`
      : min !== null
        ? `≥ ${formatCompact(min, 2)} mL/kg/h`
        : `≤ ${formatCompact(max as number, 2)} mL/kg/h`;
  return `${t.label}: ${range}`;
}
