import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDatabaseForTests } from '@/database/db';
import { ensureBundledTemplates } from '@/database/bootstrap';
import { createPatient } from '@/database/repositories/patients';
import { intakeRepo } from '@/database/repositories/records';
import { saveAssessment } from '@/database/repositories/assessments';
import { patientInput } from '@/tests/fixtures';
import { analyseBackup, applyBackup, buildBackup, decryptBackup, encryptBackup, parseBackupText } from './index';

async function seed() {
  const a = await createPatient(patientInput({ name: 'Alpha' }));
  const b = await createPatient(patientInput({ name: 'Bravo' }));
  await intakeRepo.add({ patientId: a.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'iv-crystalloid', amountMl: 500, source: '', notes: '' });
  await intakeRepo.add({ patientId: b.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'oral', amountMl: 100, source: '', notes: '' });
  const asmt = await saveAssessment(
    {
      patientId: a.id, method: 'lund-browder', assessmentDate: '2026-03-01T09:00:00.000Z', ageAtAssessment: 40, ageSource: 'recorded-age',
      ageColumnId: 'adult', ageColumnLabel: 'Adult', assessor: '', tbsaTotal: 13, tbsaExact: 13, tbsaIndeterminate: 0, tbsaSuperficialExcluded: 0,
      tbsaUpperBound: 13, referenceDatasetId: 'lund-browder-1944@1.0.0', referenceVersion: '1.0.0', referenceName: 'LB', palmPercent: null,
      palmReference: null, warnings: [], limitationAcknowledged: false, notes: '', supersedesId: null,
    },
    [{ regionId: 'trunk', surface: 'anterior', label: 'Trunk', depth: 'deep-partial', involvementPercent: 100, palmEquivalents: null, referencePercent: 13, tbsaContribution: 13, eligible: true, segmentKeys: ['trunk:anterior'], notes: '', order: 0 }],
  );
  return { a, b, asmt };
}

beforeEach(async () => {
  await resetDatabaseForTests();
  await ensureBundledTemplates();
});

