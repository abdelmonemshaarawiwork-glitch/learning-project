/**
 * Zod schemas for every persisted record. Used by repositories (write-time integrity)
 * and by backup restore (structure validation of imported files).
 */
import { z } from 'zod';
import { isValidIso } from '@/utils/dates';

const iso = z.string().refine((v) => isValidIso(v), { message: 'Invalid date/time' });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (yyyy-MM-dd)');
const finite = z.number().refine((v) => Number.isFinite(v), { message: 'Must be a finite number' });
const nonNeg = finite.refine((v) => v >= 0, { message: 'Must be 0 or more' });
const positive = finite.refine((v) => v > 0, { message: 'Must be greater than 0' });

export const surfaceSchema = z.enum(['anterior', 'posterior']);
export const depthSchema = z.enum(['superficial', 'superficial-partial', 'deep-partial', 'full-thickness', 'indeterminate']);
export const methodSchema = z.enum(['lund-browder', 'rule-of-nines', 'palm']);
export const intakeCategorySchema = z.enum(['iv-crystalloid', 'colloid', 'blood-product', 'enteral', 'oral', 'other-intake']);
export const outputCategorySchema = z.enum(['urine', 'drain', 'other-output']);
export const statusSchema = z.enum(['not-configured', 'verified', 'retired']);
export const timelineTypeSchema = z.enum([
  'admission',
  'initial-assessment',
  'repeat-assessment',
  'dressing',
  'debridement',
  'surgery',
  'infection-assessment',
  'culture-collection',
  'antibiotic-start',
  'antibiotic-modification',
  'antibiotic-end',
  'transfer',
  'discharge',
  'clinical-note',
  'other',
]);

export const patientSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().trim().min(1, 'Name or identifier is required').max(200),
  ageYears: nonNeg.max(130).nullable(),
  dateOfBirth: isoDate.nullable(),
  sex: z.enum(['female', 'male', 'other', 'unknown']),
  weightKg: positive.nullable(),
  heightCm: positive.nullable(),
  admissionDate: iso,
  injuryDate: iso.nullable(),
  mechanism: z.string(),
  mechanismDetails: z.string(),
  medicalHistory: z.string(),
  surgicalHistory: z.string(),
  allergies: z.string(),
  medications: z.string(),
  diagnosis: z.string(),
  notes: z.string(),
  status: z.enum(['admitted', 'discharged', 'transferred', 'deceased']),
  createdAt: iso,
  updatedAt: iso,
});

export const assessmentSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  method: methodSchema,
  assessmentDate: iso,
  ageAtAssessment: nonNeg.nullable(),
  ageSource: z.enum(['date-of-birth', 'recorded-age', 'unknown']),
  ageColumnId: z.string().nullable(),
  ageColumnLabel: z.string().nullable(),
  assessor: z.string(),
  tbsaTotal: nonNeg.max(100),
  tbsaExact: nonNeg.max(100.000001),
  tbsaIndeterminate: nonNeg,
  tbsaSuperficialExcluded: nonNeg,
  tbsaUpperBound: nonNeg,
  referenceDatasetId: z.string().nullable(),
  referenceVersion: z.string().nullable(),
  referenceName: z.string().nullable(),
  palmPercent: positive.nullable(),
  palmReference: z.string().nullable(),
  warnings: z.array(z.string()),
  limitationAcknowledged: z.boolean(),
  notes: z.string(),
  kind: z.enum(['initial', 'repeat']),
  supersedesId: z.string().nullable(),
  supersededById: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
});

export const assessmentRegionSchema = z.object({
  id: z.string().min(1),
  assessmentId: z.string().min(1),
  patientId: z.string().min(1),
  regionId: z.string().min(1),
  surface: surfaceSchema.nullable(),
  label: z.string(),
  depth: depthSchema,
  involvementPercent: nonNeg.max(100).nullable(),
  palmEquivalents: nonNeg.nullable(),
  referencePercent: nonNeg,
  tbsaContribution: nonNeg,
  eligible: z.boolean(),
  segmentKeys: z.array(z.string()),
  notes: z.string(),
  order: z.number().int(),
});

