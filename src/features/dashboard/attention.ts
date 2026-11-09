/**
 * Configurable attention flags for the dashboard. Every flag states the exact rule used.
 * Flags are prompts for review, never diagnoses. Numeric rules are disabled until configured.
 */
import type { AttentionFlagConfig } from '@/constants/settings';
import { evaluateThresholds, type ObservationThreshold } from '@/engines/thresholds';
import type { UrineOutputTarget } from '@/engines/tbsa/types';
import { classifyUrineOutput, selectUrineTarget } from '@/engines/urine-output';
import type { Assessment, ClinicalObservation, FluidProtocol, IntakeRecord, OutputRecord, Patient, ReferenceDataset } from '@/types/domain';
import { hoursBetween } from '@/utils/dates';
import { patientAgeYears } from '@/utils/patient';
import { formatCompact } from '@/utils/rounding';

export interface AttentionFlag {
  id: string;
  patientId: string | null;
  patientLabel: string | null;
  message: string;
  rule: string;
  tone: 'warning' | 'info';
  link: string;
}

export interface AttentionInput {
  config: AttentionFlagConfig;
  patients: Patient[];
  latestAssessment: Map<string, Assessment>;
  intake: IntakeRecord[];
  output: OutputRecord[];
  observations: ClinicalObservation[];
  thresholds: ObservationThreshold[];
  verifiedUrineTargets: UrineOutputTarget[];
  datasets: ReferenceDataset[];
  protocols: FluidProtocol[];
  now: string;
}

export function computeAttentionFlags(input: AttentionInput): AttentionFlag[] {
  const { config, now } = input;
  const flags: AttentionFlag[] = [];
  const admitted = input.patients.filter((p) => p.status === 'admitted');
  for (const p of admitted) {
    const label = `${p.name} (${p.code})`;
    const latest = input.latestAssessment.get(p.id);
    if (config.indeterminateDepth && latest && latest.tbsaIndeterminate > 0) {
      flags.push({
        id: `ind-${p.id}`,
        patientId: p.id,
        patientLabel: label,
        message: `Latest assessment has ${formatCompact(latest.tbsaIndeterminate, 1)}% TBSA of indeterminate depth (not included in ${formatCompact(latest.tbsaTotal, 1)}%).`,
        rule: 'Rule: latest assessment contains indeterminate depth.',
        tone: 'warning',
        link: `/assessment/${latest.id}`,
      });
    }
    if (config.tbsaAtLeast !== null && latest && latest.tbsaTotal >= config.tbsaAtLeast) {
      flags.push({
        id: `tbsa-${p.id}`,
        patientId: p.id,
        patientLabel: label,
        message: `Latest TBSA ${formatCompact(latest.tbsaTotal, 1)}%.`,
        rule: `Rule: TBSA ≥ ${formatCompact(config.tbsaAtLeast, 1)}% (user-configured).`,
        tone: 'info',
        link: `/patients/${p.id}`,
      });
    }
    if (config.assessmentOlderThanHours !== null) {
      const age = latest ? hoursBetween(latest.assessmentDate, now) : null;
      if (age === null || age > config.assessmentOlderThanHours) {
        flags.push({
          id: `old-${p.id}`,
          patientId: p.id,
          patientLabel: label,
          message: latest ? `Last burn assessment ${formatCompact(age, 0)} h ago.` : 'No burn assessment recorded.',
          rule: `Rule: no assessment within ${formatCompact(config.assessmentOlderThanHours, 0)} h (user-configured).`,
          tone: 'info',
          link: `/assessment?patient=${p.id}`,
        });
      }
    }
    if (config.noFluidRecordHours !== null) {
      const times = [...input.intake, ...input.output].filter((r) => r.patientId === p.id).map((r) => r.dateTime).sort();
      const last = times.at(-1);
      const gap = last ? hoursBetween(last, now) : null;
      if (gap === null || gap > config.noFluidRecordHours) {
        flags.push({
          id: `io-${p.id}`,
          patientId: p.id,
          patientLabel: label,
          message: last ? `Last intake/output record ${formatCompact(gap, 0)} h ago.` : 'No intake/output records.',
          rule: `Rule: no intake/output record within ${formatCompact(config.noFluidRecordHours, 0)} h (user-configured).`,
          tone: 'info',
          link: `/intake-output?patient=${p.id}`,
        });
      }
    }
    const obs = input.observations.filter((o) => o.patientId === p.id);
    const latestByParam = new Map<string, ClinicalObservation>();
    for (const o of obs) {
      const cur = latestByParam.get(o.parameter);
      if (!cur || o.dateTime > cur.dateTime) latestByParam.set(o.parameter, o);
    }
    if (config.observationOutsideThreshold) {
      for (const o of latestByParam.values()) {
        for (const e of evaluateThresholds(o, input.thresholds)) {
          if (e.status === 'within') continue;
          flags.push({ id: `obs-${o.id}-${e.thresholdId}`, patientId: p.id, patientLabel: label, message: e.message, rule: e.thresholdText, tone: 'warning', link: `/monitoring?patient=${p.id}` });
        }
      }
    }
    if (config.urineBelowVerifiedTarget && input.verifiedUrineTargets.length) {
      const u = latestByParam.get('urine-output');
      if (u) {
        const target = selectUrineTarget(input.verifiedUrineTargets, patientAgeYears(p, u.dateTime).age, p.weightKg);
        const c = classifyUrineOutput(u.value, target);
        if (c.status === 'below')
          flags.push({ id: `uo-${u.id}`, patientId: p.id, patientLabel: label, message: `Latest urine output ${formatCompact(u.value, 2)} mL/kg/h.`, rule: `Rule: ${c.message}`, tone: 'warning', link: `/intake-output/urine-output?patient=${p.id}` });
      }
    }
  }
  if (config.unconfiguredReferences) {
    const pending = [
      ...input.datasets.filter((d) => d.status === 'not-configured').map((d) => `${d.name} v${d.version}`),
      ...input.protocols.filter((p) => p.status === 'not-configured').map((p) => `${p.name} v${p.version}`),
    ];
    if (pending.length)
      flags.push({
        id: 'refs',
        patientId: null,
        patientLabel: null,
        message: `${pending.length} clinical reference(s) NOT CONFIGURED: ${pending.join(', ')}. Calculations using them are disabled until verified.`,
        rule: 'Rule: reference dataset or protocol without a clinical verification record.',
        tone: 'info',
        link: '/settings?tab=references',
      });
  }
  return flags;
}
