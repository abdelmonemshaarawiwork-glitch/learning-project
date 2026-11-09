/**
 * Bundled clinical reference TEMPLATES.
 *
 * IMPORTANT — READ BEFORE CHANGING:
 * - These values were transcribed by the software developer from the cited publications /
 *   widely reproduced versions of those publications. They are shipped with status
 *   "not-configured" and CANNOT be used for any calculation until a qualified clinician has
 *   compared every value with the primary source and recorded a verification in
 *   Settings → Clinical references.
 * - Bibliographic details marked with a PMID/DOI were confirmed against PubMed. The Lund and
 *   Browder (1944) article is not indexed in PubMed; its bibliographic details come from
 *   secondary citations and must be checked against the primary source.
 * - Never edit values here to "fix" a calculation. Create a new dataset version in the app
 *   (or bump the template version here) so previously saved assessments keep referencing the
 *   exact version they were calculated with.
 */
import type { ReferenceDataset, SourceReference } from '@/types/domain';
import type {
  PalmReferenceData,
  RegionalReferenceData,
  TbsaRegionRow,
  UrineOutputTargetData,
} from '@/engines/tbsa/types';

type Template<T> = Omit<
  ReferenceDataset<T>,
  'status' | 'configured' | 'verification' | 'verificationDate' | 'createdAt' | 'updatedAt'
>;

/* ------------------------------------------------------------------ */
/* Lund and Browder                                                    */
/* ------------------------------------------------------------------ */

const LB_COLUMNS = [
  { id: 'age-0', label: '0 yr (birth to <1 yr)', minAgeYears: 0, maxAgeYearsExclusive: 1 },
  { id: 'age-1', label: '1 yr (1 to <5 yr)', minAgeYears: 1, maxAgeYearsExclusive: 5 },
  { id: 'age-5', label: '5 yr (5 to <10 yr)', minAgeYears: 5, maxAgeYearsExclusive: 10 },
  { id: 'age-10', label: '10 yr (10 to <15 yr)', minAgeYears: 10, maxAgeYearsExclusive: 15 },
  { id: 'age-15', label: '15 yr (15 to <16 yr)', minAgeYears: 15, maxAgeYearsExclusive: 16 },
  { id: 'adult', label: 'Adult (≥16 yr)', minAgeYears: 16, maxAgeYearsExclusive: null },
];

const LB_COLUMN_IDS = LB_COLUMNS.map((c) => c.id);

/** Same value in every age column. */
function fixed(value: number): Record<string, number> {
  return Object.fromEntries(LB_COLUMN_IDS.map((id) => [id, value]));
}

/** Age-dependent values, in LB_COLUMNS order. */
function byAge(values: [number, number, number, number, number, number]): Record<string, number> {
  return Object.fromEntries(LB_COLUMN_IDS.map((id, i) => [id, values[i]]));
}

/** A = one half of the head; B = one half of one thigh; C = one half of one lower leg. */
const LB_A = byAge([9.5, 8.5, 6.5, 5.5, 4.5, 3.5]);
const LB_B = byAge([2.75, 3.25, 4, 4.25, 4.5, 4.75]);
const LB_C = byAge([2.5, 2.5, 2.75, 3, 3.25, 3.5]);

function bilateral(
  base: string,
  label: string,
  group: string,
  anterior: Record<string, number>,
  posterior: Record<string, number>,
): TbsaRegionRow[] {
  return (['right', 'left'] as const).flatMap((side) => {
    const sideLabel = side === 'right' ? 'Right' : 'Left';
    const id = `${base}-${side}`;
    return [
      { id, label: `${sideLabel} ${label}`, surface: 'anterior' as const, segments: [id], percentByColumn: anterior, group },
      { id, label: `${sideLabel} ${label}`, surface: 'posterior' as const, segments: [id], percentByColumn: posterior, group },
    ];
  });
}

