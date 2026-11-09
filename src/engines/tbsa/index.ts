/**
 * TBSA calculation engine (framework-independent, pure functions).
 *
 * Rules:
 * - Superficial burns never contribute to TBSA.
 * - Superficial partial, deep partial and full thickness burns are eligible.
 * - Indeterminate depth is reported separately (never silently classified) and is NOT part of the
 *   eligible total; an upper bound (eligible + indeterminate) is reported alongside.
 * - Involvement must be a finite number 0–100 (decimals allowed). Negative and >100 are rejected.
 * - The sum of involvement across depths for one region surface may not exceed 100%.
 * - The same region surface + depth may only be entered once (edit the existing entry instead).
 * - Contributions are computed exactly; totals are summed from unrounded contributions and rounded once.
 */
import {
  BURN_DEPTH_MAP,
  TBSA_CONTRIBUTION_DECIMALS,
  TBSA_TOTAL_DECIMALS,
  segmentKey,
  segmentKeyLabel,
  parseSegmentKey,
} from '@/constants/clinical';
import type { AgeRangeYears, BurnDepth, Surface } from '@/types/domain';
import { formatCompact, isFiniteNumber, preciseSum, roundHalfAwayFromZero } from '@/utils/rounding';
import type {
  BreakdownItem,
  CalculationIssue,
  PalmEntryInput,
  RegionalEntryInput,
  RegionalReferenceData,
  TbsaAgeColumn,
  TbsaRegionRow,
  TbsaResult,
  TbsaTotals,
} from './types';

export * from './types';

const EPS = 1e-9;

export function rowKey(regionId: string, surface: Surface): string {
  return `${regionId}:${surface}`;
}

/** Picks the age column whose [min, max) range contains the age in completed years. */
export function selectAgeColumn(columns: readonly TbsaAgeColumn[], ageYears: number | null | undefined): TbsaAgeColumn | null {
  if (ageYears === null || ageYears === undefined || !Number.isFinite(ageYears) || ageYears < 0) return null;
  return (
    columns.find(
      (c) => ageYears >= c.minAgeYears && (c.maxAgeYearsExclusive === null || ageYears < c.maxAgeYearsExclusive),
    ) ?? null
  );
}

/**
 * Column suggested for a patient: the age-matching column, or the only column of a single-column
 * dataset (e.g. adult Rule of Nines — its age limitation is reported separately, never hidden).
 */
export function defaultAgeColumn(columns: readonly TbsaAgeColumn[], ageYears: number | null | undefined): TbsaAgeColumn | null {
  return selectAgeColumn(columns, ageYears) ?? (columns.length === 1 ? columns[0]! : null);
}

export function findRegionRow(data: RegionalReferenceData, regionId: string, surface: Surface): TbsaRegionRow | undefined {
  return data.regions.find((r) => r.id === regionId && r.surface === surface);
}

/** Which dataset row covers a body-map segment on a given surface. */
export function findRowForSegment(data: RegionalReferenceData, segmentId: string, surface: Surface): TbsaRegionRow | undefined {
  return data.regions.find((r) => r.surface === surface && r.segments.includes(segmentId));
}

/** Returns a warning when the patient's age is outside the dataset's documented population. */
export function checkAgeApplicability(
  ageYears: number | null,
  range: AgeRangeYears,
  datasetName: string,
): CalculationIssue | null {
  if (ageYears === null || !Number.isFinite(ageYears)) {
    if (range.min === null && range.max === null) return null;
    return {
      code: 'AGE_UNKNOWN',
      severity: 'warning',
      message: `Patient age is unknown, so applicability of ${datasetName} cannot be checked.`,
    };
  }
  const belowMin = range.min !== null && ageYears < range.min;
  const aboveMax = range.max !== null && ageYears >= range.max;
  if (!belowMin && !aboveMax) return null;
  return {
    code: 'AGE_OUTSIDE_POPULATION',
    severity: 'warning',
    message: `${datasetName} is documented for ages ${range.min ?? 0}${range.max === null ? '+' : `–<${range.max}`} years; this patient is ${ageYears} years. Percentages may not be valid for this patient.`,
  };
}

function emptyByDepth(): Record<BurnDepth, number> {
  return {
    superficial: 0,
    'superficial-partial': 0,
    'deep-partial': 0,
    'full-thickness': 0,
    indeterminate: 0,
  };
}

