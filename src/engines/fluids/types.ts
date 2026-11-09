import type { FluidProtocolParameters } from '@/types/domain';

export interface FluidCalculationInput {
  weightKg: number;
  tbsaPercent: number;
  injuryTime: string;
  resuscitationStartTime: string | null;
  /** The moment the calculation refers to (usually "now"). */
  asOfTime: string;
  /** Administered volume counted for this protocol, from the reference time up to asOfTime. */
  administeredMl: number;
  protocol: {
    id: string;
    name: string;
    version: string;
    parameters: FluidProtocolParameters;
  };
}

export interface FluidPhaseResult {
  id: string;
  label: string;
  start: string;
  end: string;
  durationHours: number;
  volumeMl: number;
  /** Arithmetic average of the estimate across the phase window — informational, NOT an infusion rate. */
  averageMlPerHour: number;
  status: 'completed' | 'current' | 'upcoming';
  hoursRemaining: number;
}

export interface FluidCalculationResult {
  formulaText: string;
  totalVolumeMl: number;
  referenceTime: string;
  referenceLabel: string;
  periodEnd: string;
  hoursSinceInjury: number;
  hoursSinceResuscitationStart: number | null;
  hoursSinceReference: number;
  phases: FluidPhaseResult[];
  /** Cumulative estimate per the protocol schedule at asOfTime (even distribution within phases). */
  scheduledCumulativeMl: number;
  administeredMl: number;
  /** total − administered (negative means the administered volume exceeds the estimate). */
  remainingMl: number;
  periodElapsed: boolean;
  assumptions: string[];
  warnings: string[];
}

export interface FluidValidationIssue {
  field: string;
  message: string;
}

export type FluidCalculationOutcome =
  | { ok: true; result: FluidCalculationResult }
  | { ok: false; issues: FluidValidationIssue[] };
