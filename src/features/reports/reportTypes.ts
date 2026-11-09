export type ReportType =
  | 'patient-summary'
  | 'assessment'
  | 'tbsa'
  | 'body-map'
  | 'fluid'
  | 'intake-output'
  | 'urine-output'
  | 'monitoring'
  | 'complete';

export const REPORT_TYPES: { id: ReportType; label: string; description: string; needsAssessment?: boolean }[] = [
  { id: 'patient-summary', label: 'Patient summary', description: 'Demographics, history and a summary of the latest results.' },
  { id: 'assessment', label: 'Burn assessment report', description: 'Method, TBSA result, warnings, regional breakdown and body map.', needsAssessment: true },
  { id: 'tbsa', label: 'TBSA calculation report', description: 'Step-by-step calculation, dataset version and verification.', needsAssessment: true },
  { id: 'body-map', label: '3D/2D burn mapping report', description: 'Colour-coded body map and mapped regions.', needsAssessment: true },
  { id: 'fluid', label: 'Fluid management report', description: 'Saved protocol estimates, phases, administered and remaining volumes.' },
  { id: 'intake-output', label: 'Intake/output report', description: 'Totals, categories, daily and hourly balances, records.' },
  { id: 'urine-output', label: 'Urine output report', description: 'Urine-output rates (mL/kg/h) and recorded urine volumes.' },
  { id: 'monitoring', label: 'Clinical monitoring report', description: 'Observations with configured threshold checks.' },
  { id: 'complete', label: 'Complete patient report', description: 'All sections above plus the clinical timeline.' },
];
