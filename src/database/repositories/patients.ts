import { db, PATIENT_TABLES } from '@/database/db';
import { patientSchema, validateOrThrow } from '@/database/validation';
import type { Patient } from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { generatePatientCode, newId } from '@/utils/ids';
import { audit } from './audit';

export type PatientInput = Omit<Patient, 'id' | 'code' | 'createdAt' | 'updatedAt'>;

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generatePatientCode();
    if ((await db.patients.where('code').equals(code).count()) === 0) return code;
  }
  throw new Error('Could not generate a unique patient code.');
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Possible duplicates: same normalised name, and same date of birth when both are recorded. */
export async function findPotentialDuplicates(name: string, dateOfBirth: string | null, excludeId?: string): Promise<Patient[]> {
  const target = normaliseName(name);
  if (!target) return [];
  const all = await db.patients.toArray();
  return all.filter(
    (p) =>
      p.id !== excludeId &&
      normaliseName(p.name) === target &&
      (dateOfBirth === null || p.dateOfBirth === null || p.dateOfBirth === dateOfBirth),
  );
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  const now = nowIso();
  const patient: Patient = { ...input, id: newId(), code: await uniqueCode(), createdAt: now, updatedAt: now };
  validateOrThrow(patientSchema, patient, 'patient');
  await db.transaction('rw', [db.patients, db.timelineEvents, db.auditEvents], async () => {
    await db.patients.add(patient);
    await db.timelineEvents.add({
      id: newId(),
      patientId: patient.id,
      dateTime: patient.admissionDate,
      eventType: 'admission',
      description: 'Admission recorded',
      notes: '',
      linkedRecordId: null,
      linkedRecordType: null,
      system: true,
      createdAt: now,
      updatedAt: now,
    });
    await audit('create', 'patient', patient.id, `code=${patient.code}`);
  });
  return patient;
}

export async function updatePatient(id: string, changes: Partial<PatientInput>): Promise<Patient> {
  return db.transaction('rw', [db.patients, db.auditEvents], async () => {
    const existing = await db.patients.get(id);
    if (!existing) throw new Error('Patient not found.');
    const updated: Patient = { ...existing, ...changes, id, code: existing.code, createdAt: existing.createdAt, updatedAt: nowIso() };
    validateOrThrow(patientSchema, updated, 'patient');
    await db.patients.put(updated);
    await audit('update', 'patient', id, `fields=${Object.keys(changes).join(',')}`);
    return updated;
  });
}

export interface RelatedCounts {
  assessments: number;
  assessmentRegions: number;
  fluidCalculations: number;
  intakeRecords: number;
  outputRecords: number;
  clinicalObservations: number;
  timelineEvents: number;
}

export async function countRelatedRecords(patientId: string): Promise<RelatedCounts> {
  const entries = await Promise.all(
    PATIENT_TABLES.map(async (t) => [t, await db.table(t).where('patientId').equals(patientId).count()] as const),
  );
  return Object.fromEntries(entries) as unknown as RelatedCounts;
}

/** Deletes a patient and ALL linked records atomically. */
export async function deletePatient(id: string): Promise<RelatedCounts> {
  const tables = [db.patients, ...PATIENT_TABLES.map((t) => db.table(t)), db.drafts, db.auditEvents];
  return db.transaction('rw', tables, async () => {
    const counts = await countRelatedRecords(id);
    for (const t of PATIENT_TABLES) await db.table(t).where('patientId').equals(id).delete();
    const draft = await db.drafts.get('assessment');
    if (draft && (draft.data as { patientId?: string } | null)?.patientId === id) await db.drafts.delete('assessment');
    await db.patients.delete(id);
    await audit('delete', 'patient', id, Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(','));
    return counts;
  });
}

export function getPatient(id: string) {
  return db.patients.get(id);
}

export function listPatients() {
  return db.patients.orderBy('admissionDate').reverse().toArray();
}
