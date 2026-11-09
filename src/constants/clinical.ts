import type {
  AssessmentMethod,
  BurnDepth,
  IntakeCategory,
  OutputCategory,
  PatientSex,
  PatientStatus,
  Surface,
  TimelineEventType,
} from '@/types/domain';

export const APP_NAME = 'BURN TOOL';
export const APP_SUBTITLE = 'Advanced Burn Assessment & ICU Management Platform';
export const APP_VERSION = '1.2.0';

export const CLINICAL_DISCLAIMER =
  'Clinical decision-support software. All calculations and outputs require review by a qualified healthcare professional. This software is not a substitute for clinical judgment.';

/* ------------------------------------------------------------------ */
/* Burn depth                                                          */
/* ------------------------------------------------------------------ */

export interface BurnDepthDef {
  id: BurnDepth;
  label: string;
  short: string;
  /** Whether this depth contributes to TBSA. */
  tbsaEligible: boolean;
  /** Severity order used to pick a display colour when a region has several depths. */
  severity: number;
  color: string;
  description: string;
}

export const BURN_DEPTHS: readonly BurnDepthDef[] = [
  {
    id: 'superficial',
    label: 'Superficial',
    short: 'S',
    tbsaEligible: false,
    severity: 1,
    color: '#f1c27d',
    description: 'Epidermal only. Excluded from TBSA by definition.',
  },
  {
    id: 'superficial-partial',
    label: 'Superficial partial thickness',
    short: 'SPT',
    tbsaEligible: true,
    severity: 3,
    color: '#f08a8a',
    description: 'Partial thickness. Counts towards TBSA.',
  },
  {
    id: 'deep-partial',
    label: 'Deep partial thickness',
    short: 'DPT',
    tbsaEligible: true,
    severity: 4,
    color: '#d6334f',
    description: 'Partial thickness. Counts towards TBSA.',
  },
  {
    id: 'full-thickness',
    label: 'Full thickness',
    short: 'FT',
    tbsaEligible: true,
    severity: 5,
    color: '#6b1d3a',
    description: 'Full thickness. Counts towards TBSA.',
  },
  {
    id: 'indeterminate',
    label: 'Indeterminate',
    short: 'IND',
    tbsaEligible: false,
    severity: 2,
    color: '#8b5cf6',
    description:
      'Depth not yet determined. Reported separately and never silently classified; not included in the eligible TBSA total.',
  },
] as const;

export const BURN_DEPTH_MAP: Record<BurnDepth, BurnDepthDef> = Object.fromEntries(
  BURN_DEPTHS.map((d) => [d.id, d]),
) as Record<BurnDepth, BurnDepthDef>;

export const TBSA_ELIGIBLE_DEPTHS: readonly BurnDepth[] = BURN_DEPTHS.filter((d) => d.tbsaEligible).map(
  (d) => d.id,
);

/** Contributions are displayed to 2 decimals; totals to 1 decimal. See docs/MEDICAL_CALCULATIONS.md. */
export const TBSA_CONTRIBUTION_DECIMALS = 2;
export const TBSA_TOTAL_DECIMALS = 1;

export const ASSESSMENT_METHODS: readonly { id: AssessmentMethod; label: string; description: string }[] = [
  {
    id: 'lund-browder',
    label: 'Lund and Browder',
    description: 'Age-adjusted regional chart with anterior and posterior surfaces.',
  },
  {
    id: 'rule-of-nines',
    label: 'Rule of Nines',
    description: 'Adult regional estimate in multiples of 9%. Not age-adjusted.',
  },
  {
    id: 'palm',
    label: 'Palm method',
    description: 'Clinician-entered palm-equivalent estimates for small or scattered burns.',
  },
];

export const METHOD_LABEL: Record<AssessmentMethod, string> = {
  'lund-browder': 'Lund and Browder',
  'rule-of-nines': 'Rule of Nines',
  palm: 'Palm method',
};

export const SURFACE_LABEL: Record<Surface, string> = {
  anterior: 'Anterior',
  posterior: 'Posterior',
};

/* ------------------------------------------------------------------ */
/* Body segments (shared by the 2D and 3D body maps)                   */
/* ------------------------------------------------------------------ */