const LUND_BROWDER_DATA: RegionalReferenceData = {
  method: 'lund-browder',
  columns: LB_COLUMNS,
  columnSelectionNote:
    'The published chart gives columns for ages 0, 1, 5, 10 and 15 years and adult. This template assigns each age to the column at or below it (age in completed years), e.g. 7 years → "5 yr" column. This is a convention, not part of the original chart: confirm it matches local policy. The clinician can override the column for each assessment.',
  regions: [
    { id: 'head', label: 'Head', surface: 'anterior', segments: ['head'], percentByColumn: LB_A, group: 'Head & neck' },
    { id: 'head', label: 'Head', surface: 'posterior', segments: ['head'], percentByColumn: LB_A, group: 'Head & neck' },
    { id: 'neck', label: 'Neck', surface: 'anterior', segments: ['neck'], percentByColumn: fixed(1), group: 'Head & neck' },
    { id: 'neck', label: 'Neck', surface: 'posterior', segments: ['neck'], percentByColumn: fixed(1), group: 'Head & neck' },
    { id: 'trunk', label: 'Trunk', surface: 'anterior', segments: ['trunk'], percentByColumn: fixed(13), group: 'Trunk' },
    { id: 'trunk', label: 'Trunk', surface: 'posterior', segments: ['trunk'], percentByColumn: fixed(13), group: 'Trunk' },
    { id: 'buttock-right', label: 'Right buttock', surface: 'posterior', segments: ['buttock-right'], percentByColumn: fixed(2.5), group: 'Trunk' },
    { id: 'buttock-left', label: 'Left buttock', surface: 'posterior', segments: ['buttock-left'], percentByColumn: fixed(2.5), group: 'Trunk' },
    { id: 'genitalia', label: 'Genitalia', surface: 'anterior', segments: ['genitalia'], percentByColumn: fixed(1), group: 'Trunk' },
    ...bilateral('upper-arm', 'upper arm', 'Upper limbs', fixed(2), fixed(2)),
    ...bilateral('forearm', 'forearm', 'Upper limbs', fixed(1.5), fixed(1.5)),
    ...bilateral('hand', 'hand', 'Upper limbs', fixed(1.25), fixed(1.25)),
    ...bilateral('thigh', 'thigh', 'Lower limbs', LB_B, LB_B),
    ...bilateral('leg', 'lower leg', 'Lower limbs', LB_C, LB_C),
    ...bilateral('foot', 'foot', 'Lower limbs', fixed(1.75), fixed(1.75)),
  ],
};

const LUND_BROWDER_SOURCES: SourceReference[] = [
  {
    citation: 'Lund CC, Browder NC. The estimation of areas of burns. Surg Gynecol Obstet. 1944;79:352–358.',
    note: 'Not indexed in PubMed. Bibliographic details taken from secondary citations — verify against the primary source.',
  },
];

export const LUND_BROWDER_TEMPLATE: Template<RegionalReferenceData> = {
  id: 'lund-browder-1944@1.0.0',
  key: 'lund-browder-1944',
  kind: 'lund-browder',
  name: 'Lund and Browder chart',
  version: '1.0.0',
  source: LUND_BROWDER_SOURCES[0]!.citation,
  sources: LUND_BROWDER_SOURCES,
  population: 'All ages (age-adjusted columns: 0, 1, 5, 10, 15 years and adult)',
  ageRangeYears: { min: 0, max: null },
  data: LUND_BROWDER_DATA,
  transcriptionNotes:
    'Values transcribed from the widely reproduced Lund and Browder chart: age-dependent A (½ head), B (½ one thigh) and C (½ one lower leg); fixed regions: neck 1+1, trunk 13+13, buttocks 2½ each, genitalia 1, upper arm 2+2, forearm 1½+1½, hand 1¼+1¼, foot 1¾+1¾ (anterior+posterior). Internal-consistency check: every age column sums to exactly 100%. The age-to-column assignment is an application convention (see column note).',
  origin: 'bundled-template',
};

/* ------------------------------------------------------------------ */
/* Rule of Nines (adult)                                               */
/* ------------------------------------------------------------------ */