describe('backup export', () => {
  it('full backup contains all tables with counts and checksum', async () => {
    await seed();
    const backup = await buildBackup({ scope: 'all' });
    expect(backup.counts.patients).toBe(2);
    expect(backup.counts.intakeRecords).toBe(2);
    expect(backup.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
  it('patient backup contains only that patient (no unrelated data)', async () => {
    const { a } = await seed();
    const backup = await buildBackup({ scope: 'patients', patientIds: [a.id] });
    expect(backup.counts.patients).toBe(1);
    expect((backup.tables.intakeRecords as { patientId: string }[]).every((r) => r.patientId === a.id)).toBe(true);
    expect(backup.counts.referenceDatasets).toBe(1);
    expect(JSON.stringify(backup)).not.toContain('Bravo');
  });
});

describe('restore', () => {
  it('restores into an empty database', async () => {
    await seed();
    const backup = await buildBackup({ scope: 'all' });
    await resetDatabaseForTests();
    const analysis = await analyseBackup(JSON.parse(JSON.stringify(backup)));
    expect(analysis.compatible).toBe(true);
    expect(analysis.recordErrors).toEqual([]);
    const res = await applyBackup(analysis, 'skip-existing');
    expect(res.inserted.patients).toBe(2);
    expect(await db.patients.count()).toBe(2);
    expect(await db.assessmentRegions.count()).toBe(1);
  });
  it('skip-existing does not overwrite local records', async () => {
    const { a } = await seed();
    const backup = await buildBackup({ scope: 'all' });
    await db.patients.update(a.id, { name: 'Changed locally' });
    const analysis = await analyseBackup(backup);
    expect(analysis.duplicates.patients).toBe(2);
    const res = await applyBackup(analysis, 'skip-existing');
    expect(res.skipped.patients).toBe(2);
    expect((await db.patients.get(a.id))!.name).toBe('Changed locally');
  });
  it('replace-existing overwrites patient records but never reference datasets', async () => {
    const { a } = await seed();
    const backup = await buildBackup({ scope: 'all' });
    await db.patients.update(a.id, { name: 'Changed locally' });
    const res = await applyBackup(await analyseBackup(backup), 'replace-existing');
    expect(res.replaced.patients).toBe(2);
    expect(res.replaced.referenceDatasets).toBe(0);
    expect((await db.patients.get(a.id))!.name).toBe('Alpha');
  });
  it('import-as-copies assigns new ids and remaps relationships', async () => {
    const { a } = await seed();
    const backup = await buildBackup({ scope: 'patients', patientIds: [a.id] });
    await applyBackup(await analyseBackup(backup), 'import-as-copies');
    const alphas = await db.patients.filter((p) => p.name === 'Alpha').toArray();
    expect(alphas).toHaveLength(2);
    const copy = alphas.find((p) => p.id !== a.id)!;
    expect(copy.code).not.toBe(a.code);
    const copiedAssessment = await db.assessments.where('patientId').equals(copy.id).first();
    expect(copiedAssessment).toBeDefined();
    const regions = await db.assessmentRegions.where('assessmentId').equals(copiedAssessment!.id).toArray();
    expect(regions).toHaveLength(1);
    expect(regions[0]!.patientId).toBe(copy.id);
    const linked = await db.timelineEvents.where('linkedRecordId').equals(copiedAssessment!.id).count();
    expect(linked).toBe(1);
  });
  it('detects tampering, incompatible versions and invalid records', async () => {
    await seed();
    const backup = await buildBackup({ scope: 'all' });
    const tampered = structuredClone(backup);
    (tampered.tables.intakeRecords![0] as { amountMl: number }).amountMl = 9999;
    expect((await analyseBackup(tampered)).fatalErrors.join(' ')).toContain('Checksum');
    const newer = { ...structuredClone(backup), schemaVersion: 99 };
    expect((await analyseBackup(newer)).compatible).toBe(false);
    expect(parseBackupText('not json').kind).toBe('invalid');
    expect(parseBackupText('{"format":"other"}').kind).toBe('invalid');
    expect((await analyseBackup({ format: 'burn-tool-backup' })).compatible).toBe(false);
  });
  it('reports invalid records individually', async () => {
    await seed();
    const backup = await buildBackup({ scope: 'all' });
    (backup.tables.intakeRecords![0] as { amountMl: number }).amountMl = -5;
    const { sha256Hex, canonicalJson } = await import('@/engines/integrity');
    backup.checksum = await sha256Hex(canonicalJson(backup.tables));
    await resetDatabaseForTests();
    const analysis = await analyseBackup(backup);
    expect(analysis.compatible).toBe(true);
    expect(analysis.recordErrors).toHaveLength(1);
    expect(analysis.recordErrors[0]!.table).toBe('intakeRecords');
    expect(analysis.counts.intakeRecords).toBe(1);
  });
});

describe('encrypted backup', () => {
  it('round-trips with the correct password and fails with a wrong one', async () => {
    await seed();
    const backup = await buildBackup({ scope: 'all' });
    const enc = await encryptBackup(backup, 'correct horse battery', 100_000);
    const text = JSON.stringify(enc);
    expect(text).not.toContain('Alpha');
    const parsed = parseBackupText(text);
    expect(parsed.kind).toBe('encrypted');
    if (parsed.kind !== 'encrypted') return;
    const dec = await decryptBackup(parsed.file, 'correct horse battery');
    expect((await analyseBackup(dec)).compatible).toBe(true);
    await expect(decryptBackup(parsed.file, 'wrong password!!')).rejects.toThrow(/incorrect/);
  });
  it('rejects short passwords', async () => {
    const backup = await buildBackup({ scope: 'all' });
    await expect(encryptBackup(backup, 'short')).rejects.toThrow(/at least/);
  });
});