export type BodySegmentId =
  | 'head'
  | 'neck'
  | 'trunk'
  | 'buttock-right'
  | 'buttock-left'
  | 'genitalia'
  | 'upper-arm-right'
  | 'upper-arm-left'
  | 'forearm-right'
  | 'forearm-left'
  | 'hand-right'
  | 'hand-left'
  | 'thigh-right'
  | 'thigh-left'
  | 'leg-right'
  | 'leg-left'
  | 'foot-right'
  | 'foot-left';

export interface BodySegmentDef {
  id: BodySegmentId;
  label: string;
  surfaces: readonly Surface[];
}

export const BODY_SEGMENTS: readonly BodySegmentDef[] = [
  { id: 'head', label: 'Head', surfaces: ['anterior', 'posterior'] },
  { id: 'neck', label: 'Neck', surfaces: ['anterior', 'posterior'] },
  { id: 'trunk', label: 'Trunk', surfaces: ['anterior', 'posterior'] },
  { id: 'buttock-right', label: 'Right buttock', surfaces: ['posterior'] },
  { id: 'buttock-left', label: 'Left buttock', surfaces: ['posterior'] },
  { id: 'genitalia', label: 'Genitalia / perineum', surfaces: ['anterior'] },
  { id: 'upper-arm-right', label: 'Right upper arm', surfaces: ['anterior', 'posterior'] },
  { id: 'upper-arm-left', label: 'Left upper arm', surfaces: ['anterior', 'posterior'] },
  { id: 'forearm-right', label: 'Right forearm', surfaces: ['anterior', 'posterior'] },
  { id: 'forearm-left', label: 'Left forearm', surfaces: ['anterior', 'posterior'] },
  { id: 'hand-right', label: 'Right hand', surfaces: ['anterior', 'posterior'] },
  { id: 'hand-left', label: 'Left hand', surfaces: ['anterior', 'posterior'] },
  { id: 'thigh-right', label: 'Right thigh', surfaces: ['anterior', 'posterior'] },
  { id: 'thigh-left', label: 'Left thigh', surfaces: ['anterior', 'posterior'] },
  { id: 'leg-right', label: 'Right lower leg', surfaces: ['anterior', 'posterior'] },
  { id: 'leg-left', label: 'Left lower leg', surfaces: ['anterior', 'posterior'] },
  { id: 'foot-right', label: 'Right foot', surfaces: ['anterior', 'posterior'] },
  { id: 'foot-left', label: 'Left foot', surfaces: ['anterior', 'posterior'] },
];

export const BODY_SEGMENT_MAP: Record<BodySegmentId, BodySegmentDef> = Object.fromEntries(
  BODY_SEGMENTS.map((s) => [s.id, s]),
) as Record<BodySegmentId, BodySegmentDef>;

export function segmentKey(segment: string, surface: Surface): string {
  return `${segment}:${surface}`;
}

export function parseSegmentKey(key: string): { segment: BodySegmentId; surface: Surface } | null {
  const [segment, surface] = key.split(':');
  if (!segment || (surface !== 'anterior' && surface !== 'posterior')) return null;
  if (!(segment in BODY_SEGMENT_MAP)) return null;
  return { segment: segment as BodySegmentId, surface };
}

export function segmentKeyLabel(key: string): string {
  const parsed = parseSegmentKey(key);
  if (!parsed) return key;
  return `${BODY_SEGMENT_MAP[parsed.segment].label} (${SURFACE_LABEL[parsed.surface].toLowerCase()})`;
}

/** All valid segment keys (segment:surface). */
export const ALL_SEGMENT_KEYS: readonly string[] = BODY_SEGMENTS.flatMap((s) =>
  s.surfaces.map((surface) => segmentKey(s.id, surface)),
);

/* ------------------------------------------------------------------ */
/* Patients                                                            */
/* ------------------------------------------------------------------ */

export const SEX_OPTIONS: readonly { id: PatientSex; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
  { id: 'unknown', label: 'Unknown / not recorded' },
];

export const STATUS_OPTIONS: readonly { id: PatientStatus; label: string }[] = [
  { id: 'admitted', label: 'Admitted' },
  { id: 'discharged', label: 'Discharged' },
  { id: 'transferred', label: 'Transferred' },
  { id: 'deceased', label: 'Deceased' },
];

