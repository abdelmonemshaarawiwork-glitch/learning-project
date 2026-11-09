import type { Patient } from '@/types/domain';
import { ageInCompletedYears, nowIso } from './dates';

/** Age in completed years at a moment: from date of birth when known, else the recorded age. */
export function patientAgeYears(p: Pick<Patient, 'dateOfBirth' | 'ageYears'>, atIso = nowIso()): { age: number | null; source: 'date-of-birth' | 'recorded-age' | 'unknown' } {
  if (p.dateOfBirth) {
    const a = ageInCompletedYears(p.dateOfBirth, atIso);
    if (a !== null) return { age: a, source: 'date-of-birth' };
  }
  if (p.ageYears !== null && p.ageYears !== undefined) return { age: Math.floor(p.ageYears), source: 'recorded-age' };
  return { age: null, source: 'unknown' };
}