function buildTotals(items: BreakdownItem[]): TbsaTotals {
  const byDepthExact = emptyByDepth();
  const groups: Record<BurnDepth, number[]> = {
    superficial: [],
    'superficial-partial': [],
    'deep-partial': [],
    'full-thickness': [],
    indeterminate: [],
  };
  for (const it of items) groups[it.depth].push(it.contributionExact);
  for (const d of Object.keys(groups) as BurnDepth[]) byDepthExact[d] = preciseSum(groups[d]);

  const eligibleExact = preciseSum(items.filter((i) => i.eligible).map((i) => i.contributionExact));
  const indeterminateExact = byDepthExact.indeterminate;
  const superficialExact = byDepthExact.superficial;
  const upperBoundExact = eligibleExact + indeterminateExact;
  const r = (v: number) => roundHalfAwayFromZero(v, TBSA_TOTAL_DECIMALS);
  const byDepth = emptyByDepth();
  for (const d of Object.keys(byDepthExact) as BurnDepth[]) byDepth[d] = roundHalfAwayFromZero(byDepthExact[d], TBSA_CONTRIBUTION_DECIMALS);
  return {
    eligibleExact,
    eligible: r(eligibleExact),
    indeterminateExact,
    indeterminate: r(indeterminateExact),
    superficialExact,
    superficial: r(superficialExact),
    upperBoundExact,
    upperBound: r(upperBoundExact),
    byDepth,
  };
}

