/** Repositories for patient-linked time-series records. */
import { db } from '@/database/db';
import {
  fluidCalculationSchema,
  intakeRecordSchema,
  observationSchema,
  outputRecordSchema,
  timelineEventSchema,
  validateOrThrow,
} from '@/database/validation';
import type {
  ClinicalObservation,
  FluidCalculationRecord,
  IntakeRecord,
  OutputRecord,
  TimelineEvent,
} from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/ids';
import { audit } from './audit';
import type { z } from 'zod';
import type { EntityTable, IDType } from 'dexie';

type Timestamped = { id: string; patientId: string; createdAt: string; updatedAt: string };

function makeRepo<T extends Timestamped>(table: () => EntityTable<T, 'id'>, schema: z.ZodType, entity: string) {
  return {
    async add(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
      const now = nowIso();
      const rec = { ...input, id: newId(), createdAt: now, updatedAt: now } as T;
      validateOrThrow(schema, rec, entity);
      await db.transaction('rw', [table(), db.patients, db.auditEvents], async () => {
        if (!(await db.patients.get(rec.patientId))) throw new Error('Patient not found.');
        await table().add(rec);
        await audit('create', entity, rec.id, `patient=${rec.patientId}`);
      });
      return rec;
    },
    async update(id: string, changes: Partial<Omit<T, 'id' | 'patientId' | 'createdAt'>>): Promise<T> {
      return db.transaction('rw', [table(), db.auditEvents], async () => {
        const existing = await table().get(id as IDType<T, 'id'>);
        if (!existing) throw new Error(`${entity} not found.`);
        const updated = { ...existing, ...changes, id, patientId: existing.patientId, createdAt: existing.createdAt, updatedAt: nowIso() } as T;
        validateOrThrow(schema, updated, entity);
        await table().put(updated);
        await audit('update', entity, id, `fields=${Object.keys(changes).join(',')}`);
        return updated;
      });
    },
    async remove(id: string): Promise<void> {
      await db.transaction('rw', [table(), db.auditEvents], async () => {
        const existing = await table().get(id as IDType<T, 'id'>);
        if (!existing) return;
        await table().delete(id as IDType<T, 'id'>);
        await audit('delete', entity, id, `patient=${existing.patientId}`);
      });
    },
    /** Records for ONE patient, optionally within [start, end), sorted by dateTime ascending. */
    async listForPatient(patientId: string, start?: string | null, end?: string | null): Promise<T[]> {
      const lower = start ?? '';
      const upper = end ?? '￿';
      return table()
        .where('[patientId+dateTime]')
        .between([patientId, lower], [patientId, upper], true, false)
        .toArray();
    },
  };
}

export const intakeRepo = makeRepo<IntakeRecord>(() => db.intakeRecords, intakeRecordSchema, 'intakeRecord');
export const outputRepo = makeRepo<OutputRecord>(() => db.outputRecords, outputRecordSchema, 'outputRecord');
export const observationRepo = makeRepo<ClinicalObservation>(() => db.clinicalObservations, observationSchema, 'observation');
export const timelineRepo = makeRepo<TimelineEvent>(() => db.timelineEvents, timelineEventSchema, 'timelineEvent');

export async function saveFluidCalculation(input: Omit<FluidCalculationRecord, 'id' | 'createdAt'>): Promise<FluidCalculationRecord> {
  const now = nowIso();
  const rec: FluidCalculationRecord = { ...input, id: newId(), createdAt: now };
  validateOrThrow(fluidCalculationSchema, rec, 'fluid calculation');
  await db.transaction('rw', [db.fluidCalculations, db.patients, db.auditEvents], async () => {
    if (!(await db.patients.get(rec.patientId))) throw new Error('Patient not found.');
    await db.fluidCalculations.add(rec);
    await audit('create', 'fluidCalculation', rec.id, `patient=${rec.patientId};protocol=${rec.protocolId}`);
  });
  return rec;
}

export async function deleteFluidCalculation(id: string): Promise<void> {
  await db.transaction('rw', [db.fluidCalculations, db.auditEvents], async () => {
    await db.fluidCalculations.delete(id);
    await audit('delete', 'fluidCalculation', id, '');
  });
}

export async function listFluidCalculations(patientId: string): Promise<FluidCalculationRecord[]> {
  const list = await db.fluidCalculations.where('patientId').equals(patientId).toArray();
  return list.sort((a, b) => b.calculationDate.localeCompare(a.calculationDate));
}
