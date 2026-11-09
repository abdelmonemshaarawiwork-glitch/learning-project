import type { AssessmentDraft } from '@/stores/assessmentDraft';
import type { Assessment, AssessmentRegion } from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/ids';

/** Builds a draft from a saved assessment: "amend" keeps the original date and links to it; "copy" starts a new repeat assessment. */
export function draftFromAssessment(a: Assessment, regions: AssessmentRegion[], mode: 'amend' | 'copy'): Omit<AssessmentDraft, 'updatedAt'> {
  return {
    patientId: a.patientId,
    assessmentDate: mode === 'amend' ? a.assessmentDate : nowIso(),
    assessor: a.assessor,
    method: a.method,
    datasetId: a.method === 'palm' ? null : a.referenceDatasetId,
    columnId: a.ageColumnId,
    columnOverridden: false,
    palmPercent: a.palmPercent,
    palmReference: 'clinician-entered',
    regionalEntries:
      a.method === 'palm'
        ? []
        : regions.map((r) => ({ id: newId(), regionId: r.regionId, surface: r.surface ?? 'anterior', depth: r.depth, involvementPercent: r.involvementPercent ?? Number.NaN, notes: r.notes })),
    palmEntries:
      a.method === 'palm'
        ? regions.map((r) => ({ id: newId(), palmEquivalents: r.palmEquivalents ?? Number.NaN, depth: r.depth, segmentKey: r.segmentKeys[0] ?? null, notes: r.notes }))
        : [],
    notes: mode === 'amend' ? a.notes : '',
    limitationAcknowledged: false,
    amendsAssessmentId: mode === 'amend' ? a.id : null,
    step: 1,
  };
}
