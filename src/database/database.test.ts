import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { BurnToolDB, db, resetDatabaseForTests } from './db';
import { SCHEMA_V1_STORES } from './migrations';
import { ensureBundledTemplates } from './bootstrap';
import { createPatient, deletePatient, findPotentialDuplicates, updatePatient } from './repositories/patients';
import { deleteAssessment, getAssessmentWithRegions, listAssessmentsForPatient, saveAssessment, type NewAssessment } from './repositories/assessments';
import { intakeRepo, observationRepo, outputRepo, timelineRepo } from './repositories/records';
import { createDatasetVersion, updateDatasetDraft, verifyDataset, verifyProtocol } from './repositories/references';
import { checkDatasetUsable, checkProtocolUsable } from '@/engines/integrity';
import { patientInput } from '@/tests/fixtures';

function assessmentInput(patientId: string, over: Partial<NewAssessment> = {}): NewAssessment {
  return {
    patientId,
    method: 'lund-browder',
    assessmentDate: '2026-03-01T09:00:00.000Z',
    ageAtAssessment: 40,
    ageSource: 'recorded-age',
    ageColumnId: 'adult',
    ageColumnLabel: 'Adult',
    assessor: 'Dr A',
    tbsaTotal: 13,
    tbsaExact: 13,
    tbsaIndeterminate: 0,
    tbsaSuperficialExcluded: 0,
    tbsaUpperBound: 13,
    referenceDatasetId: 'lund-browder-1944@1.0.0',
    referenceVersion: '1.0.0',
    referenceName: 'Lund and Browder chart',
    palmPercent: null,
    palmReference: null,
    warnings: [],
    limitationAcknowledged: false,
    notes: '',
    supersedesId: null,
    ...over,
  };
}

const region = {
  regionId: 'trunk',
  surface: 'anterior' as const,
  label: 'Trunk (anterior)',
  depth: 'deep-partial' as const,
  involvementPercent: 100,
  palmEquivalents: null,
  referencePercent: 13,
  tbsaContribution: 13,
  eligible: true,
  segmentKeys: ['trunk:anterior'],
  notes: '',
  order: 0,
};

beforeEach(async () => {
  await resetDatabaseForTests();
  await ensureBundledTemplates();
});

describe('patients CRUD', () => {
  it('creates with generated id/code and an admission timeline event', async () => {
    const p = await createPatient(patientInput());
    expect(p.id).toMatch(/[0-9a-f-]{36}/);
    expect(p.code).toMatch(/^BT-[0-9A-Z]{8}$/);
    const events = await db.timelineEvents.where('patientId').equals(p.id).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('admission');
    expect(await db.auditEvents.where('entityId').equals(p.id).count()).toBe(1);
  });
  it('rejects invalid patients', async () => {
    await expect(createPatient(patientInput({ name: '  ' }))).rejects.toThrow(/Name or identifier/);
    await expect(createPatient(patientInput({ weightKg: -3 }))).rejects.toThrow(/weightKg/);
  });
  it('updates and keeps id/code/createdAt', async () => {
    const p = await createPatient(patientInput());
    const u = await updatePatient(p.id, { weightKg: 72.5, status: 'discharged' });
    expect(u.code).toBe(p.code);
    expect(u.createdAt).toBe(p.createdAt);
    expect((await db.patients.get(p.id))!.weightKg).toBe(72.5);
  });
  it('detects potential duplicates by name (and DOB)', async () => {
    await createPatient(patientInput({ name: 'Jane  Doe', dateOfBirth: '1980-01-01' }));
    expect(await findPotentialDuplicates('jane doe', '1980-01-01')).toHaveLength(1);
    expect(await findPotentialDuplicates('jane doe', '1990-01-01')).toHaveLength(0);
    expect(await findPotentialDuplicates('jane doe', null)).toHaveLength(1);
  });
  it('deletes a patient and every linked record atomically', async () => {
    const p = await createPatient(patientInput());
    const other = await createPatient(patientInput({ name: 'Other' }));
    await saveAssessment(assessmentInput(p.id), [region]);
    await intakeRepo.add({ patientId: p.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'iv-crystalloid', amountMl: 500, source: '', notes: '' });
    await outputRepo.add({ patientId: p.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'urine', amountMl: 50, source: '', notes: '' });
    await observationRepo.add({ patientId: p.id, dateTime: '2026-03-01T09:00:00.000Z', parameter: 'heart-rate', value: 90, value2: null, unit: 'bpm', notes: '', meta: null });
    await intakeRepo.add({ patientId: other.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'oral', amountMl: 100, source: '', notes: '' });
    const counts = await deletePatient(p.id);
    expect(counts.assessments).toBe(1);
    expect(counts.assessmentRegions).toBe(1);
    expect(counts.timelineEvents).toBe(2);
    expect(await db.patients.get(p.id)).toBeUndefined();
    for (const t of ['assessments', 'assessmentRegions', 'intakeRecords', 'outputRecords', 'clinicalObservations', 'timelineEvents'])
      expect(await db.table(t).where('patientId').equals(p.id).count()).toBe(0);
    expect(await db.intakeRecords.where('patientId').equals(other.id).count()).toBe(1);
  });
});

