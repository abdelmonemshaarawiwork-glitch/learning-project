import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/database/db';
import type { Assessment } from '@/types/domain';

/** Latest current (not superseded) assessment per patient. */
export function latestAssessmentByPatient(list: Assessment[]): Map<string, Assessment> {
  const out = new Map<string, Assessment>();
  for (const a of list) {
    if (a.supersededById) continue;
    const cur = out.get(a.patientId);
    if (!cur || a.assessmentDate > cur.assessmentDate || (a.assessmentDate === cur.assessmentDate && a.createdAt > cur.createdAt)) out.set(a.patientId, a);
  }
  return out;
}

export function useLatestAssessments() {
  return useLiveQuery(async () => latestAssessmentByPatient(await db.assessments.toArray()), []);
}

export function usePatientAssessments(patientId: string | null | undefined) {
  return useLiveQuery(async () => {
    if (!patientId) return [];
    const list = await db.assessments.where('patientId').equals(patientId).toArray();
    return list.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate) || b.createdAt.localeCompare(a.createdAt));
  }, [patientId]);
}
