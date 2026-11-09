/**
 * Integrity checks for clinical reference data and fluid protocols.
 *
 * A dataset/protocol is USABLE for calculation only when:
 *  1. its status is "verified",
 *  2. its verification record's content hash equals the SHA-256 of its current data, and
 *  3. its structural/internal-consistency checks pass.
 */
import type { FluidProtocol, FluidProtocolParameters, ReferenceDataset } from '@/types/domain';
import type { PalmReferenceData, RegionalReferenceData, UrineOutputTargetData } from '@/engines/tbsa/types';
import { preciseSum } from '@/utils/rounding';

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The verifiable content of a dataset: values plus the metadata that changes their meaning. */
export function datasetHashPayload(ds: Pick<ReferenceDataset, 'kind' | 'version' | 'ageRangeYears' | 'data'>): unknown {
  return { kind: ds.kind, version: ds.version, ageRangeYears: ds.ageRangeYears, data: ds.data };
}

export function protocolHashPayload(p: Pick<FluidProtocol, 'version' | 'ageRangeYears' | 'parameters'>): unknown {
  return { version: p.version, ageRangeYears: p.ageRangeYears, parameters: p.parameters };
}

export async function hashDataset(ds: Pick<ReferenceDataset, 'kind' | 'version' | 'ageRangeYears' | 'data'>): Promise<string> {
  return sha256Hex(canonicalJson(datasetHashPayload(ds)));
}

export async function hashProtocol(p: Pick<FluidProtocol, 'version' | 'ageRangeYears' | 'parameters'>): Promise<string> {
  return sha256Hex(canonicalJson(protocolHashPayload(p)));
}

const SUM_TOLERANCE = 1e-6;

export function validateRegionalData(data: RegionalReferenceData): string[] {
  const issues: string[] = [];
  if (!data || !Array.isArray(data.columns) || !Array.isArray(data.regions)) return ['Dataset structure is invalid.'];
  if (data.columns.length === 0) issues.push('Dataset has no age columns.');
  if (data.regions.length === 0) issues.push('Dataset has no regions.');

  const columnIds = new Set<string>();
  for (const c of data.columns) {
    if (columnIds.has(c.id)) issues.push(`Duplicate age column "${c.id}".`);
    columnIds.add(c.id);
    if (!Number.isFinite(c.minAgeYears) || c.minAgeYears < 0) issues.push(`Column "${c.label}" has an invalid minimum age.`);
    if (c.maxAgeYearsExclusive !== null && !(c.maxAgeYearsExclusive > c.minAgeYears))
      issues.push(`Column "${c.label}" has an invalid age range.`);
  }

  const rowKeys = new Set<string>();
  for (const r of data.regions) {
    const key = `${r.id}:${r.surface}`;
    if (rowKeys.has(key)) issues.push(`Duplicate region row "${key}".`);
    rowKeys.add(key);
    if (!Array.isArray(r.segments) || r.segments.length === 0) issues.push(`Region "${r.label}" is not mapped to any body segment.`);
    for (const c of data.columns) {
      const v = r.percentByColumn?.[c.id];
      if (typeof v !== 'number' || !Number.isFinite(v)) issues.push(`Region "${r.label}" (${r.surface}) has no value for column "${c.label}".`);
      else if (v < 0) issues.push(`Region "${r.label}" (${r.surface}) has a negative value.`);
    }
  }

  for (const c of data.columns) {
    const sum = preciseSum(data.regions.map((r) => r.percentByColumn?.[c.id] ?? 0));
    if (Math.abs(sum - 100) > SUM_TOLERANCE) {
      issues.push(`Column "${c.label}" sums to ${sum.toFixed(4)}% instead of 100%.`);
    }
  }

  // A body segment surface must belong to exactly one region row.
  const segmentOwners = new Map<string, string>();
  for (const r of data.regions) {
    for (const s of r.segments ?? []) {
      const sk = `${s}:${r.surface}`;
      const owner = segmentOwners.get(sk);
      if (owner) issues.push(`Body segment "${sk}" is mapped to both "${owner}" and "${r.id}:${r.surface}".`);
      segmentOwners.set(sk, `${r.id}:${r.surface}`);
    }
  }
  return issues;
}

export function validatePalmData(data: PalmReferenceData): string[] {
  const issues: string[] = [];
  if (!data || !Array.isArray(data.options)) return ['Dataset structure is invalid.'];
  for (const o of data.options) {
    if (!Number.isFinite(o.percent) || o.percent <= 0 || o.percent > 100) issues.push(`Option "${o.label}" has an invalid percentage.`);
    if (!o.source?.trim()) issues.push(`Option "${o.label}" has no source.`);
  }
  return issues;
}

