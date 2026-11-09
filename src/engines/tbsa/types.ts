import type { AssessmentMethod, BurnDepth, Surface } from '@/types/domain';

/** An age column of a regional chart (e.g. Lund and Browder "5 yr"). */
export interface TbsaAgeColumn {
  id: string;
  label: string;
  /** Inclusive lower bound in completed years. */
  minAgeYears: number;
  /** Exclusive upper bound in completed years; null = no upper bound. */
  maxAgeYearsExclusive: number | null;
}

/** One region/surface row of a regional chart. */
export interface TbsaRegionRow {
  id: string;
  label: string;
  surface: Surface;
  /** Body-map segment ids that this row covers on its surface. */
  segments: string[];
  /** %TBSA of the whole region/surface, per age column id. */
  percentByColumn: Record<string, number>;
  group?: string;
}

export interface RegionalReferenceData {
  method: Extract<AssessmentMethod, 'lund-browder' | 'rule-of-nines'>;
  columns: TbsaAgeColumn[];
  regions: TbsaRegionRow[];
  columnSelectionNote: string;
}

export interface PalmReferenceOption {
  id: string;
  label: string;
  /** %TBSA represented by one palm-equivalent. */
  percent: number;
  source: string;
  population: string;
}

export interface PalmReferenceData {
  method: 'palm';
  options: PalmReferenceOption[];
  limitations: string[];
}

export interface UrineOutputTarget {
  id: string;
  label: string;
  ageMinYears: number | null;
  ageMaxYearsExclusive: number | null;
  weightMinKg: number | null;
  weightMaxKgExclusive: number | null;
  minMlPerKgPerHour: number | null;
  maxMlPerKgPerHour: number | null;
  notes: string;
}

export interface UrineOutputTargetData {
  targets: UrineOutputTarget[];
}

export interface RegionalEntryInput {
  id: string;
  regionId: string;
  surface: Surface;
  depth: BurnDepth;
  involvementPercent: number;
  notes?: string;
}

export interface PalmEntryInput {
  id: string;
  palmEquivalents: number;
  depth: BurnDepth;
  /** Optional body-map location (segment:surface). */
  segmentKey: string | null;
  notes?: string;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface CalculationIssue {
  code:
    | 'DATASET_NOT_CONFIGURED'
    | 'DATASET_INTEGRITY'
    | 'UNKNOWN_COLUMN'
    | 'NO_COLUMN'
    | 'UNKNOWN_REGION'
    | 'INVALID_DEPTH'
    | 'INVALID_NUMBER'
    | 'NEGATIVE_VALUE'
    | 'OVER_100'
    | 'REGION_OVER_100'
    | 'TOTAL_OVER_100'
    | 'DUPLICATE_ENTRY'
    | 'INVALID_PALM_PERCENT'
    | 'INDETERMINATE_PRESENT'
    | 'SUPERFICIAL_EXCLUDED'
    | 'ZERO_INVOLVEMENT'
    | 'AGE_OUTSIDE_POPULATION'
    | 'AGE_UNKNOWN'
    | 'NO_ENTRIES';
  severity: IssueSeverity;
  message: string;
  entryId?: string;
}

export interface BreakdownItem {
  entryId: string;
  regionId: string;
  surface: Surface | null;
  label: string;
  depth: BurnDepth;
  involvementPercent: number | null;
  palmEquivalents: number | null;
  referencePercent: number;
  contributionExact: number;
  contributionRounded: number;
  eligible: boolean;
  excludedReason: 'superficial' | 'indeterminate' | null;
  segmentKeys: string[];
  notes: string;
}

export interface TbsaTotals {
  eligibleExact: number;
  eligible: number;
  indeterminateExact: number;
  indeterminate: number;
  superficialExact: number;
  superficial: number;
  upperBoundExact: number;
  upperBound: number;
  byDepth: Record<BurnDepth, number>;
}

export interface TbsaSuccess {
  ok: true;
  method: AssessmentMethod;
  columnId: string | null;
  columnLabel: string | null;
  items: BreakdownItem[];
  totals: TbsaTotals;
  issues: CalculationIssue[];
  steps: string[];
}

export interface TbsaFailure {
  ok: false;
  method: AssessmentMethod;
  issues: CalculationIssue[];
}

export type TbsaResult = TbsaSuccess | TbsaFailure;
