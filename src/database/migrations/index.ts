/**
 * Versioned IndexedDB schema.
 *
 * RULES
 * - Never edit a released version's store definition; add a new version instead.
 * - An upgrade function must transform data in place; it must never clear a table.
 * - Each version documents what it changes. See docs/DATABASE.md.
 */
import type { Transaction } from 'dexie';

export interface SchemaVersion {
  version: number;
  description: string;
  stores: Record<string, string | null>;
  upgrade?: (tx: Transaction) => Promise<void>;
}

export const SCHEMA_V1_STORES: Record<string, string> = {
  patients: 'id, &code, name, status, admissionDate, createdAt, updatedAt',
  assessments: 'id, patientId, [patientId+assessmentDate], assessmentDate, method, createdAt',
  assessmentRegions: 'id, assessmentId, patientId',
  fluidProtocols: 'id, key, status, updatedAt',
  fluidCalculations: 'id, patientId, [patientId+calculationDate], calculationDate, protocolId, assessmentId',
  intakeRecords: 'id, patientId, [patientId+dateTime], dateTime, category',
  outputRecords: 'id, patientId, [patientId+dateTime], dateTime, category',
  clinicalObservations: 'id, patientId, [patientId+dateTime], dateTime, parameter',
  timelineEvents: 'id, patientId, [patientId+dateTime], dateTime, eventType, linkedRecordId',
  referenceDatasets: 'id, key, kind, status',
  settings: 'id, &key',
  auditEvents: '++id, timestamp, action, entityType, entityId',
};

export const SCHEMA_VERSIONS: SchemaVersion[] = [
  {
    version: 1,
    description: 'Initial schema: patients, assessments, regions, protocols, calculations, intake/output, observations, timeline, references, settings, audit.',
    stores: SCHEMA_V1_STORES,
  },
  {
    version: 2,
    description:
      'Adds the drafts table (in-progress assessments) and a [patientId+parameter] index on observations. Back-fills fields introduced after v1 (patients.mechanismDetails, timelineEvents.system/linkedRecordType, assessments.supersededById) without removing any data.',
    stores: {
      drafts: 'id, updatedAt',
      clinicalObservations: 'id, patientId, [patientId+dateTime], [patientId+parameter], dateTime, parameter',
    },
    upgrade: async (tx) => {
      await tx
        .table('patients')
        .toCollection()
        .modify((p: Record<string, unknown>) => {
          if (typeof p.mechanismDetails !== 'string') p.mechanismDetails = '';
        });
      await tx
        .table('timelineEvents')
        .toCollection()
        .modify((e: Record<string, unknown>) => {
          if (typeof e.system !== 'boolean') e.system = false;
          if (!('linkedRecordType' in e)) e.linkedRecordType = e.linkedRecordId ? 'assessment' : null;
        });
      await tx
        .table('assessments')
        .toCollection()
        .modify((a: Record<string, unknown>) => {
          if (!('supersededById' in a)) a.supersededById = null;
        });
    },
  },
];

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1]!.version;
