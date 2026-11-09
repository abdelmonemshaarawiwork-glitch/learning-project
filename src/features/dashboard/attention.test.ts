import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/settings';
import type { Assessment, Patient } from '@/types/domain';
import { computeAttentionFlags, type AttentionInput } from './attention';

const now = '2026-03-02T12:00:00.000Z';
const patient = { id: 'p1', code: 'BT-1', name: 'P', status: 'admitted', ageYears: 40, dateOfBirth: null, weightKg: 70 } as Patient;
const assessment = { id: 'a1', patientId: 'p1', tbsaTotal: 25, tbsaIndeterminate: 3, assessmentDate: '2026-03-01T12:00:00.000Z' } as Assessment;

function input(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    config: { ...DEFAULT_SETTINGS.attentionFlags, unconfiguredReferences: false },
    patients: [patient],
    latestAssessment: new Map([['p1', assessment]]),
    intake: [],
    output: [],
    observations: [],
    thresholds: [],
    verifiedUrineTargets: [],
    datasets: [],
    protocols: [],
    now,
    ...over,
  };
}

describe('attention flags', () => {
  it('flags indeterminate depth by default and states the rule', () => {
    const flags = computeAttentionFlags(input());
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule).toContain('indeterminate');
  });
  it('numeric rules are off until configured', () => {
    const flags = computeAttentionFlags(input({ config: { ...DEFAULT_SETTINGS.attentionFlags, indeterminateDepth: false, unconfiguredReferences: false } }));
    expect(flags).toEqual([]);
  });
  it('applies configured TBSA, assessment age and I/O gap rules', () => {
    const flags = computeAttentionFlags(
      input({ config: { ...DEFAULT_SETTINGS.attentionFlags, indeterminateDepth: false, unconfiguredReferences: false, tbsaAtLeast: 20, assessmentOlderThanHours: 12, noFluidRecordHours: 4 } }),
    );
    expect(flags.map((f) => f.id.split('-')[0])).toEqual(['tbsa', 'old', 'io']);
    expect(flags[0]!.rule).toContain('≥ 20%');
  });
  it('flags observations outside configured thresholds only', () => {
    const obs = [{ id: 'o1', patientId: 'p1', dateTime: now, parameter: 'heart-rate', value: 140, value2: null, unit: 'bpm', notes: '', meta: null, createdAt: now, updatedAt: now }];
    const t = [{ id: 't', parameterId: 'heart-rate', field: 'value' as const, unit: 'bpm', low: null, high: 120, source: '', enabled: true }];
    const flags = computeAttentionFlags(input({ observations: obs, thresholds: t, config: { ...DEFAULT_SETTINGS.attentionFlags, indeterminateDepth: false, unconfiguredReferences: false } }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.rule).toContain('high > 120 bpm');
  });
  it('ignores discharged patients', () => {
    expect(computeAttentionFlags(input({ patients: [{ ...patient, status: 'discharged' }] }))).toEqual([]);
  });
});
