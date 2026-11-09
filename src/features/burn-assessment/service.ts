import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { patientAgeYears } from '@/utils/patient';
import { BURN_DEPTH_MAP, METHOD_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import type { NewAssessment, NewAssessmentRegion } from '@/database/repositories/assessments';
import { checkDatasetUsable, checkProtocolUsable, type UsabilityResult } from '@/engines/integrity';
import {
  calculatePalmTbsa,
  calculateRegionalTbsa,
  checkAgeApplicability,
  type CalculationIssue,
  type PalmReferenceData,
  type RegionalReferenceData,
  type TbsaResult,
  type TbsaSuccess,
} from '@/engines/tbsa';
import type { AssessmentDraft } from '@/stores/assessmentDraft';
import type { AssessmentMethod, FluidProtocol, Patient, ReferenceDataset } from '@/types/domain';
import { formatCompact } from '@/utils/rounding';

export function useReferenceDatasets() {
  return useLiveQuery(() => db.referenceDatasets.toArray(), []);
}

export function useFluidProtocols() {
  return useLiveQuery(() => db.fluidProtocols.toArray(), []);
}

/** Datasets of a method that are not retired, newest version first. */
export function datasetsForMethod(list: ReferenceDataset[] | undefined, method: AssessmentMethod): ReferenceDataset[] {
  return (list ?? [])
    .filter((d) => d.kind === method && d.status !== 'retired')
    .sort((a, b) => (a.status === b.status ? b.version.localeCompare(a.version, undefined, { numeric: true }) : a.status === 'verified' ? -1 : 1));
}

/** Async integrity/verification check for a dataset (re-hashes the data). */
export function useDatasetUsability(ds: ReferenceDataset | null | undefined): UsabilityResult | undefined {
  const [state, setState] = useState<UsabilityResult | undefined>(undefined);
  const key = ds ? `${ds.id}|${ds.updatedAt}|${ds.status}` : 'none';
  useEffect(() => {
    let alive = true;
    setState(undefined);
    void checkDatasetUsable(ds ?? null).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function useProtocolUsability(p: FluidProtocol | null | undefined): UsabilityResult | undefined {
  const [state, setState] = useState<UsabilityResult | undefined>(undefined);
  const key = p ? `${p.id}|${p.updatedAt}|${p.status}` : 'none';
  useEffect(() => {
    let alive = true;
    setState(undefined);
    void checkProtocolUsable(p ?? null).then((r) => alive && setState(r));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function computeDraftResult(draft: AssessmentDraft, dataset: ReferenceDataset | null): TbsaResult | null {
  if (draft.method === 'palm') return calculatePalmTbsa({ palmPercent: draft.palmPercent, entries: draft.palmEntries });
  if (!dataset) return null;
  return calculateRegionalTbsa({ data: dataset.data as RegionalReferenceData, columnId: draft.columnId, entries: draft.regionalEntries });
}

/** Population/age limitation issues that require explicit acknowledgement before saving. */
export function limitationIssues(draft: AssessmentDraft, dataset: ReferenceDataset | null, patient: Patient): CalculationIssue[] {
  const out: CalculationIssue[] = [];
  const { age } = patientAgeYears(patient, draft.assessmentDate);
  if (dataset && draft.method !== 'palm') {
    const issue = checkAgeApplicability(age, dataset.ageRangeYears, dataset.name);
    if (issue) out.push(issue);
  }
  if (draft.method === 'lund-browder' && dataset && draft.columnOverridden) {
    out.push({ code: 'AGE_OUTSIDE_POPULATION', severity: 'warning', message: 'The age column was selected manually instead of from the patient’s age.' });
  }
  if (draft.method === 'palm') {
    if (draft.palmReference === 'clinician-entered' || !draft.palmReference)
      out.push({
        code: 'AGE_OUTSIDE_POPULATION',
        severity: 'warning',
        message: `Palm-equivalent of ${formatCompact(draft.palmPercent, 3)}% TBSA is a clinician-entered assumption without a selected verified reference.`,
      });
    if (age !== null && age < 16)
      out.push({ code: 'AGE_OUTSIDE_POPULATION', severity: 'warning', message: 'Palm-size reference values are not established for children in the configured dataset.' });
  }
  return out;
}

export function palmReferenceText(draft: AssessmentDraft, palmDataset: ReferenceDataset | null): string {
  if (draft.palmReference && draft.palmReference !== 'clinician-entered' && palmDataset) {
    const opt = (palmDataset.data as PalmReferenceData).options.find((o) => o.id === draft.palmReference);
    if (opt) return `${opt.label} — ${formatCompact(opt.percent, 2)}% (${palmDataset.name} v${palmDataset.version}; ${opt.source})`;
  }
  return 'Clinician-entered value (no verified reference selected)';
}

export function buildAssessmentPayload(params: {
  draft: AssessmentDraft;
  result: TbsaSuccess;
  dataset: ReferenceDataset | null;
  palmDataset: ReferenceDataset | null;
  patient: Patient;
  limitations: CalculationIssue[];
}): { assessment: NewAssessment; regions: NewAssessmentRegion[] } {
  const { draft, result, dataset, palmDataset, patient, limitations } = params;
  const { age, source } = patientAgeYears(patient, draft.assessmentDate);
  const palmUsed = draft.method === 'palm' && draft.palmReference && draft.palmReference !== 'clinician-entered' ? palmDataset : null;
  const ref = draft.method === 'palm' ? palmUsed : dataset;
  const warnings = [...limitations, ...result.issues.filter((i) => i.severity !== 'error')].map((i) => i.message);
  return {
    assessment: {
      patientId: patient.id,
      method: draft.method,
      assessmentDate: draft.assessmentDate,
      ageAtAssessment: age,
      ageSource: source,
      ageColumnId: result.columnId,
      ageColumnLabel: result.columnLabel,
      assessor: draft.assessor.trim(),
      tbsaTotal: result.totals.eligible,
      tbsaExact: result.totals.eligibleExact,
      tbsaIndeterminate: result.totals.indeterminate,
      tbsaSuperficialExcluded: result.totals.superficial,
      tbsaUpperBound: result.totals.upperBound,
      referenceDatasetId: ref?.id ?? null,
      referenceVersion: ref?.version ?? null,
      referenceName: ref?.name ?? null,
      palmPercent: draft.method === 'palm' ? draft.palmPercent : null,
      palmReference: draft.method === 'palm' ? palmReferenceText(draft, palmDataset) : null,
      warnings,
      limitationAcknowledged: limitations.length > 0 ? draft.limitationAcknowledged : false,
      notes: draft.notes,
      supersedesId: draft.amendsAssessmentId,
    },
    regions: result.items.map((it, i) => ({
      regionId: it.regionId,
      surface: it.surface,
      label: it.label,
      depth: it.depth,
      involvementPercent: it.involvementPercent,
      palmEquivalents: it.palmEquivalents,
      referencePercent: it.referencePercent,
      tbsaContribution: it.contributionExact,
      eligible: it.eligible,
      segmentKeys: it.segmentKeys,
      notes: it.notes,
      order: i,
    })),
  };
}

export function describeDraftEntry(depth: keyof typeof BURN_DEPTH_MAP, value: number, unit: '%' | 'palms'): string {
  return `${BURN_DEPTH_MAP[depth].short} ${formatCompact(value, 2)}${unit === '%' ? '%' : ' palm-eq.'}`;
}

export function methodName(m: AssessmentMethod) {
  return METHOD_LABEL[m];
}
