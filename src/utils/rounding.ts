/**
 * Rounding rules (documented in docs/MEDICAL_CALCULATIONS.md):
 * - Exact values are kept internally; rounding happens once, at presentation/storage of a result.
 * - Rounding is "half away from zero" at the requested number of decimals.
 * - toPrecision(15) removes binary floating-point artefacts such as 1.005 * 100 = 100.49999999999999.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Cannot round a non-finite number');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    throw new RangeError('decimals must be an integer between 0 and 10');
  }
  const factor = 10 ** decimals;
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  const rounded = (Math.sign(value) * Math.round(scaled)) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Sum with compensated (Kahan–Babuška) summation to limit floating-point drift. */
export function preciseSum(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const v of values) {
    const t = sum + v;
    if (Math.abs(sum) >= Math.abs(v)) compensation += sum - t + v;
    else compensation += v - t + sum;
    sum = t;
  }
  return sum + compensation;
}

export function formatNumber(value: number | null | undefined, decimals = 0, options?: { grouping?: boolean }): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = roundHalfAwayFromZero(value, decimals);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: options?.grouping ?? true,
  }).format(rounded);
}

/** Format a number dropping trailing zeros (e.g. 4.50 → "4.5"), up to maxDecimals. */
export function formatCompact(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = roundHalfAwayFromZero(value, maxDecimals);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDecimals }).format(rounded);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