export function validateUrineTargetData(data: UrineOutputTargetData): string[] {
  const issues: string[] = [];
  if (!data || !Array.isArray(data.targets)) return ['Dataset structure is invalid.'];
  if (data.targets.length === 0) issues.push('No targets defined.');
  for (const t of data.targets) {
    if (t.minMlPerKgPerHour === null && t.maxMlPerKgPerHour === null)
      issues.push(`Target "${t.label}" defines neither a minimum nor a maximum.`);
    for (const [name, v] of [
      ['minimum', t.minMlPerKgPerHour],
      ['maximum', t.maxMlPerKgPerHour],
    ] as const) {
      if (v !== null && (!Number.isFinite(v) || v < 0)) issues.push(`Target "${t.label}" has an invalid ${name}.`);
    }
    if (t.minMlPerKgPerHour !== null && t.maxMlPerKgPerHour !== null && t.maxMlPerKgPerHour < t.minMlPerKgPerHour)
      issues.push(`Target "${t.label}" maximum is below its minimum.`);
    if (t.ageMinYears !== null && t.ageMaxYearsExclusive !== null && t.ageMaxYearsExclusive <= t.ageMinYears)
      issues.push(`Target "${t.label}" has an invalid age range.`);
  }
  return issues;
}

export function validateDatasetData(ds: Pick<ReferenceDataset, 'kind' | 'data'>): string[] {
  switch (ds.kind) {
    case 'lund-browder':
    case 'rule-of-nines':
      return validateRegionalData(ds.data as RegionalReferenceData);
    case 'palm':
      return validatePalmData(ds.data as PalmReferenceData);
    case 'urine-output-targets':
      return validateUrineTargetData(ds.data as UrineOutputTargetData);
    default:
      return ['Unknown dataset kind.'];
  }
}

export function validateProtocolParameters(p: FluidProtocolParameters): string[] {
  const issues: string[] = [];
  if (p.mlPerKgPerPercentTbsa === null || !Number.isFinite(p.mlPerKgPerPercentTbsa) || p.mlPerKgPerPercentTbsa <= 0)
    issues.push('Volume coefficient (mL/kg/%TBSA) is not configured.');
  if (p.periodHours === null || !Number.isFinite(p.periodHours) || p.periodHours <= 0)
    issues.push('Estimation period (hours) is not configured.');
  if (!Array.isArray(p.phases) || p.phases.length === 0) issues.push('No phases are configured.');
  else {
    const sorted = [...p.phases].sort((a, b) => a.startHour - b.startHour);
    let expectedStart = 0;
    for (const ph of sorted) {
      if (!(ph.fractionOfTotal > 0 && ph.fractionOfTotal <= 1)) issues.push(`Phase "${ph.label}" has an invalid fraction.`);
      if (!(ph.endHour > ph.startHour)) issues.push(`Phase "${ph.label}" ends before it starts.`);
      if (Math.abs(ph.startHour - expectedStart) > 1e-9) issues.push(`Phase "${ph.label}" does not start where the previous phase ends.`);
      expectedStart = ph.endHour;
    }
    if (p.periodHours !== null && Math.abs(expectedStart - p.periodHours) > 1e-9)
      issues.push('Phases do not cover the whole estimation period.');
    const fractionSum = preciseSum(p.phases.map((ph) => ph.fractionOfTotal));
    if (Math.abs(fractionSum - 1) > 1e-9) issues.push(`Phase fractions sum to ${fractionSum} instead of 1.`);
  }
  if (!Array.isArray(p.countedIntakeCategories) || p.countedIntakeCategories.length === 0)
    issues.push('No intake categories are counted as administered fluid.');
  return issues;
}

export interface UsabilityResult {
  usable: boolean;
  reasons: string[];
}

export async function checkDatasetUsable(ds: ReferenceDataset | null | undefined): Promise<UsabilityResult> {
  if (!ds) return { usable: false, reasons: ['No reference dataset is selected.'] };
  const reasons: string[] = [];
  if (ds.status !== 'verified' || !ds.verification) reasons.push(`"${ds.name}" v${ds.version} is NOT CONFIGURED (no clinical verification recorded).`);
  const structural = validateDatasetData(ds);
  reasons.push(...structural);
  if (ds.verification) {
    const hash = await hashDataset(ds);
    if (hash !== ds.verification.contentHash)
      reasons.push(`"${ds.name}" data changed after verification (integrity hash mismatch). Re-verification is required.`);
  }
  return { usable: reasons.length === 0, reasons };
}

export async function checkProtocolUsable(p: FluidProtocol | null | undefined): Promise<UsabilityResult> {
  if (!p) return { usable: false, reasons: ['No protocol is selected.'] };
  const reasons: string[] = [];
  if (p.status !== 'verified' || !p.verification) reasons.push(`"${p.name}" v${p.version} is NOT CONFIGURED (no clinical verification recorded).`);
  reasons.push(...validateProtocolParameters(p.parameters));
  if (p.verification) {
    const hash = await hashProtocol(p);
    if (hash !== p.verification.contentHash)
      reasons.push(`"${p.name}" parameters changed after verification (integrity hash mismatch). Re-verification is required.`);
  }
  return { usable: reasons.length === 0, reasons };
}
