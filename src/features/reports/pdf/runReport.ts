import type { jsPDF } from 'jspdf';
import { BUILT_IN_OBSERVATION_PARAMETERS } from '@/constants/clinical';
import { db } from '@/database/db';
import { mergeSettings } from '@/hooks/useSettings';
import type { Assessment, ReferenceDataset } from '@/types/domain';
import { downloadBlob, safeFilename } from '@/utils/download';
import { formatDateTime, nowIso } from '@/utils/dates';
import { REPORT_TYPES, type ReportType } from '../reportTypes';
import { PdfBuilder } from './builder';
import { loadPatientReportData, type ReportRange } from './reportData';
import {
  assessmentSection,
  bodyMapSection,
  fluidSection,
  intakeOutputSection,
  monitoringSection,
  patientSection,
  summarySection,
  tbsaCalculationSection,
  timelineSection,
  urineSection,
  type SectionContext,
} from './sections';

export { REPORT_TYPES, type ReportType } from '../reportTypes';

export interface ReportRequest {
  type: ReportType;
  patientId?: string;
  /** For assessment-based reports; defaults to the latest current assessment. */
  assessmentId?: string;
  range?: ReportRange;
}

export async function generateReport(req: ReportRequest): Promise<{ doc: jsPDF; filename: string }> {
  let patientId = req.patientId;
  let assessment: Assessment | undefined;
  if (req.assessmentId) {
    assessment = await db.assessments.get(req.assessmentId);
    if (!assessment) throw new Error('Assessment not found.');
    if (patientId && assessment.patientId !== patientId) throw new Error('The assessment does not belong to the selected patient.');
    patientId = assessment.patientId;
  }
  if (!patientId) throw new Error('Select a patient.');

  const range = req.range ?? { start: null, end: null };
  const data = await loadPatientReportData(patientId, range);
  const settings = mergeSettings(await db.settings.toArray());
  const prefs = { dateFormat: settings.dateFormat, timeFormat: settings.timeFormat };
  const datasets = new Map<string, ReferenceDataset>((await db.referenceDatasets.toArray()).map((d) => [d.id, d]));
  const current = data.assessments.filter((a) => !a.supersededById);
  const target = assessment ?? current.at(-1);

  const meta = REPORT_TYPES.find((t) => t.id === req.type)!;
  const p = data.patient;
  const b = new PdfBuilder({
    title: meta.label,
    patientLine: `Patient: ${p.name}   |   ID ${p.code}   |   Admitted ${formatDateTime(p.admissionDate, prefs)}`,
    patientCode: p.code,
    generatedAt: formatDateTime(nowIso(), prefs),
    periodLine: range.start || range.end ? `Period: ${range.start ? formatDateTime(range.start, prefs) : 'start'} to ${range.end ? formatDateTime(range.end, prefs) : 'now'}` : undefined,
  });
  const ctx: SectionContext = { b, data, prefs, settings, params: [...BUILT_IN_OBSERVATION_PARAMETERS, ...settings.customObservationParameters], datasets };

  const needAssessment = () => {
    if (!target) {
      b.section('Burn assessment');
      b.paragraph('No burn assessment recorded for this patient in the selected period.', { muted: true });
      return null;
    }
    return target;
  };

  switch (req.type) {
    case 'patient-summary':
      patientSection(ctx);
      summarySection(ctx);
      break;
    case 'assessment': {
      const a = needAssessment();
      if (a) assessmentSection(ctx, a);
      break;
    }
    case 'tbsa': {
      const a = needAssessment();
      if (a) {
        assessmentSection(ctx, a, { map: false });
        tbsaCalculationSection(ctx, a);
      }
      break;
    }
    case 'body-map': {
      const a = needAssessment();
      if (a) bodyMapSection(ctx, a);
      break;
    }
    case 'fluid':
      fluidSection(ctx);
      break;
    case 'intake-output':
      intakeOutputSection(ctx);
      break;
    case 'urine-output':
      urineSection(ctx);
      break;
    case 'monitoring':
      monitoringSection(ctx);
      break;
    case 'complete':
      patientSection(ctx);
      summarySection(ctx);
      if (!current.length) needAssessment();
      for (const a of current) {
        assessmentSection(ctx, a);
        tbsaCalculationSection(ctx, a);
      }
      fluidSection(ctx);
      intakeOutputSection(ctx);
      urineSection(ctx);
      monitoringSection(ctx);
      timelineSection(ctx);
      break;
  }
  const doc = b.finalize();
  const filename = `burnmatrix-${req.type}-${safeFilename(p.code)}-${nowIso().slice(0, 16).replace(/[:T]/g, '')}.pdf`;
  return { doc, filename };
}

/** Generates a report and downloads it, opens it for printing, or returns the Blob. */
export async function runReport(req: ReportRequest, mode: 'download' | 'print' | 'blob' = 'download'): Promise<Blob | void> {
  const { doc, filename } = await generateReport(req);
  if (mode === 'blob') return doc.output('blob');
  if (mode === 'print' && !window.claude?.use) {
    doc.autoPrint();
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) await downloadBlob(blob, filename); // pop-up blocked: fall back to download
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  // The hosted preview cannot open the print dialog: the PDF is offered for saving instead.
  await downloadBlob(doc.output('blob'), filename);
}
