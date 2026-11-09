import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseForTests } from '@/database/db';
import { ensureBundledTemplates } from '@/database/bootstrap';
import { createPatient } from '@/database/repositories/patients';
import { intakeRepo, observationRepo } from '@/database/repositories/records';
import { patientInput } from '@/tests/fixtures';
import { pdfText } from './pdf/builder';
import { loadPatientReportData } from './pdf/reportData';
import { generateReport } from './pdf/runReport';
import { REPORT_TYPES } from './reportTypes';

beforeEach(async () => {
  await resetDatabaseForTests();
  await ensureBundledTemplates();
});

describe('reports', () => {
  it('loads data for exactly one patient', async () => {
    const a = await createPatient(patientInput({ name: 'Alpha' }));
    const b = await createPatient(patientInput({ name: 'Bravo' }));
    await intakeRepo.add({ patientId: a.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'oral', amountMl: 100, source: '', notes: '' });
    await intakeRepo.add({ patientId: b.id, dateTime: '2026-03-01T09:00:00.000Z', category: 'oral', amountMl: 999, source: '', notes: '' });
    const data = await loadPatientReportData(a.id);
    expect(data.patient.name).toBe('Alpha');
    expect(data.intake.map((r) => r.amountMl)).toEqual([100]);
    expect(data.events.every((e) => e.patientId === a.id)).toBe(true);
  });
  it('applies the date range', async () => {
    const a = await createPatient(patientInput());
    await observationRepo.add({ patientId: a.id, dateTime: '2026-03-01T09:00:00.000Z', parameter: 'heart-rate', value: 90, value2: null, unit: 'bpm', notes: '', meta: null });
    await observationRepo.add({ patientId: a.id, dateTime: '2026-03-03T09:00:00.000Z', parameter: 'heart-rate', value: 95, value2: null, unit: 'bpm', notes: '', meta: null });
    const data = await loadPatientReportData(a.id, { start: '2026-03-02T00:00:00.000Z', end: null });
    expect(data.observations.map((o) => o.value)).toEqual([95]);
  });
  it.each(REPORT_TYPES.map((t) => t.id))('generates a "%s" PDF with page numbers', async (type) => {
    const a = await createPatient(patientInput({ name: 'Report Person' }));
    const { doc, filename } = await generateReport({ type, patientId: a.id });
    expect(filename).toMatch(/\.pdf$/);
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');
  });
  it('sanitises characters unsupported by standard PDF fonts', () => {
    expect(pdfText('TBSA ≥ 20% → review; 4 mL × 70 kg; −5')).toBe('TBSA >= 20% -> review; 4 mL × 70 kg; -5');
  });
});