describe('assessments', () => {
  it('saves assessments with regions; first is initial, then repeat; never overwrites', async () => {
    const p = await createPatient(patientInput());
    const a1 = await saveAssessment(assessmentInput(p.id), [region]);
    const a2 = await saveAssessment(assessmentInput(p.id, { assessmentDate: '2026-03-02T09:00:00.000Z', supersedesId: a1.id }), [region]);
    expect(a1.kind).toBe('initial');
    expect(a2.kind).toBe('repeat');
    const list = await listAssessmentsForPatient(p.id);
    expect(list.map((a) => a.id)).toEqual([a2.id, a1.id]);
    const old = await getAssessmentWithRegions(a1.id);
    expect(old!.assessment.supersededById).toBe(a2.id);
    expect(old!.regions).toHaveLength(1);
    expect(old!.assessment.tbsaTotal).toBe(13);
  });
  it('rejects an assessment for an unknown patient (relationship)', async () => {
    await expect(saveAssessment(assessmentInput('nope'), [region])).rejects.toThrow(/Patient not found/);
    expect(await db.assessments.count()).toBe(0);
  });
  it('rolls back the whole transaction when a region is invalid', async () => {
    const p = await createPatient(patientInput());
    await expect(saveAssessment(assessmentInput(p.id), [{ ...region, involvementPercent: 150 }])).rejects.toThrow();
    expect(await db.assessments.count()).toBe(0);
    expect(await db.assessmentRegions.count()).toBe(0);
  });
  it('deleting an assessment removes regions and its automatic timeline entry', async () => {
    const p = await createPatient(patientInput());
    const a = await saveAssessment(assessmentInput(p.id), [region]);
    await deleteAssessment(a.id);
    expect(await db.assessmentRegions.count()).toBe(0);
    expect(await db.timelineEvents.where('linkedRecordId').equals(a.id).count()).toBe(0);
  });
});

describe('records are patient-scoped', () => {
  it('lists intake for one patient within a date range only', async () => {
    const a = await createPatient(patientInput({ name: 'A' }));
    const b = await createPatient(patientInput({ name: 'B' }));
    await intakeRepo.add({ patientId: a.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'iv-crystalloid', amountMl: 500, source: '', notes: '' });
    await intakeRepo.add({ patientId: a.id, dateTime: '2026-03-02T09:00:00.000Z', category: 'iv-crystalloid', amountMl: 250, source: '', notes: '' });
    await intakeRepo.add({ patientId: b.id, dateTime: '2026-03-01T09:30:00.000Z', category: 'oral', amountMl: 999, source: '', notes: '' });
    const list = await intakeRepo.listForPatient(a.id, '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z');
    expect(list.map((r) => r.amountMl)).toEqual([500]);
    expect(await intakeRepo.listForPatient(a.id)).toHaveLength(2);
  });
  it('updates and deletes records; rejects invalid amounts', async () => {
    const a = await createPatient(patientInput());
    const r = await outputRepo.add({ patientId: a.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'urine', amountMl: 40, source: '', notes: '' });
    await outputRepo.update(r.id, { amountMl: 45 });
    expect((await db.outputRecords.get(r.id))!.amountMl).toBe(45);
    await expect(outputRepo.update(r.id, { amountMl: -1 })).rejects.toThrow();
    await outputRepo.remove(r.id);
    expect(await db.outputRecords.count()).toBe(0);
    await expect(timelineRepo.add({ patientId: a.id, dateTime: '2026-03-01T09:00:00.000Z', eventType: 'surgery', description: '', notes: '', linkedRecordId: null, linkedRecordType: null, system: false })).rejects.toThrow(/Description/);
  });
});

