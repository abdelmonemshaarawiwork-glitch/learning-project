import { describe, expect, it } from 'vitest';
import { INSTITUTIONAL_TEMPLATE, PARKLAND_TEMPLATE } from '@/reference-data/fluid-protocol-templates';
import { calculateFluidEstimate, type FluidCalculationInput } from './index';

const injury = '2026-03-01T08:00:00.000Z';

function input(over: Partial<FluidCalculationInput> = {}): FluidCalculationInput {
  return {
    weightKg: 70,
    tbsaPercent: 30,
    injuryTime: injury,
    resuscitationStartTime: '2026-03-01T10:00:00.000Z',
    asOfTime: '2026-03-01T12:00:00.000Z',
    administeredMl: 2000,
    protocol: { id: PARKLAND_TEMPLATE.id, name: PARKLAND_TEMPLATE.name, version: PARKLAND_TEMPLATE.version, parameters: PARKLAND_TEMPLATE.parameters },
    ...over,
  };
}

describe('fluid estimate with a configured protocol', () => {
  it('computes total, phases and remaining volume', () => {
    const out = calculateFluidEstimate(input());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = out.result;
    expect(r.totalVolumeMl).toBe(8400);
    expect(r.phases[0]!.volumeMl).toBe(4200);
    expect(r.phases[1]!.volumeMl).toBe(4200);
    expect(r.phases[0]!.end).toBe('2026-03-01T16:00:00.000Z');
    expect(r.periodEnd).toBe('2026-03-02T08:00:00.000Z');
    expect(r.remainingMl).toBe(6400);
    expect(r.phases[0]!.status).toBe('current');
    expect(r.phases[1]!.status).toBe('upcoming');
    expect(r.formulaText).toContain('4 mL × 70 kg × 30 %TBSA = 8,400 mL');
  });
  it('distinguishes time since injury from time since resuscitation start', () => {
    const out = calculateFluidEstimate(input());
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.hoursSinceInjury).toBe(4);
    expect(out.result.hoursSinceResuscitationStart).toBe(2);
    expect(out.result.hoursSinceReference).toBe(4); // Parkland measures from injury
    expect(out.result.warnings.some((w) => w.includes('after injury'))).toBe(true);
  });
  it('schedule cumulative is pro-rata within phases', () => {
    const out = calculateFluidEstimate(input());
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.scheduledCumulativeMl).toBeCloseTo(2100, 9); // 4 of 8 h of 4200 mL
  });
  it('flags administered volume above the estimate and elapsed period', () => {
    const out = calculateFluidEstimate(input({ administeredMl: 9000, asOfTime: '2026-03-02T09:00:00.000Z' }));
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.remainingMl).toBe(-600);
    expect(out.result.periodElapsed).toBe(true);
    expect(out.result.phases.every((p) => p.status === 'completed')).toBe(true);
    expect(out.result.warnings.join(' ')).toContain('exceeds');
  });
  it('supports protocols measured from resuscitation start', () => {
    const params = { ...PARKLAND_TEMPLATE.parameters, timeReference: 'resuscitation-start' as const };
    const out = calculateFluidEstimate(input({ protocol: { id: 'x', name: 'x', version: '1', parameters: params } }));
    if (!out.ok) throw new Error('expected ok');
    expect(out.result.hoursSinceReference).toBe(2);
    expect(out.result.phases[0]!.end).toBe('2026-03-01T18:00:00.000Z');
  });
});

describe('fluid estimate validation', () => {
  it('rejects a protocol with missing configuration', () => {
    const out = calculateFluidEstimate(
      input({ protocol: { id: 'i', name: 'Institutional', version: '0.1.0', parameters: INSTITUTIONAL_TEMPLATE.parameters } }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.some((i) => i.message.includes('not configured'))).toBe(true);
  });
  it.each([0, -5, Number.NaN])('rejects invalid weight %s', (w) => {
    const out = calculateFluidEstimate(input({ weightKg: w }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues[0]!.field).toBe('weightKg');
  });
  it.each([0, -1, 100.5, Number.NaN])('rejects invalid TBSA %s', (t) => {
    const out = calculateFluidEstimate(input({ tbsaPercent: t }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues[0]!.field).toBe('tbsaPercent');
  });
  it('rejects resuscitation start before injury and calculation time before injury', () => {
    const a = calculateFluidEstimate(input({ resuscitationStartTime: '2026-03-01T07:00:00.000Z' }));
    expect(a.ok).toBe(false);
    const b = calculateFluidEstimate(input({ asOfTime: '2026-03-01T07:00:00.000Z' }));
    expect(b.ok).toBe(false);
  });
  it('requires resuscitation start for protocols referenced to it', () => {
    const params = { ...PARKLAND_TEMPLATE.parameters, timeReference: 'resuscitation-start' as const };
    const out = calculateFluidEstimate(input({ resuscitationStartTime: null, protocol: { id: 'x', name: 'x', version: '1', parameters: params } }));
    expect(out.ok).toBe(false);
  });
  it('rejects phase fractions that do not sum to 1', () => {
    const params = {
      ...PARKLAND_TEMPLATE.parameters,
      phases: [
        { id: 'a', label: 'a', startHour: 0, endHour: 8, fractionOfTotal: 0.5 },
        { id: 'b', label: 'b', startHour: 8, endHour: 24, fractionOfTotal: 0.6 },
      ],
    };
    const out = calculateFluidEstimate(input({ protocol: { id: 'x', name: 'x', version: '1', parameters: params } }));
    expect(out.ok).toBe(false);
  });
});
