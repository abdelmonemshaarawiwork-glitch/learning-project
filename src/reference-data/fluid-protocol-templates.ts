/**
 * Bundled fluid-resuscitation protocol TEMPLATES.
 *
 * Shipped with status "not-configured". The application never calculates with a protocol until
 * a clinician has verified its parameters against the primary source and local policy
 * (Settings → Fluid protocols). The application never prescribes, orders or adjusts fluids.
 */
import type { FluidProtocol } from '@/types/domain';

type Template = Omit<
  FluidProtocol,
  'status' | 'configured' | 'verified' | 'verification' | 'verificationDate' | 'createdAt' | 'updatedAt'
>;

const TWO_PHASE_24H = [
  { id: 'phase-1', label: 'First 8 hours', startHour: 0, endHour: 8, fractionOfTotal: 0.5 },
  { id: 'phase-2', label: 'Next 16 hours', startHour: 8, endHour: 24, fractionOfTotal: 0.5 },
];

export const PARKLAND_TEMPLATE: Template = {
  id: 'parkland@1.0.0',
  key: 'parkland',
  name: 'Parkland formula',
  version: '1.0.0',
  description:
    'Estimated crystalloid volume for the first 24 hours after injury = coefficient × weight (kg) × %TBSA; one half estimated for the first 8 hours after injury and one half for the following 16 hours.',
  source:
    'Baxter CR, Shires T. Physiological response to crystalloid resuscitation of severe burns. Ann N Y Acad Sci. 1968;150(3):874–894.',
  sources: [
    {
      citation:
        'Baxter CR, Shires T. Physiological response to crystalloid resuscitation of severe burns. Ann N Y Acad Sci. 1968;150(3):874–894.',
      doi: '10.1111/j.1749-6632.1968.tb14738.x',
      pmid: '4973463',
    },
  ],
  population:
    'Described for adults with major burns. Applicability (minimum TBSA, paediatric use, electrical injury, inhalation injury) must be defined by institutional policy.',
  ageRangeYears: { min: null, max: null },
  parameters: {
    mlPerKgPerPercentTbsa: 4,
    periodHours: 24,
    timeReference: 'injury',
    phases: TWO_PHASE_24H,
    fluidDescription: "Lactated Ringer's solution (isotonic crystalloid)",
    countedIntakeCategories: ['iv-crystalloid'],
    applicabilityNotes:
      'Time is measured from the time of injury, not from arrival or start of resuscitation. Paediatric maintenance fluids are not included.',
  },
  transcriptionNotes:
    'Parameters (4 mL/kg/%TBSA over 24 h; ½ in first 8 h from injury, ½ over next 16 h) transcribed from the widely reproduced description of the Parkland formula; the citation identifies the originating publication (PubMed 4973463). Verify against the primary source and local protocol.',
  origin: 'bundled-template',
};

export const MODIFIED_BROOKE_TEMPLATE: Template = {
  id: 'modified-brooke-adult@1.0.0',
  key: 'modified-brooke-adult',
  name: 'Modified Brooke formula (adult)',
  version: '1.0.0',
  description:
    'Estimated crystalloid volume for the first 24 hours after injury = coefficient × weight (kg) × %TBSA; one half estimated for the first 8 hours after injury and one half for the following 16 hours.',
  source:
    'Pruitt BA Jr, Mason AD Jr, Moncrief JA. Hemodynamic changes in the early postburn patient: the influence of fluid administration and of a vasodilator (hydralazine). J Trauma. 1971;11(1):36–46.',
  sources: [
    {
      citation:
        'Pruitt BA Jr, Mason AD Jr, Moncrief JA. Hemodynamic changes in the early postburn patient: the influence of fluid administration and of a vasodilator (hydralazine). J Trauma. 1971;11(1):36–46.',
      doi: '10.1097/00005373-197101000-00003',
      pmid: '5099912',
      note: 'Commonly cited as the origin of the modified Brooke approach; confirm the attribution and parameters with your institutional reference.',
    },
  ],
  population: 'Adults. The paediatric variant uses different parameters and is NOT included in this template.',
  ageRangeYears: { min: null, max: null },
  parameters: {
    mlPerKgPerPercentTbsa: 2,
    periodHours: 24,
    timeReference: 'injury',
    phases: TWO_PHASE_24H,
    fluidDescription: "Lactated Ringer's solution (isotonic crystalloid)",
    countedIntakeCategories: ['iv-crystalloid'],
    applicabilityNotes: 'Adult template only. Time is measured from the time of injury.',
  },
  transcriptionNotes:
    'Parameters (2 mL/kg/%TBSA over 24 h; ½ in first 8 h from injury, ½ over next 16 h) transcribed from the widely reproduced adult modified Brooke description. Verify against the primary source and local protocol.',
  origin: 'bundled-template',
};

export const INSTITUTIONAL_TEMPLATE: Template = {
  id: 'institutional-protocol@0.1.0',
  key: 'institutional-protocol',
  name: 'Institution-defined protocol',
  version: '0.1.0',
  description: 'Blank template for an institution-defined protocol. Enter every parameter from your local protocol.',
  source: 'Not configured — enter the institutional protocol document reference.',
  sources: [],
  population: 'Not configured',
  ageRangeYears: { min: null, max: null },
  parameters: {
    mlPerKgPerPercentTbsa: null,
    periodHours: null,
    timeReference: 'injury',
    phases: [],
    fluidDescription: '',
    countedIntakeCategories: ['iv-crystalloid'],
    applicabilityNotes: '',
  },
  transcriptionNotes: 'Blank template — no parameters are provided by the application.',
  origin: 'bundled-template',
};

export const FLUID_PROTOCOL_TEMPLATES = [PARKLAND_TEMPLATE, MODIFIED_BROOKE_TEMPLATE, INSTITUTIONAL_TEMPLATE] as const;
