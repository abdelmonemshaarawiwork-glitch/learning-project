import { describe, expect, it } from 'vitest';
import type { UrineOutputTarget } from '@/engines/tbsa/types';
import { calculateUrineOutput, classifyUrineOutput, selectUrineTarget } from './index';

const start = '2026-03-01T08:00:00.000Z';

describe('urine output rate', () => {
  it('computes mL/kg/h = volume / weight / hours', () => {
    const out = calculateUrineOutput({ volumeMl: 140, weightKg: 70, start, end: '2026-03-01T12:00:00.000Z' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.durationHours).toBe(4);
      expect(out.result.mlPerHour).toBe(35);
      expect(out.result.mlPerKgPerHour).toBe(0.5);
    }
  });
  it('handles fractional hours and rounding to 2 decimals', () => {
    const out = calculateUrineOutput({ volumeMl: 100, weightKg: 30, start, end: '2026-03-01T09:30:00.000Z' });
    if (!out.ok) throw new Error();
    expect(out.result.mlPerKgPerHour).toBeCloseTo(2.2222222, 6);
    expect(out.result.mlPerKgPerHourRounded).toBe(2.22);
  });
  it('allows zero volume', () => {
    const out = calculateUrineOutput({ volumeMl: 0, weightKg: 70, start, end: '2026-03-01T09:00:00.000Z' });
    expect(out.ok && out.result.mlPerKgPerHour).toBe(0);
  });
  it.each([0, -1, Number.NaN])('rejects weight %s', (w) => {
    const out = calculateUrineOutput({ volumeMl: 10, weightKg: w, start, end: '2026-03-01T09:00:00.000Z' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues[0]!.field).toBe('weightKg');
  });
  it('rejects negative volume', () => {
    expect(calculateUrineOutput({ volumeMl: -1, weightKg: 70, start, end: '2026-03-01T09:00:00.000Z' }).ok).toBe(false);
  });
  it('rejects zero or negative duration', () => {
    const zero = calculateUrineOutput({ volumeMl: 10, weightKg: 70, start, end: start });
    expect(zero.ok).toBe(false);
    const neg = calculateUrineOutput({ volumeMl: 10, weightKg: 70, start, end: '2026-03-01T07:00:00.000Z' });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.issues[0]!.message).toContain('after the start');
  });
});

describe('urine output targets', () => {
  const targets: UrineOutputTarget[] = [
    { id: 'p', label: 'Child', ageMinYears: 0, ageMaxYearsExclusive: 16, weightMinKg: null, weightMaxKgExclusive: null, minMlPerKgPerHour: 1, maxMlPerKgPerHour: 2, notes: '' },
    { id: 'a', label: 'Adult', ageMinYears: 16, ageMaxYearsExclusive: null, weightMinKg: null, weightMaxKgExclusive: null, minMlPerKgPerHour: 0.5, maxMlPerKgPerHour: 1, notes: '' },
  ];
  it('selects the age-specific target', () => {
    expect(selectUrineTarget(targets, 5, 20)?.id).toBe('p');
    expect(selectUrineTarget(targets, 40, 80)?.id).toBe('a');
    expect(selectUrineTarget(targets, null, 80)).toBeNull();
  });
  it('does not label results without a target', () => {
    expect(classifyUrineOutput(0.2, null).status).toBe('not-classified');
  });
  it('classifies against the selected target and shows it', () => {
    const c = classifyUrineOutput(0.3, targets[1]!);
    expect(c.status).toBe('below');
    expect(c.message).toContain('0.5–1 mL/kg/h');
    expect(classifyUrineOutput(0.7, targets[1]!).status).toBe('within');
    expect(classifyUrineOutput(1.5, targets[1]!).status).toBe('above');
  });
});
