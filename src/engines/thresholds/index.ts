/**
 * Configurable observation warning thresholds.
 *
 * Thresholds are entered by the user/institution; none are shipped. A warning only states
 * that a value is outside a configured threshold and always shows that threshold.
 * It is never a diagnosis.
 *
 * Comparison semantics: "below" when value < low; "above" when value > high (bounds inclusive of "within").
 */
import { formatCompact } from '@/utils/rounding';

export interface ObservationThreshold {
  id: string;
  parameterId: string;
  /** Which value of the observation to compare: systolic/primary (value) or diastolic (value2). */
  field: 'value' | 'value2';
  unit: string;
  low: number | null;
  high: number | null;
  /** Free-text source / rationale (e.g. local protocol document). */
  source: string;
  enabled: boolean;
}

export interface ThresholdEvaluation {
  thresholdId: string;
  status: 'below' | 'above' | 'within';
  thresholdText: string;
  message: string;
}

export function describeThreshold(t: ObservationThreshold): string {
  const parts: string[] = [];
  if (t.low !== null) parts.push(`low < ${formatCompact(t.low, 3)} ${t.unit}`);
  if (t.high !== null) parts.push(`high > ${formatCompact(t.high, 3)} ${t.unit}`);
  return parts.length ? `User-configured threshold: ${parts.join('; ')}` : 'No bounds set';
}

export function evaluateThresholds(
  obs: { parameter: string; value: number; value2: number | null; unit: string },
  thresholds: readonly ObservationThreshold[],
): ThresholdEvaluation[] {
  const out: ThresholdEvaluation[] = [];
  for (const t of thresholds) {
    if (!t.enabled || t.parameterId !== obs.parameter || t.unit !== obs.unit) continue;
    if (t.low === null && t.high === null) continue;
    const v = t.field === 'value2' ? obs.value2 : obs.value;
    if (v === null || !Number.isFinite(v)) continue;
    const thresholdText = describeThreshold(t);
    const label = t.field === 'value2' ? 'Diastolic value' : 'Value';
    if (t.low !== null && v < t.low) {
      out.push({ thresholdId: t.id, status: 'below', thresholdText, message: `${label} ${formatCompact(v, 3)} ${obs.unit} is below the configured lower threshold of ${formatCompact(t.low, 3)} ${t.unit}.` });
    } else if (t.high !== null && v > t.high) {
      out.push({ thresholdId: t.id, status: 'above', thresholdText, message: `${label} ${formatCompact(v, 3)} ${obs.unit} is above the configured upper threshold of ${formatCompact(t.high, 3)} ${t.unit}.` });
    } else {
      out.push({ thresholdId: t.id, status: 'within', thresholdText, message: `${label} is within the configured threshold.` });
    }
  }
  return out;
}
