/**
 * Loads report data for exactly ONE patient. Every query is scoped by patientId and the
 * result is asserted again before rendering, so reports can never include another patient's data.
 */
import { db } from '@/database/db';
import type {
  Assessment,
  AssessmentRegion,
  ClinicalObservation,
  FluidCalculationRecord,
  IntakeRecord,
  OutputRecord,
  Patient,
  TimelineEvent,
} from '@/types/domain';

export interface ReportRange {
  start: string | null;
  end: string | null;
}

export interface PatientReportData {
  patient: Patient;
  assessments: Assessment[];
  regionsByAssessment: Map<string, AssessmentRegion[]>;
  fluidCalculations: FluidCalculationRecord[];
  intake: IntakeRecord[];
  output: OutputRecord[];
  observations: ClinicalObservation[];
  events: TimelineEvent[];
  range: ReportRange;
}

export class ReportScopeError extends Error {
  constructor() {
    super('Report data integrity check failed: a record does not belong to the selected patient.');
    this.name = 'ReportScopeError';
  }
}

const inRange = (iso: string, r: ReportRange) => (!r.start || iso >= r.start) && (!r.end || iso < r.end);

export async function loadPatientReportData(patientId: string, range: ReportRange = { start: null, end: null }): Promise<PatientReportData> {
  const patient = await db.patients.get(patientId);
  if (!patient) throw new Error('Patient not found.');
  const [assessments, regions, fluidCalculations, intake, output, observations, events] = await Promise.all([
    db.assessments.where('patientId').equals(patientId).toArray(),
    db.assessmentRegions.where('patientId').equals(patientId).toArray(),
    db.fluidCalculations.where('patientId').equals(patientId).toArray(),
    db.intakeRecords.where('patientId').equals(patientId).toArray(),
    db.outputRecords.where('patientId').equals(patientId).toArray(),
    db.clinicalObservations.where('patientId').equals(patientId).toArray(),
    db.timelineEvents.where('patientId').equals(patientId).toArray(),
  ]);
  for (const list of [assessments, regions, fluidCalculations, intake, output, observations, events] as { patientId: string }[][]) {
    if (list.some((r) => r.patientId !== patientId)) throw new ReportScopeError();
  }
  const regionsByAssessment = new Map<string, AssessmentRegion[]>();
  for (const r of regions) regionsByAssessment.set(r.assessmentId, [...(regionsByAssessment.get(r.assessmentId) ?? []), r]);
  for (const list of regionsByAssessment.values()) list.sort((a, b) => a.order - b.order);
  const byTime = <T,>(key: (x: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));
  return {
    patient,
    assessments: assessments.filter((a) => inRange(a.assessmentDate, range)).sort(byTime((a: Assessment) => a.assessmentDate)),
    regionsByAssessment,
    fluidCalculations: fluidCalculations.filter((c) => inRange(c.calculationDate, range)).sort(byTime((c: FluidCalculationRecord) => c.calculationDate)),
    intake: intake.filter((r) => inRange(r.dateTime, range)).sort(byTime((r: IntakeRecord) => r.dateTime)),
    output: output.filter((r) => inRange(r.dateTime, range)).sort(byTime((r: OutputRecord) => r.dateTime)),
    observations: observations.filter((o) => inRange(o.dateTime, range)).sort(byTime((o: ClinicalObservation) => o.dateTime)),
    events: events.filter((e) => inRange(e.dateTime, range)).sort(byTime((e: TimelineEvent) => e.dateTime)),
    range,
  };
}
