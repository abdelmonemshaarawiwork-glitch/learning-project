import { describe, expect, it } from 'vitest';
import { formatDuration, fromLocalInputValue, toLocalInputValue } from './dates';
import { preciseSum, roundHalfAwayFromZero } from './rounding';
import { kgToLb, lbToKg, cToF, fToC } from './units';

describe('rounding', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfAwayFromZero(1.005, 2)).toBe(1.01);
    expect(roundHalfAwayFromZero(2.375, 2)).toBe(2.38);
    expect(roundHalfAwayFromZero(-2.5, 0)).toBe(-3);
    expect(roundHalfAwayFromZero(0.25, 1)).toBe(0.3);
    expect(roundHalfAwayFromZero(-0.0001, 2)).toBe(0);
  });
  it('rejects non-finite input', () => {
    expect(() => roundHalfAwayFromZero(Number.NaN, 1)).toThrow();
  });
  it('sums precisely', () => {
    expect(preciseSum([0.1, 0.2, 0.3])).toBe(0.6);
  });
});

describe('dates and units', () => {
  it('round-trips datetime-local values', () => {
    const iso = fromLocalInputValue('2026-03-01T08:30');
    expect(iso).not.toBeNull();
    expect(toLocalInputValue(iso)).toBe('2026-03-01T08:30');
  });
  it('formats durations', () => {
    expect(formatDuration(5.5)).toBe('5 h 30 min');
    expect(formatDuration(0.25)).toBe('15 min');
  });
  it('converts units exactly', () => {
    expect(lbToKg(kgToLb(70))).toBeCloseTo(70, 12);
    expect(cToF(37)).toBeCloseTo(98.6, 10);
    expect(fToC(98.6)).toBeCloseTo(37, 10);
  });
});