describe('reference verification workflow', () => {
  const v = { verifiedBy: 'Dr V', role: 'Burns consultant', verificationDate: '2026-02-01', notes: '', attestationConfirmed: true };
  it('templates are seeded NOT CONFIGURED and are idempotent', async () => {
    const all = await db.referenceDatasets.toArray();
    expect(all.length).toBe(4);
    expect(all.every((d) => d.status === 'not-configured' && !d.configured)).toBe(true);
    expect((await ensureBundledTemplates()).added).toEqual([]);
    expect(await db.fluidProtocols.count()).toBe(3);
  });
  it('verification makes a dataset usable and locks it', async () => {
    const ds = await verifyDataset('lund-browder-1944@1.0.0', v);
    expect(ds.status).toBe('verified');
    expect((await checkDatasetUsable(ds)).usable).toBe(true);
    await expect(updateDatasetDraft(ds.id, { population: 'x' })).rejects.toThrow(/cannot be edited/);
    const v2 = await createDatasetVersion(ds.id, '1.0.1');
    expect(v2.status).toBe('not-configured');
    expect((await db.referenceDatasets.get(ds.id))!.status).toBe('verified');
  });
  it('requires the attestation and refuses empty urine targets / incomplete protocols', async () => {
    await expect(verifyDataset('lund-browder-1944@1.0.0', { ...v, attestationConfirmed: false })).rejects.toThrow(/attestation/);
    await expect(verifyDataset('urine-output-targets-local@1.0.0', v)).rejects.toThrow(/No targets/);
    await expect(verifyProtocol('institutional-protocol@0.1.0', v)).rejects.toThrow(/incomplete/);
    const p = await verifyProtocol('parkland@1.0.0', v);
    expect((await checkProtocolUsable(p)).usable).toBe(true);
  });
});

describe('migrations', () => {
  it('upgrades a v1 database to the current schema without losing data', async () => {
    const name = `burn-tool-migration-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1_STORES);
    await v1.open();
    const legacyPatient = { ...patientInput(), id: 'p1', code: 'BT-LEGACY01', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } as Record<string, unknown>;
    delete legacyPatient.mechanismDetails;
    await v1.table('patients').add(legacyPatient);
    await v1.table('timelineEvents').add({ id: 'e1', patientId: 'p1', dateTime: '2026-01-01T00:00:00.000Z', eventType: 'admission', description: 'x', notes: '', linkedRecordId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    v1.close();

    const upgraded = new BurnToolDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    const p = await upgraded.patients.get('p1');
    expect(p?.name).toBe('Test Patient');
    expect(p?.mechanismDetails).toBe('');
    const e = await upgraded.timelineEvents.get('e1');
    expect(e?.system).toBe(false);
    expect(e?.linkedRecordType).toBeNull();
    await upgraded.drafts.put({ id: 'assessment', data: {}, updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(await upgraded.drafts.count()).toBe(1);
    upgraded.close();
  });
});

describe('schema', () => {
  it('declares all required tables with indexes', async () => {
    const { CURRENT_STORES } = await import('./schema');
    for (const t of ['patients', 'assessments', 'assessmentRegions', 'fluidProtocols', 'fluidCalculations', 'intakeRecords', 'outputRecords', 'clinicalObservations', 'timelineEvents', 'referenceDatasets', 'settings', 'auditEvents', 'drafts'])
      expect(CURRENT_STORES[t], t).toBeDefined();
    expect(CURRENT_STORES.clinicalObservations).toContain('[patientId+parameter]');
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(CURRENT_STORES).sort());
  });
});
