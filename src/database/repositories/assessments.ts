import { db } from '@/database/db';
import { assessmentRegionSchema, assessmentSchema, validateOrThrow } from '@/database/validation';
import type { Assessment, AssessmentRegion } from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/ids';
import { formatCompact } from '@/utils/rounding';
import { METHOD_LABEL } from '@/constants/clinical';
import { audit } from './audit';

export type NewAssessment = Omit<Assessment, 'id' | 'createdAt' | 'updatedAt' | 'kind' | 'supersededById'>;
export type NewAssessmentRegion = Omit<AssessmentRegion, 'id' | 'assessmentId' | 'patientId'>;

/**
 * Saves a NEW assessment (assessments are never overwritten). When `supersedesId` is set, the
 * earlier assessment is kept and only marked as superseded.
 */
export async function saveAssessment(input: NewAssessment, regions: NewAssessmentRegion[]): Promise<Assessment> {
  return db.transaction('rw', [db.assessments, db.assessmentRegions, db.timelineEvents, db.auditEvents, db.patients], async () => {
    const patient = await db.patients.get(input.patientId);
    if (!patient) throw new Error('Patient not found.');
    const previousCount = await db.assessments.where('patientId').equals(input.patientId).count();
    const now = nowIso();
    const assessment: Assessment = {
      ...input,
      id: newId(),
      kind: previousCount === 0 ? 'initial' : 'repeat',
      supersededById: null,
      createdAt: now,
      updatedAt: now,
    };
    validateOrThrow(assessmentSchema, assessment, 'assessment');
    const rows: AssessmentRegion[] = regions.map((r, i) => ({ ...r, id: newId(), assessmentId: assessment.id, patientId: assessment.patientId, order: i }));
    for (const r of rows) validateOrThrow(assessmentRegionSchema, r, 'assessment region');

    await db.assessments.add(assessment);
    if (rows.length) await db.assessmentRegions.bulkAdd(rows);
    if (assessment.supersedesId) {
      const old = await db.assessments.get(assessment.supersedesId);
      if (!old || old.patientId !== assessment.patientId) throw new Error('Superseded assessment not found for this patient.');
      await db.assessments.update(old.id, { supersededById: assessment.id, updatedAt: now });
    }
    await db.timelineEvents.add({
      id: newId(),
      patientId: assessment.patientId,
      dateTime: assessment.assessmentDate,
      eventType: assessment.kind === 'initial' ? 'initial-assessment' : 'repeat-assessment',
      description: `${METHOD_LABEL[assessment.method]} assessment: TBSA ${formatCompact(assessment.tbsaTotal, 1)}%${assessment.tbsaIndeterminate > 0 ? ` (+${formatCompact(assessment.tbsaIndeterminate, 1)}% indeterminate)` : ''}${assessment.supersedesId ? ' — amends an earlier assessment' : ''}`,
      notes: '',
      linkedRecordId: assessment.id,
      linkedRecordType: 'assessment',
      system: true,
      createdAt: now,
      updatedAt: now,
    });
    await audit('create', 'assessment', assessment.id, `method=${assessment.method};ref=${assessment.referenceDatasetId ?? 'none'}@${assessment.referenceVersion ?? '-'};regions=${rows.length}`);
    return assessment;
  });
}

export async function getAssessmentWithRegions(id: string): Promise<{ assessment: Assessment; regions: AssessmentRegion[] } | null> {
  const assessment = await db.assessments.get(id);
  if (!assessment) return null;
  const regions = await db.assessmentRegions.where('assessmentId').equals(id).sortBy('order');
  return { assessment, regions };
}

export async function listAssessmentsForPatient(patientId: string): Promise<Assessment[]> {
  const list = await db.assessments.where('patientId').equals(patientId).toArray();
  return list.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate) || b.createdAt.localeCompare(a.createdAt));
}

/** Deletes one assessment, its regions and its automatic timeline entries. */
export async function deleteAssessment(id: string): Promise<void> {
  await db.transaction('rw', [db.assessments, db.assessmentRegions, db.timelineEvents, db.auditEvents, db.fluidCalculations], async () => {
    const a = await db.assessments.get(id);
    if (!a) return;
    await db.assessmentRegions.where('assessmentId').equals(id).delete();
    await db.timelineEvents.where('linkedRecordId').equals(id).filter((e) => e.system).delete();
    // Keep any amended version, but remove the dangling pointers.
    await db.assessments.where('patientId').equals(a.patientId).modify((x) => {
      if (x.supersedesId === id) x.supersedesId = null;
      if (x.supersededById === id) x.supersededById = null;
    });
    await db.fluidCalculations.where('assessmentId').equals(id).modify({ assessmentId: null });
    await db.assessments.delete(id);
    await audit('delete', 'assessment', id, `patient=${a.patientId}`);
  });
}