const sourceRefSchema = z.object({
  citation: z.string(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
});

const verificationSchema = z.object({
  verifiedBy: z.string().min(1),
  role: z.string().min(1),
  verificationDate: isoDate,
  attestation: z.string().min(1),
  notes: z.string(),
  recordedAt: iso,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
});

const ageRangeSchema = z.object({ min: nonNeg.nullable(), max: nonNeg.nullable() });

export const referenceDatasetSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  kind: z.enum(['lund-browder', 'rule-of-nines', 'palm', 'urine-output-targets']),
  name: z.string().min(1),
  version: z.string().min(1),
  source: z.string(),
  sources: z.array(sourceRefSchema),
  population: z.string(),
  ageRangeYears: ageRangeSchema,
  data: z.unknown(),
  status: statusSchema,
  configured: z.boolean(),
  verification: verificationSchema.nullable(),
  verificationDate: isoDate.nullable(),
  transcriptionNotes: z.string(),
  origin: z.enum(['bundled-template', 'user-defined', 'imported']),
  createdAt: iso,
  updatedAt: iso,
});

export const fluidProtocolSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  source: z.string(),
  sources: z.array(sourceRefSchema),
  population: z.string(),
  ageRangeYears: ageRangeSchema,
  parameters: z.object({
    mlPerKgPerPercentTbsa: positive.nullable(),
    periodHours: positive.nullable(),
    timeReference: z.enum(['injury', 'resuscitation-start']),
    phases: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        startHour: nonNeg,
        endHour: positive,
        fractionOfTotal: positive.max(1),
      }),
    ),
    fluidDescription: z.string(),
    countedIntakeCategories: z.array(intakeCategorySchema),
    applicabilityNotes: z.string(),
  }),
  status: statusSchema,
  configured: z.boolean(),
  verified: z.boolean(),
  verification: verificationSchema.nullable(),
  verificationDate: isoDate.nullable(),
  transcriptionNotes: z.string(),
  origin: z.enum(['bundled-template', 'user-defined', 'imported']),
  createdAt: iso,
  updatedAt: iso,
});

export const fluidCalculationSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  assessmentId: z.string().nullable(),
  protocolId: z.string().min(1),
  protocolName: z.string(),
  protocolVersion: z.string(),
  inputData: z.record(z.string(), z.unknown()),
  resultData: z.record(z.string(), z.unknown()),
  calculationDate: iso,
  notes: z.string(),
  createdAt: iso,
});

export const intakeRecordSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  dateTime: iso,
  category: intakeCategorySchema,
  amountMl: nonNeg,
  source: z.string(),
  notes: z.string(),
  createdAt: iso,
  updatedAt: iso,
});

export const outputRecordSchema = intakeRecordSchema.extend({ category: outputCategorySchema });

export const observationSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  dateTime: iso,
  parameter: z.string().min(1),
  value: finite,
  value2: finite.nullable(),
  unit: z.string(),
  notes: z.string(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  createdAt: iso,
  updatedAt: iso,
});

export const timelineEventSchema = z.object({
  id: z.string().min(1),
  patientId: z.string().min(1),
  dateTime: iso,
  eventType: timelineTypeSchema,
  description: z.string().trim().min(1, 'Description is required'),
  notes: z.string(),
  linkedRecordId: z.string().nullable(),
  linkedRecordType: z.enum(['assessment', 'fluid-calculation', 'observation']).nullable(),
  system: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});

export const settingSchema = z.object({ id: z.string().min(1), key: z.string().min(1), value: z.unknown(), updatedAt: iso });

export const auditEventSchema = z.object({
  id: z.number().int().optional(),
  timestamp: iso,
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  details: z.string(),
});

export const draftSchema = z.object({ id: z.string().min(1), data: z.unknown(), updatedAt: iso });

export const TABLE_SCHEMAS = {
  patients: patientSchema,
  assessments: assessmentSchema,
  assessmentRegions: assessmentRegionSchema,
  fluidProtocols: fluidProtocolSchema,
  fluidCalculations: fluidCalculationSchema,
  intakeRecords: intakeRecordSchema,
  outputRecords: outputRecordSchema,
  clinicalObservations: observationSchema,
  timelineEvents: timelineEventSchema,
  referenceDatasets: referenceDatasetSchema,
  settings: settingSchema,
  auditEvents: auditEventSchema,
  drafts: draftSchema,
} as const;

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'record'}: ${i.message}`).join('; ');
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(`Invalid ${what}: ${formatZodError(r.error)}`);
  return r.data;
}

/** Validates a record without altering it (the original object is what gets stored). */
export function validateOrThrow(schema: z.ZodType, value: unknown, what: string): void {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(`Invalid ${what}: ${formatZodError(r.error)}`);
}
