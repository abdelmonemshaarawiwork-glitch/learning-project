import type { BreakdownItem, TbsaTotals } from '@/engines/tbsa';
import type { Assessment, AssessmentRegion } from '@/types/domain';
import { roundHalfAwayFromZero } from '@/utils/rounding';

export function regionsToItems(regions: AssessmentRegion[]): BreakdownItem[] {
  return regions.map((r) => ({
    entryId: r.id,
    regionId: r.regionId,
    surface: r.surface,
    label: r.label,
    depth: r.depth,
    involvementPercent: r.involvementPercent,
    palmEquivalents: r.palmEquivalents,
    referencePercent: r.referencePercent,
    contributionExact: r.tbsaContribution,
    contributionRounded: roundHalfAwayFromZero(r.tbsaContribution, 2),
    eligible: r.eligible,
    excludedReason: r.depth === 'superficial' ? 'superficial' : r.depth === 'indeterminate' ? 'indeterminate' : null,
    segmentKeys: r.segmentKeys,
    notes: r.notes,
  }));
}

export function assessmentTotals(a: Assessment, regions: AssessmentRegion[]): TbsaTotals {
  const byDepth = { superficial: 0, 'superficial-partial': 0, 'deep-partial': 0, 'full-thickness': 0, indeterminate: 0 };
  for (const r of regions) byDepth[r.depth] += r.tbsaContribution;
  for (const k of Object.keys(byDepth) as (keyof typeof byDepth)[]) byDepth[k] = roundHalfAwayFromZero(byDepth[k], 2);
  return {
    eligibleExact: a.tbsaExact,
    eligible: a.tbsaTotal,
    indeterminateExact: a.tbsaIndeterminate,
    indeterminate: a.tbsaIndeterminate,
    superficialExact: a.tbsaSuperficialExcluded,
    superficial: a.tbsaSuperficialExcluded,
    upperBoundExact: a.tbsaUpperBound,
    upperBound: a.tbsaUpperBound,
    byDepth,
  };
}