function ron(value: number): Record<string, number> {
  return { adult: value };
}

const RULE_OF_NINES_DATA: RegionalReferenceData = {
  method: 'rule-of-nines',
  columns: [{ id: 'adult', label: 'Adult', minAgeYears: 16, maxAgeYearsExclusive: null }],
  columnSelectionNote:
    'Single adult column. The Rule of Nines is not age-adjusted; children have a proportionally larger head and smaller lower limbs. Use Lund and Browder for children.',
  regions: [
    { id: 'head-neck', label: 'Head and neck', surface: 'anterior', segments: ['head', 'neck'], percentByColumn: ron(4.5), group: 'Head & neck' },
    { id: 'head-neck', label: 'Head and neck', surface: 'posterior', segments: ['head', 'neck'], percentByColumn: ron(4.5), group: 'Head & neck' },
    { id: 'trunk', label: 'Trunk', surface: 'anterior', segments: ['trunk'], percentByColumn: ron(18), group: 'Trunk' },
    { id: 'trunk', label: 'Trunk (incl. buttocks)', surface: 'posterior', segments: ['trunk', 'buttock-right', 'buttock-left'], percentByColumn: ron(18), group: 'Trunk' },
    { id: 'perineum', label: 'Perineum / genitalia', surface: 'anterior', segments: ['genitalia'], percentByColumn: ron(1), group: 'Trunk' },
    { id: 'upper-limb-right', label: 'Right upper limb', surface: 'anterior', segments: ['upper-arm-right', 'forearm-right', 'hand-right'], percentByColumn: ron(4.5), group: 'Upper limbs' },
    { id: 'upper-limb-right', label: 'Right upper limb', surface: 'posterior', segments: ['upper-arm-right', 'forearm-right', 'hand-right'], percentByColumn: ron(4.5), group: 'Upper limbs' },
    { id: 'upper-limb-left', label: 'Left upper limb', surface: 'anterior', segments: ['upper-arm-left', 'forearm-left', 'hand-left'], percentByColumn: ron(4.5), group: 'Upper limbs' },
    { id: 'upper-limb-left', label: 'Left upper limb', surface: 'posterior', segments: ['upper-arm-left', 'forearm-left', 'hand-left'], percentByColumn: ron(4.5), group: 'Upper limbs' },
    { id: 'lower-limb-right', label: 'Right lower limb', surface: 'anterior', segments: ['thigh-right', 'leg-right', 'foot-right'], percentByColumn: ron(9), group: 'Lower limbs' },
    { id: 'lower-limb-right', label: 'Right lower limb', surface: 'posterior', segments: ['thigh-right', 'leg-right', 'foot-right'], percentByColumn: ron(9), group: 'Lower limbs' },
    { id: 'lower-limb-left', label: 'Left lower limb', surface: 'anterior', segments: ['thigh-left', 'leg-left', 'foot-left'], percentByColumn: ron(9), group: 'Lower limbs' },
    { id: 'lower-limb-left', label: 'Left lower limb', surface: 'posterior', segments: ['thigh-left', 'leg-left', 'foot-left'], percentByColumn: ron(9), group: 'Lower limbs' },
  ],
};

const RON_SOURCES: SourceReference[] = [
  {
    citation: 'Wallace AB. The exposure treatment of burns. Lancet. 1951;1(6653):501–504.',
    doi: '10.1016/s0140-6736(51)91975-7',
    pmid: '14805109',
  },
];

export const RULE_OF_NINES_TEMPLATE: Template<RegionalReferenceData> = {
  id: 'rule-of-nines-adult@1.0.0',
  key: 'rule-of-nines-adult',
  kind: 'rule-of-nines',
  name: 'Rule of Nines (adult)',
  version: '1.0.0',
  source: RON_SOURCES[0]!.citation,
  sources: RON_SOURCES,
  population: 'Adults only. Not valid for children without age adjustment.',
  ageRangeYears: { min: 16, max: null },
  data: RULE_OF_NINES_DATA,
  transcriptionNotes:
    'Regional values: head and neck 9, each upper limb 9, anterior trunk 18, posterior trunk 18, each lower limb 18, perineum 1 (sum 100). The equal anterior/posterior split of head-neck and limbs (4.5/4.5, 9/9) follows the convention used in teaching diagrams, not a separate measurement. The adult lower age bound (16 years) mirrors the Lund and Browder "Adult" column convention used by this application and must be confirmed against local policy.',
  origin: 'bundled-template',
};

