/**
 * Core domain types for BURN TOOL.
 *
 * All timestamps are ISO-8601 strings in UTC (e.g. "2026-01-31T14:05:00.000Z"),
 * which sort lexicographically and are portable across backups.
 * All clinical quantities are stored in SI-style units: kg, cm, mL, hours, °C.
 */

export type ISODateTime = string;
/** Calendar date without time, yyyy-MM-dd. */
export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Patients                                                            */
/* ------------------------------------------------------------------ */

export type PatientSex = 'female' | 'male' | 'other' | 'unknown';
export type PatientStatus = 'admitted' | 'discharged' | 'transferred' | 'deceased';

export interface Patient {
  id: string;
  /** Human-readable, automatically generated identifier (e.g. BT-7K3Q9XAB). */
  code: string;
  /** Patient name or an anonymised identifier. */
  name: string;
  /** Age in years as recorded at admission (used when date of birth is unknown). */
  ageYears: number | null;
  dateOfBirth: ISODate | null;
  sex: PatientSex;
  weightKg: number | null;
  heightCm: number | null;
  admissionDate: ISODateTime;
  injuryDate: ISODateTime | null;
  mechanism: string;
  mechanismDetails: string;
  medicalHistory: string;
  surgicalHistory: string;
  allergies: string;
  medications: string;
  diagnosis: string;
  notes: string;
  status: PatientStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Burn assessment                                                     */
/* ------------------------------------------------------------------ */

export type AssessmentMethod = 'lund-browder' | 'rule-of-nines' | 'palm';
export type Surface = 'anterior' | 'posterior';
export type BurnDepth =
  | 'superficial'
  | 'superficial-partial'
  | 'deep-partial'
  | 'full-thickness'
  | 'indeterminate';

export interface Assessment {
  id: string;
  patientId: string;
  method: AssessmentMethod;
  assessmentDate: ISODateTime;
  /** Age in completed years at the time of assessment, if known. */
  ageAtAssessment: number | null;
  ageSource: 'date-of-birth' | 'recorded-age' | 'unknown';
  /** Lund & Browder / Rule of Nines age column used. */
  ageColumnId: string | null;
  ageColumnLabel: string | null;
  assessor: string;
  /** Eligible TBSA (partial + full thickness), rounded for display/storage. */
  tbsaTotal: number;
  /** Eligible TBSA before rounding. */
  tbsaExact: number;
  /** Area recorded with indeterminate depth (NOT included in tbsaTotal). */
  tbsaIndeterminate: number;
  /** Superficial area (excluded from TBSA by definition). */
  tbsaSuperficialExcluded: number;
  /** tbsaTotal + tbsaIndeterminate: the value if all indeterminate areas proved eligible. */
  tbsaUpperBound: number;
  referenceDatasetId: string | null;
  referenceVersion: string | null;
  referenceName: string | null;
  /** Palm method only: %TBSA represented by one palm-equivalent for this patient. */
  palmPercent: number | null;
  palmReference: string | null;
  warnings: string[];
  limitationAcknowledged: boolean;
  notes: string;
  kind: 'initial' | 'repeat';
  /** Set when this assessment amends an earlier one (the earlier one is never overwritten). */
  supersedesId: string | null;
  supersededById: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AssessmentRegion {
  id: string;
  assessmentId: string;
  patientId: string;
  /** Region id from the reference dataset (or body segment id for the palm method). */
  regionId: string;
  surface: Surface | null;
  label: string;
  depth: BurnDepth;
  /** Percentage of the region involved (Lund & Browder / Rule of Nines). */
  involvementPercent: number | null;
  /** Number of palm-equivalents (palm method). */
  palmEquivalents: number | null;
  /** Reference %TBSA of the whole region (or of one palm). */
  referencePercent: number;
  /** Exact (unrounded) contribution in %TBSA. */
  tbsaContribution: number;
  /** Whether this contribution counts towards TBSA. */
  eligible: boolean;
  /** Body-map segment keys covered (segmentId:surface). */
  segmentKeys: string[];
  notes: string;
  order: number;
}

/* ------------------------------------------------------------------ */
/* Clinical references (version-controlled, verification-gated)        */
/* ------------------------------------------------------------------ */

export type ReferenceKind = 'lund-browder' | 'rule-of-nines' | 'palm' | 'urine-output-targets';
export type ConfigurationStatus = 'not-configured' | 'verified' | 'retired';

export interface SourceReference {
  citation: string;
  doi?: string;
  pmid?: string;
  url?: string;
  note?: string;
}

export interface VerificationRecord {
  verifiedBy: string;
  role: string;
  /** Date on which the values were compared with the cited source (yyyy-MM-dd). */
  verificationDate: ISODate;
  attestation: string;
  notes: string;
  recordedAt: ISODateTime;
  /** SHA-256 of the canonical JSON of the verified data; any later change invalidates verification. */
  contentHash: string;
}

export interface AgeRangeYears {
  /** Inclusive lower bound in years, or null for none. */
  min: number | null;
  /** Exclusive upper bound in years, or null for none. */
  max: number | null;
}

export interface ReferenceDataset<TData = unknown> {
  id: string;
  /** Stable family key shared by all versions of a dataset. */
  key: string;
  kind: ReferenceKind;
  name: string;
  version: string;
  /** Primary citation (human readable). */
  source: string;
  sources: SourceReference[];
  population: string;
  ageRangeYears: AgeRangeYears;
  data: TData;
  status: ConfigurationStatus;
  /** True only when status === 'verified' and verification matches the data. */
  configured: boolean;
  verification: VerificationRecord | null;
  verificationDate: ISODate | null;
  /** How the values were entered (transcription provenance). */
  transcriptionNotes: string;
  origin: 'bundled-template' | 'user-defined' | 'imported';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Fluid management                                                    */
/* ------------------------------------------------------------------ */

export interface FluidProtocolPhase {
  id: string;
  label: string;
  /** Hours after the protocol time reference. */
  startHour: number;
  endHour: number;
  /** Fraction (0–1) of the total estimated volume allocated to this phase. */
  fractionOfTotal: number;
}

export interface FluidProtocolParameters {
  /** Volume coefficient: mL per kg per %TBSA. */
  mlPerKgPerPercentTbsa: number | null;
  /** Length of the estimation period in hours. */
  periodHours: number | null;
  /** The clock the phases are measured from. */
  timeReference: 'injury' | 'resuscitation-start';
  phases: FluidProtocolPhase[];
  fluidDescription: string;
  /** Intake categories counted as "administered" for this protocol. */
  countedIntakeCategories: IntakeCategory[];
  applicabilityNotes: string;
}

export interface FluidProtocol {
  id: string;
  key: string;
  name: string;
  version: string;
  description: string;
  source: string;
  sources: SourceReference[];
  population: string;
  ageRangeYears: AgeRangeYears;
  parameters: FluidProtocolParameters;
  status: ConfigurationStatus;
  configured: boolean;
  verified: boolean;
  verification: VerificationRecord | null;
  verificationDate: ISODate | null;
  transcriptionNotes: string;
  origin: 'bundled-template' | 'user-defined' | 'imported';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FluidCalculationRecord {
  id: string;
  patientId: string;
  assessmentId: string | null;
  protocolId: string;
  protocolName: string;
  protocolVersion: string;
  inputData: import('@/engines/fluids/types').FluidCalculationInput;
  resultData: import('@/engines/fluids/types').FluidCalculationResult;
  calculationDate: ISODateTime;
  notes: string;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Intake / output                                                     */
/* ------------------------------------------------------------------ */

export type IntakeCategory =
  | 'iv-crystalloid'
  | 'colloid'
  | 'blood-product'
  | 'enteral'
  | 'oral'
  | 'other-intake';

export type OutputCategory = 'urine' | 'drain' | 'other-output';

export interface IntakeRecord {
  id: string;
  patientId: string;
  dateTime: ISODateTime;
  category: IntakeCategory;
  amountMl: number;
  /** Optional source/details, e.g. fluid name or route. */
  source: string;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface OutputRecord {
  id: string;
  patientId: string;
  dateTime: ISODateTime;
  category: OutputCategory;
  amountMl: number;
  source: string;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Monitoring & timeline                                               */
/* ------------------------------------------------------------------ */

export interface ClinicalObservation {
  id: string;
  patientId: string;
  dateTime: ISODateTime;
  parameter: string;
  value: number;
  /** Second value for paired parameters (diastolic blood pressure). */
  value2: number | null;
  unit: string;
  notes: string;
  /** Structured details, e.g. inputs of a urine-output calculation. */
  meta: Record<string, unknown> | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type TimelineEventType =
  | 'admission'
  | 'initial-assessment'
  | 'repeat-assessment'
  | 'dressing'
  | 'debridement'
  | 'surgery'
  | 'infection-assessment'
  | 'culture-collection'
  | 'antibiotic-start'
  | 'antibiotic-modification'
  | 'antibiotic-end'
  | 'transfer'
  | 'discharge'
  | 'clinical-note'
  | 'other';

export interface TimelineEvent {
  id: string;
  patientId: string;
  dateTime: ISODateTime;
  eventType: TimelineEventType;
  description: string;
  notes: string;
  linkedRecordId: string | null;
  linkedRecordType: 'assessment' | 'fluid-calculation' | 'observation' | null;
  /** True when created automatically by the application (e.g. on admission). */
  system: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Settings, audit, drafts                                             */
/* ------------------------------------------------------------------ */

export interface SettingRecord {
  id: string;
  key: string;
  value: unknown;
  updatedAt: ISODateTime;
}

export interface AuditEvent {
  id?: number;
  timestamp: ISODateTime;
  action: string;
  entityType: string;
  entityId: string;
  /** Non-identifying details only (never names or free-text clinical notes). */
  details: string;
}

export interface DraftRecord {
  id: string;
  data: unknown;
  updatedAt: ISODateTime;
}