export const MECHANISM_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'flame', label: 'Flame' },
  { id: 'scald', label: 'Scald' },
  { id: 'contact', label: 'Contact' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'chemical', label: 'Chemical' },
  { id: 'flash', label: 'Flash' },
  { id: 'friction', label: 'Friction' },
  { id: 'radiation', label: 'Radiation' },
  { id: 'cold', label: 'Cold injury' },
  { id: 'other', label: 'Other' },
  { id: 'unknown', label: 'Unknown' },
];

/* ------------------------------------------------------------------ */
/* Intake / output                                                     */
/* ------------------------------------------------------------------ */

export const INTAKE_CATEGORIES: readonly { id: IntakeCategory; label: string }[] = [
  { id: 'iv-crystalloid', label: 'IV crystalloids' },
  { id: 'colloid', label: 'Colloids' },
  { id: 'blood-product', label: 'Blood products' },
  { id: 'enteral', label: 'Enteral fluids' },
  { id: 'oral', label: 'Oral fluids' },
  { id: 'other-intake', label: 'Other intake' },
];

export const OUTPUT_CATEGORIES: readonly { id: OutputCategory; label: string }[] = [
  { id: 'urine', label: 'Urine' },
  { id: 'drain', label: 'Drains' },
  { id: 'other-output', label: 'Other measured output' },
];

export const INTAKE_LABEL = Object.fromEntries(INTAKE_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  IntakeCategory,
  string
>;
export const OUTPUT_LABEL = Object.fromEntries(OUTPUT_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  OutputCategory,
  string
>;

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

export const TIMELINE_EVENT_TYPES: readonly { id: TimelineEventType; label: string }[] = [
  { id: 'admission', label: 'Admission' },
  { id: 'initial-assessment', label: 'Initial burn assessment' },
  { id: 'repeat-assessment', label: 'Repeat assessment' },
  { id: 'dressing', label: 'Dressing' },
  { id: 'debridement', label: 'Debridement' },
  { id: 'surgery', label: 'Surgery' },
  { id: 'infection-assessment', label: 'Infection assessment' },
  { id: 'culture-collection', label: 'Culture collection' },
  { id: 'antibiotic-start', label: 'Antibiotic start' },
  { id: 'antibiotic-modification', label: 'Antibiotic modification' },
  { id: 'antibiotic-end', label: 'Antibiotic end' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'discharge', label: 'Discharge' },
  { id: 'clinical-note', label: 'Clinical note' },
  { id: 'other', label: 'Other' },
];

export const TIMELINE_LABEL = Object.fromEntries(TIMELINE_EVENT_TYPES.map((t) => [t.id, t.label])) as Record<
  TimelineEventType,
  string
>;

/* ------------------------------------------------------------------ */
/* Observations                                                        */
/* ------------------------------------------------------------------ */

export interface ObservationParameterDef {
  id: string;
  label: string;
  unit: string;
  decimals: number;
  /** 'bp' parameters record systolic (value) and diastolic (value2). */
  kind: 'single' | 'bp';
  builtIn: boolean;
}

export const BUILT_IN_OBSERVATION_PARAMETERS: readonly ObservationParameterDef[] = [
  { id: 'heart-rate', label: 'Heart rate', unit: 'bpm', decimals: 0, kind: 'single', builtIn: true },
  { id: 'blood-pressure', label: 'Blood pressure', unit: 'mmHg', decimals: 0, kind: 'bp', builtIn: true },
  { id: 'map', label: 'Mean arterial pressure', unit: 'mmHg', decimals: 0, kind: 'single', builtIn: true },
  { id: 'temperature', label: 'Temperature', unit: '°C', decimals: 1, kind: 'single', builtIn: true },
  { id: 'respiratory-rate', label: 'Respiratory rate', unit: 'breaths/min', decimals: 0, kind: 'single', builtIn: true },
  { id: 'spo2', label: 'SpO₂', unit: '%', decimals: 0, kind: 'single', builtIn: true },
  { id: 'lactate', label: 'Lactate', unit: 'mmol/L', decimals: 1, kind: 'single', builtIn: true },
  { id: 'creatinine', label: 'Creatinine', unit: 'µmol/L', decimals: 0, kind: 'single', builtIn: true },
  { id: 'urine-output', label: 'Urine output', unit: 'mL/kg/h', decimals: 2, kind: 'single', builtIn: true },
  { id: 'weight', label: 'Weight', unit: 'kg', decimals: 1, kind: 'single', builtIn: true },
];