/* ------------------------------------------------------------------ */
/* Palm method                                                         */
/* ------------------------------------------------------------------ */

const ROSSITER = 'Rossiter ND, Chapman P, Haywood IA. How big is a hand? Burns. 1996;22(3):230–231.';

const PALM_DATA: PalmReferenceData = {
  method: 'palm',
  options: [
    { id: 'palm-digits-male', label: 'Palm + palmar surface of digits — adult male (measured mean)', percent: 0.8, source: ROSSITER, population: 'Adult males' },
    { id: 'palm-digits-female', label: 'Palm + palmar surface of digits — adult female (measured mean)', percent: 0.7, source: ROSSITER, population: 'Adult females' },
    { id: 'palm-only-male', label: 'Palm only (no digits) — adult male (measured mean)', percent: 0.5, source: ROSSITER, population: 'Adult males' },
    { id: 'palm-only-female', label: 'Palm only (no digits) — adult female (measured mean)', percent: 0.4, source: ROSSITER, population: 'Adult females' },
  ],
  limitations: [
    'Hand surface area relative to body surface area differs between individuals, by sex, by body habitus and in children.',
    'Courses commonly teach that the patient’s whole palmar hand surface ≈ 1% TBSA; Rossiter et al. measured smaller mean values in adults, so using 1% may overestimate burn size.',
    'Always use the PATIENT’S hand, not the examiner’s. Best suited to small or scattered burns.',
    'Applicability of these adult measurements to children is not established by this dataset.',
  ],
};

export const PALM_TEMPLATE: Template<PalmReferenceData> = {
  id: 'palm-rossiter-1996@1.0.0',
  key: 'palm-rossiter-1996',
  kind: 'palm',
  name: 'Palm method reference values',
  version: '1.0.0',
  source: ROSSITER,
  sources: [{ citation: ROSSITER, doi: '10.1016/0305-4179(95)00118-2', pmid: '8726264' }],
  population: 'Adults (measured values). Children: not established.',
  ageRangeYears: { min: 16, max: null },
  data: PALM_DATA,
  transcriptionNotes:
    'Values from the abstract of Rossiter et al. (PubMed 8726264): palm alone 0.5% (male) / 0.4% (female); palm plus palmar surface of the five digits 0.8% (male) / 0.7% (female). The clinician must still enter the palm-equivalent percentage used for each assessment.',
  origin: 'bundled-template',
};

/* ------------------------------------------------------------------ */
/* Urine output targets — intentionally EMPTY                          */
/* ------------------------------------------------------------------ */

export const URINE_TARGETS_TEMPLATE: Template<UrineOutputTargetData> = {
  id: 'urine-output-targets-local@1.0.0',
  key: 'urine-output-targets-local',
  kind: 'urine-output-targets',
  name: 'Urine output targets (institutional)',
  version: '1.0.0',
  source: 'Not configured — enter the institutional protocol or guideline used.',
  sources: [],
  population: 'Defined per target (age / weight bands).',
  ageRangeYears: { min: null, max: null },
  data: { targets: [] },
  transcriptionNotes:
    'Shipped empty on purpose. Published urine-output targets differ between guidelines and between adult and paediatric populations, so no default is provided. Add age-specific targets with their reference and record a verification before results are labelled against a target.',
  origin: 'bundled-template',
};

export const REFERENCE_TEMPLATES = [
  LUND_BROWDER_TEMPLATE,
  RULE_OF_NINES_TEMPLATE,
  PALM_TEMPLATE,
  URINE_TARGETS_TEMPLATE,
] as const;
