import Dexie, { type EntityTable } from 'dexie';
import type {
  Assessment,
  AssessmentRegion,
  AuditEvent,
  ClinicalObservation,
  ClinicalPhoto,
  DraftRecord,
  FluidCalculationRecord,
  FluidProtocol,
  IntakeRecord,
  OutputRecord,
  Patient,
  ReferenceDataset,
  SettingRecord,
  TimelineEvent,
} from '@/types/domain';
import { SCHEMA_VERSIONS } from './migrations';

export const DB_NAME = 'burn-tool';

export class BurnToolDB extends Dexie {
  patients!: EntityTable<Patient, 'id'>;
  assessments!: EntityTable<Assessment, 'id'>;
  assessmentRegions!: EntityTable<AssessmentRegion, 'id'>;
  fluidProtocols!: EntityTable<FluidProtocol, 'id'>;
  fluidCalculations!: EntityTable<FluidCalculationRecord, 'id'>;
  intakeRecords!: EntityTable<IntakeRecord, 'id'>;
  outputRecords!: EntityTable<OutputRecord, 'id'>;
  clinicalObservations!: EntityTable<ClinicalObservation, 'id'>;
  timelineEvents!: EntityTable<TimelineEvent, 'id'>;
  referenceDatasets!: EntityTable<ReferenceDataset, 'id'>;
  settings!: EntityTable<SettingRecord, 'id'>;
  auditEvents!: EntityTable<AuditEvent, 'id'>;
  drafts!: EntityTable<DraftRecord, 'id'>;
  clinicalPhotos!: EntityTable<ClinicalPhoto, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    for (const v of SCHEMA_VERSIONS) {
      const version = this.version(v.version).stores(v.stores);
      if (v.upgrade) version.upgrade(v.upgrade);
    }
  }
}

/** Tables that hold patient-linked records (all carry a patientId). */
export const PATIENT_TABLES = [
  'assessments',
  'assessmentRegions',
  'fluidCalculations',
  'intakeRecords',
  'outputRecords',
  'clinicalObservations',
  'timelineEvents',
  'clinicalPhotos',
] as const;
export type PatientTableName = (typeof PATIENT_TABLES)[number];

export const ALL_TABLES = [
  'patients',
  ...PATIENT_TABLES,
  'fluidProtocols',
  'referenceDatasets',
  'settings',
  'auditEvents',
  'drafts',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

export let db = new BurnToolDB();

/**
 * Opens the clinical database of the signed-in account (each account has its own database).
 * The previous database is closed first, so records of different accounts never mix.
 */
export async function openDatabase(name: string): Promise<BurnToolDB> {
  if (db.name === name && db.isOpen()) return db;
  db.close();
  db = new BurnToolDB(name);
  await db.open();
  return db;
}

/** Closes the active clinical database (used on sign-out and account deletion). */
export function closeDatabase() {
  db.close();
}

/** Test helper: replace the singleton with a fresh database. */
export async function resetDatabaseForTests(name = `burn-tool-test-${crypto.randomUUID()}`): Promise<BurnToolDB> {
  db.close();
  db = new BurnToolDB(name);
  await db.open();
  return db;
}
