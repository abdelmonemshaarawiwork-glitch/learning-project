import { describe, expect, it } from 'vitest';
import { bucketByDay, bucketByHour, computeTotals, filterByInterval, PatientMixError, totalsByCategory, type BalanceRecord } from './index';

const P = 'patient-1';
const rec = (dateTime: string, amountMl: number, category = 'iv-crystalloid', patientId = P): BalanceRecord => ({ patientId, dateTime, amountMl, category });

const intake = [
  rec('2026-03-01T08:10:00.000Z', 500),
  rec('2026-03-01T08:50:00.000Z', 250, 'oral'),
  rec('2026-03-01T09:15:00.000Z', 1000),
  rec('2026-03-02T09:15:00.000Z', 300),
];
const output = [rec('2026-03-01T08:30:00.000Z', 120, 'urine'), rec('2026-03-01T09:45:00.000Z', 80, 'drain')];

describe('fluid balance totals', () => {
  it('total intake, total output and net balance', () => {
    expect(computeTotals(P, intake, output)).toEqual({ intakeMl: 2050, outputMl: 200, netMl: 1850 });
  });
  it('negative net balance', () => {
    expect(computeTotals(P, [rec('2026-03-01T08:00:00.000Z', 100)], [rec('2026-03-01T08:00:00.000Z', 300)]).netMl).toBe(-200);
  });
  it('totals by category', () => {
    expect(totalsByCategory(intake)).toEqual({ 'iv-crystalloid': 1800, oral: 250 });
  });
  it('never mixes patients', () => {
    expect(() => computeTotals(P, [...intake, rec('2026-03-01T08:00:00.000Z', 1, 'oral', 'other')], output)).toThrow(PatientMixError);
  });
});

describe('date filtering', () => {
  it('filters by [start, end)', () => {
    const f = filterByInterval(intake, '2026-03-01T08:50:00.000Z', '2026-03-01T09:15:00.000Z');
    expect(f.map((r) => r.amountMl)).toEqual([250]);
    expect(filterByInterval(intake, '2026-03-02T00:00:00.000Z', null)).toHaveLength(1);
  });
});

describe('bucketing', () => {
  it('hourly buckets with cumulative balance', () => {
    const b = bucketByHour(P, intake, output, '2026-03-01T08:00:00.000Z', '2026-03-01T10:00:00.000Z');
    expect(b).toHaveLength(2);
    expect(b[0]!.intakeMl).toBe(750);
    expect(b[0]!.outputMl).toBe(120);
    expect(b[0]!.netMl).toBe(630);
    expect(b[1]!.cumulativeIntakeMl).toBe(1750);
    expect(b[1]!.cumulativeNetMl).toBe(1550);
  });
  it('daily buckets', () => {
    const b = bucketByDay(P, intake, output, '2026-02-28T12:00:00.000Z', '2026-03-03T12:00:00.000Z');
    const total = b.reduce((s, x) => s + x.intakeMl, 0);
    expect(total).toBe(2050);
    expect(b[b.length - 1]!.cumulativeNetMl).toBe(1850);
  });
  it('returns no buckets for an empty or inverted interval', () => {
    expect(bucketByHour(P, intake, output, '2026-03-01T10:00:00.000Z', '2026-03-01T08:00:00.000Z')).toEqual([]);
  });
});