function summaryIssues(items: BreakdownItem[], totals: TbsaTotals): CalculationIssue[] {
  const issues: CalculationIssue[] = [];
  if (items.length === 0) {
    issues.push({ code: 'NO_ENTRIES', severity: 'info', message: 'No burned regions have been recorded. TBSA is 0%.' });
  }
  const indeterminate = items.filter((i) => i.depth === 'indeterminate');
  if (indeterminate.length > 0) {
    issues.push({
      code: 'INDETERMINATE_PRESENT',
      severity: 'warning',
      message: `${indeterminate.length} region entr${indeterminate.length === 1 ? 'y has' : 'ies have'} indeterminate depth (${formatCompact(totals.indeterminateExact, 2)}% TBSA). These are NOT included in the eligible TBSA of ${formatCompact(totals.eligible, 1)}%. If all prove to be partial or full thickness, TBSA would be ${formatCompact(totals.upperBound, 1)}%. Reassess depth.`,
    });
  }
  const superficial = items.filter((i) => i.depth === 'superficial');
  if (superficial.length > 0) {
    issues.push({
      code: 'SUPERFICIAL_EXCLUDED',
      severity: 'info',
      message: `${formatCompact(totals.superficialExact, 2)}% superficial burn recorded and excluded from TBSA.`,
    });
  }
  for (const it of items) {
    if (it.contributionExact === 0) {
      issues.push({
        code: 'ZERO_INVOLVEMENT',
        severity: 'info',
        entryId: it.entryId,
        message: `${it.label} is recorded with zero involvement and contributes 0%.`,
      });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Regional methods: Lund and Browder, Rule of Nines                   */
/* ------------------------------------------------------------------ */

export interface RegionalCalculationParams {
  data: RegionalReferenceData;
  columnId: string | null;
  entries: readonly RegionalEntryInput[];
}

export function calculateRegionalTbsa({ data, columnId, entries }: RegionalCalculationParams): TbsaResult {
  const issues: CalculationIssue[] = [];
  const method = data.method;

  let column: TbsaAgeColumn | undefined;
  if (!columnId) {
    issues.push({ code: 'NO_COLUMN', severity: 'error', message: 'Select the age column used for this assessment.' });
  } else {
    column = data.columns.find((c) => c.id === columnId);
    if (!column) issues.push({ code: 'UNKNOWN_COLUMN', severity: 'error', message: `Unknown age column "${columnId}".` });
  }

  const seen = new Set<string>();
  const perRow = new Map<string, number[]>();
  const rows = new Map<string, TbsaRegionRow>();

  for (const e of entries) {
    const row = findRegionRow(data, e.regionId, e.surface);
    const name = row ? `${row.label} (${e.surface})` : `${e.regionId} (${e.surface})`;
    if (!row) {
      issues.push({ code: 'UNKNOWN_REGION', severity: 'error', entryId: e.id, message: `Region "${name}" is not part of this reference dataset.` });
    } else {
      rows.set(e.id, row);
    }
    if (!BURN_DEPTH_MAP[e.depth]) {
      issues.push({ code: 'INVALID_DEPTH', severity: 'error', entryId: e.id, message: `${name}: burn depth is not valid.` });
    }
    const v = e.involvementPercent;
    let valid = false;
    if (!isFiniteNumber(v)) {
      issues.push({ code: 'INVALID_NUMBER', severity: 'error', entryId: e.id, message: `${name}: involvement must be a number.` });
    } else if (v < 0) {
      issues.push({ code: 'NEGATIVE_VALUE', severity: 'error', entryId: e.id, message: `${name}: involvement cannot be negative.` });
    } else if (v > 100) {
      issues.push({ code: 'OVER_100', severity: 'error', entryId: e.id, message: `${name}: involvement cannot exceed 100% of the region.` });
    } else {
      valid = true;
    }
    const dupKey = `${rowKey(e.regionId, e.surface)}|${e.depth}`;
    if (seen.has(dupKey)) {
      issues.push({
        code: 'DUPLICATE_ENTRY',
        severity: 'error',
        entryId: e.id,
        message: `${name}: this depth is already recorded for this region. Edit the existing entry instead of adding a duplicate.`,
      });
    }
    seen.add(dupKey);
    if (valid) {
      const k = rowKey(e.regionId, e.surface);
      perRow.set(k, [...(perRow.get(k) ?? []), v]);
    }
  }

  for (const [k, values] of perRow) {
    const sum = preciseSum(values);
    if (sum > 100 + EPS) {
      const [regionId, surface] = k.split(':') as [string, Surface];
      const row = findRegionRow(data, regionId, surface);
      issues.push({
        code: 'REGION_OVER_100',
        severity: 'error',
        message: `${row?.label ?? regionId} (${surface}): combined involvement across depths is ${formatCompact(sum, 2)}%, which exceeds 100% of the region.`,
      });
    }
  }

  if (issues.some((i) => i.severity === 'error') || !column) {
    return { ok: false, method, issues };
  }

  const items: BreakdownItem[] = entries.map((e) => {
    const row = rows.get(e.id)!;
    const referencePercent = row.percentByColumn[column!.id]!;
    const contributionExact = (referencePercent * e.involvementPercent) / 100;
    const depthDef = BURN_DEPTH_MAP[e.depth];
    return {
      entryId: e.id,
      regionId: e.regionId,
      surface: e.surface,
      label: `${row.label} (${e.surface})`,
      depth: e.depth,
      involvementPercent: e.involvementPercent,
      palmEquivalents: null,
      referencePercent,
      contributionExact,
      contributionRounded: roundHalfAwayFromZero(contributionExact, TBSA_CONTRIBUTION_DECIMALS),
      eligible: depthDef.tbsaEligible,
      excludedReason: e.depth === 'superficial' ? 'superficial' : e.depth === 'indeterminate' ? 'indeterminate' : null,
      segmentKeys: row.segments.map((s) => segmentKey(s, e.surface)),
      notes: e.notes ?? '',
    };
  });

  const totals = buildTotals(items);
  if (totals.eligibleExact + totals.indeterminateExact + totals.superficialExact > 100 + EPS) {
    return {
      ok: false,
      method,
      issues: [{ code: 'TOTAL_OVER_100', severity: 'error', message: 'Total recorded area exceeds 100% TBSA.' }],
    };
  }

  const steps = [
    `Method: ${method === 'lund-browder' ? 'Lund and Browder' : 'Rule of Nines'}; age column: ${column.label}.`,
    ...items.map(
      (i) =>
        `${i.label} — ${BURN_DEPTH_MAP[i.depth].label}: ${formatCompact(i.referencePercent, 2)}% × ${formatCompact(i.involvementPercent, 2)}% = ${formatCompact(i.contributionExact, 4)}%${i.eligible ? '' : ` (excluded: ${i.excludedReason})`}`,
    ),
    `Eligible TBSA = sum of partial- and full-thickness contributions = ${formatCompact(totals.eligibleExact, 4)}% → ${formatCompact(totals.eligible, TBSA_TOTAL_DECIMALS)}% (rounded half away from zero to ${TBSA_TOTAL_DECIMALS} decimal).`,
  ];

  return {
    ok: true,
    method,
    columnId: column.id,
    columnLabel: column.label,
    items,
    totals,
    issues: summaryIssues(items, totals),
    steps,
  };
}

/* ------------------------------------------------------------------ */
/* Palm method                                                         */
/* ------------------------------------------------------------------ */

export interface PalmCalculationParams {
  /** %TBSA represented by one palm-equivalent of THIS patient (clinician-entered). */
  palmPercent: number | null;
  entries: readonly PalmEntryInput[];
}

export function calculatePalmTbsa({ palmPercent, entries }: PalmCalculationParams): TbsaResult {
  const issues: CalculationIssue[] = [];
  const validPalm = isFiniteNumber(palmPercent) && palmPercent > 0 && palmPercent <= 100;
  if (!validPalm) {
    issues.push({
      code: 'INVALID_PALM_PERCENT',
      severity: 'error',
      message: 'Enter the %TBSA represented by one palm-equivalent for this patient (greater than 0 and at most 100).',
    });
  }
  for (const e of entries) {
    const name = e.segmentKey ? segmentKeyLabel(e.segmentKey) : 'Palm estimate';
    if (!isFiniteNumber(e.palmEquivalents)) {
      issues.push({ code: 'INVALID_NUMBER', severity: 'error', entryId: e.id, message: `${name}: number of palm-equivalents must be a number.` });
    } else if (e.palmEquivalents < 0) {
      issues.push({ code: 'NEGATIVE_VALUE', severity: 'error', entryId: e.id, message: `${name}: palm-equivalents cannot be negative.` });
    }
    if (!BURN_DEPTH_MAP[e.depth]) {
      issues.push({ code: 'INVALID_DEPTH', severity: 'error', entryId: e.id, message: `${name}: burn depth is not valid.` });
    }
    if (e.segmentKey !== null && !parseSegmentKey(e.segmentKey)) {
      issues.push({ code: 'UNKNOWN_REGION', severity: 'error', entryId: e.id, message: `${name}: unknown body location.` });
    }
  }
  if (issues.some((i) => i.severity === 'error')) return { ok: false, method: 'palm', issues };

  const pp = palmPercent as number;
  const items: BreakdownItem[] = entries.map((e, idx) => {
    const contributionExact = e.palmEquivalents * pp;
    const depthDef = BURN_DEPTH_MAP[e.depth];
    const parsed = e.segmentKey ? parseSegmentKey(e.segmentKey) : null;
    return {
      entryId: e.id,
      regionId: parsed?.segment ?? 'unspecified',
      surface: parsed?.surface ?? null,
      label: e.segmentKey ? segmentKeyLabel(e.segmentKey) : `Palm estimate ${idx + 1} (location not specified)`,
      depth: e.depth,
      involvementPercent: null,
      palmEquivalents: e.palmEquivalents,
      referencePercent: pp,
      contributionExact,
      contributionRounded: roundHalfAwayFromZero(contributionExact, TBSA_CONTRIBUTION_DECIMALS),
      eligible: depthDef.tbsaEligible,
      excludedReason: e.depth === 'superficial' ? 'superficial' : e.depth === 'indeterminate' ? 'indeterminate' : null,
      segmentKeys: e.segmentKey ? [e.segmentKey] : [],
      notes: e.notes ?? '',
    };
  });

  const totals = buildTotals(items);
  if (totals.eligibleExact + totals.indeterminateExact + totals.superficialExact > 100 + EPS) {
    return {
      ok: false,
      method: 'palm',
      issues: [{ code: 'TOTAL_OVER_100', severity: 'error', message: 'Total of palm estimates exceeds 100% TBSA.' }],
    };
  }
  const steps = [
    `Method: Palm method; one palm-equivalent = ${formatCompact(pp, 3)}% TBSA (clinician-entered assumption for this patient).`,
    ...items.map(
      (i) =>
        `${i.label} — ${BURN_DEPTH_MAP[i.depth].label}: ${formatCompact(i.palmEquivalents, 2)} × ${formatCompact(pp, 3)}% = ${formatCompact(i.contributionExact, 4)}%${i.eligible ? '' : ` (excluded: ${i.excludedReason})`}`,
    ),
    `Eligible TBSA = ${formatCompact(totals.eligibleExact, 4)}% → ${formatCompact(totals.eligible, TBSA_TOTAL_DECIMALS)}%.`,
  ];
  return { ok: true, method: 'palm', columnId: null, columnLabel: null, items, totals, issues: summaryIssues(items, totals), steps };
}

/** Most severe depth recorded per body segment key — used to colour the 2D/3D body maps. */
export function depthBySegment(items: readonly Pick<BreakdownItem, 'segmentKeys' | 'depth'>[]): Map<string, BurnDepth> {
  const out = new Map<string, BurnDepth>();
  for (const it of items) {
    for (const k of it.segmentKeys) {
      const current = out.get(k);
      if (!current || BURN_DEPTH_MAP[it.depth].severity > BURN_DEPTH_MAP[current].severity) out.set(k, it.depth);
    }
  }
  return out;
}
