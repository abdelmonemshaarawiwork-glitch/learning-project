import { describe, expect, it } from 'vitest';
import { LUND_BROWDER_TEMPLATE, RULE_OF_NINES_TEMPLATE } from '@/reference-data/tbsa-templates';
import { validateRegionalData } from '@/engines/integrity';
import {
  calculatePalmTbsa,
  calculateRegionalTbsa,
  checkAgeApplicability,
  depthBySegment,
  findRowForSegment,
  selectAgeColumn,
  type RegionalEntryInput,
} from './index';

const LB = LUND_BROWDER_TEMPLATE.data;
const RON = RULE_OF_NINES_TEMPLATE.data;

function entry(partial: Partial<RegionalEntryInput> & Pick<RegionalEntryInput, 'regionId' | 'surface'>): RegionalEntryInput {
  return { id: crypto.randomUUID(), depth: 'deep-partial', involvementPercent: 100, ...partial };
}

describe('reference template integrity', () => {
  it('Lund and Browder: every age column sums to 100%', () => {
    expect(validateRegionalData(LB)).toEqual([]);
  });
  it('Rule of Nines: sums to 100% and maps each segment once', () => {
    expect(validateRegionalData(RON)).toEqual([]);
  });
  it('detects a column that does not sum to 100%', () => {
    const broken = structuredClone(LB);
    broken.regions[0]!.percentByColumn['adult'] = 5;
    expect(validateRegionalData(broken).some((m) => m.includes('sums to'))).toBe(true);
  });
});

describe('age column selection (pediatric)', () => {
  it.each([
    [0, 'age-0'],
    [0.5, 'age-0'],
    [1, 'age-1'],
    [4, 'age-1'],
    [5, 'age-5'],
    [9, 'age-5'],
    [10, 'age-10'],
    [14, 'age-10'],
    [15, 'age-15'],
    [16, 'adult'],
    [80, 'adult'],
  ])('age %s → %s', (age, expected) => {
    expect(selectAgeColumn(LB.columns, age)?.id).toBe(expected);
  });
  it('returns null for unknown or negative age', () => {
    expect(selectAgeColumn(LB.columns, null)).toBeNull();
    expect(selectAgeColumn(LB.columns, -1)).toBeNull();
  });
  it('uses age-specific head and thigh percentages', () => {
    const entries = [entry({ regionId: 'head', surface: 'anterior' }), entry({ regionId: 'head', surface: 'posterior' })];
    const infant = calculateRegionalTbsa({ data: LB, columnId: 'age-0', entries });
    const adult = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries });
    expect(infant.ok && infant.totals.eligible).toBe(19);
    expect(adult.ok && adult.totals.eligible).toBe(7);
    const thigh = [entry({ regionId: 'thigh-left', surface: 'anterior' })];
    const r10 = calculateRegionalTbsa({ data: LB, columnId: 'age-10', entries: thigh });
    expect(r10.ok && r10.totals.eligibleExact).toBe(4.25);
  });
});

describe('Lund and Browder calculation', () => {
  it('zero involvement → 0% TBSA with info', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'trunk', surface: 'anterior', involvementPercent: 0 })] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.eligible).toBe(0);
      expect(r.issues.some((i) => i.code === 'ZERO_INVOLVEMENT')).toBe(true);
    }
  });
  it('no entries → 0% TBSA', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [] });
    expect(r.ok && r.totals.eligible).toBe(0);
  });
  it('full regional involvement equals the reference percentage', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'trunk', surface: 'anterior' })] });
    expect(r.ok && r.totals.eligibleExact).toBe(13);
  });
  it('whole body at 100% full thickness = 100% for every column', () => {
    for (const col of LB.columns) {
      const entries = LB.regions.map((row) => entry({ regionId: row.id, surface: row.surface, depth: 'full-thickness' }));
      const r = calculateRegionalTbsa({ data: LB, columnId: col.id, entries });
      expect(r.ok && r.totals.eligible).toBe(100);
    }
  });
  it('partial involvement is proportional', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'thigh-right', surface: 'anterior', involvementPercent: 50 })] });
    expect(r.ok && r.totals.eligibleExact).toBeCloseTo(2.375, 10);
    expect(r.ok && r.items[0]!.contributionRounded).toBe(2.38);
    expect(r.ok && r.totals.eligible).toBe(2.4);
  });
  it('superficial burns are excluded from TBSA', () => {
    const r = calculateRegionalTbsa({
      data: LB,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'superficial', involvementPercent: 100 }),
        entry({ regionId: 'trunk', surface: 'posterior', depth: 'superficial-partial', involvementPercent: 50 }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.eligibleExact).toBe(6.5);
      expect(r.totals.superficialExact).toBe(13);
      expect(r.items[0]!.eligible).toBe(false);
      expect(r.items[0]!.excludedReason).toBe('superficial');
      expect(r.issues.some((i) => i.code === 'SUPERFICIAL_EXCLUDED')).toBe(true);
    }
  });
  it('multiple affected regions and depths sum correctly', () => {
    const r = calculateRegionalTbsa({
      data: LB,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'upper-arm-left', surface: 'anterior', depth: 'superficial-partial', involvementPercent: 100 }), // 2
        entry({ regionId: 'forearm-left', surface: 'anterior', depth: 'deep-partial', involvementPercent: 50 }), // 0.75
        entry({ regionId: 'hand-left', surface: 'posterior', depth: 'full-thickness', involvementPercent: 20 }), // 0.25
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'full-thickness', involvementPercent: 30 }), // 3.9
      ],
    });
    expect(r.ok && r.totals.eligibleExact).toBeCloseTo(6.9, 10);
    expect(r.ok && r.totals.byDepth['full-thickness']).toBeCloseTo(4.15, 10);
  });
  it('allows different depths within one region up to 100% combined', () => {
    const r = calculateRegionalTbsa({
      data: LB,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'deep-partial', involvementPercent: 60 }),
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'full-thickness', involvementPercent: 40 }),
      ],
    });
    expect(r.ok && r.totals.eligibleExact).toBeCloseTo(13, 10);
  });
  it('indeterminate regions are flagged and reported separately', () => {
    const r = calculateRegionalTbsa({
      data: LB,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'deep-partial', involvementPercent: 100 }),
        entry({ regionId: 'trunk', surface: 'posterior', depth: 'indeterminate', involvementPercent: 50 }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.eligible).toBe(13);
      expect(r.totals.indeterminate).toBe(6.5);
      expect(r.totals.upperBound).toBe(19.5);
      const w = r.issues.find((i) => i.code === 'INDETERMINATE_PRESENT');
      expect(w?.severity).toBe('warning');
    }
  });
});

describe('invalid inputs', () => {
  it('rejects negative involvement', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'trunk', surface: 'anterior', involvementPercent: -1 })] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.code).toBe('NEGATIVE_VALUE');
  });
  it('rejects involvement above 100%', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'trunk', surface: 'anterior', involvementPercent: 100.01 })] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.code).toBe('OVER_100');
  });
  it('rejects NaN / non-numeric involvement', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'trunk', surface: 'anterior', involvementPercent: Number.NaN })] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.code).toBe('INVALID_NUMBER');
  });
  it('rejects combined depths above 100% of one region', () => {
    const r = calculateRegionalTbsa({
      data: LB,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'deep-partial', involvementPercent: 70 }),
        entry({ regionId: 'trunk', surface: 'anterior', depth: 'full-thickness', involvementPercent: 40 }),
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'REGION_OVER_100')).toBe(true);
  });
  it('rejects duplicate region entries (same region, surface and depth)', () => {
    const r = calculateRegionalTbsa({
      data: LB,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'neck', surface: 'anterior', involvementPercent: 10 }),
        entry({ regionId: 'neck', surface: 'anterior', involvementPercent: 20 }),
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === 'DUPLICATE_ENTRY')).toBe(true);
  });
  it('rejects unknown region / surface combinations', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'genitalia', surface: 'posterior' })] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.code).toBe('UNKNOWN_REGION');
  });
  it('requires an age column', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: null, entries: [] });
    expect(r.ok).toBe(false);
    expect(r.issues[0]!.code).toBe('NO_COLUMN');
  });
});

describe('rounding', () => {
  it('rounds totals once from unrounded contributions (half away from zero)', () => {
    // 3 × (1.25 × 33%) = 1.2375 → 1.2 (1 dp); contributions 0.4125 → 0.41 each
    const entries = [
      entry({ regionId: 'hand-left', surface: 'anterior', involvementPercent: 33 }),
      entry({ regionId: 'hand-left', surface: 'posterior', involvementPercent: 33 }),
      entry({ regionId: 'hand-right', surface: 'anterior', involvementPercent: 33 }),
    ];
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items[0]!.contributionRounded).toBe(0.41);
      expect(r.totals.eligibleExact).toBeCloseTo(1.2375, 12);
      expect(r.totals.eligible).toBe(1.2);
    }
  });
  it('handles decimal involvement without floating-point artefacts', () => {
    const r = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'trunk', surface: 'anterior', involvementPercent: 12.5 })] });
    expect(r.ok && r.totals.eligibleExact).toBeCloseTo(1.625, 12);
    expect(r.ok && r.totals.eligible).toBe(1.6);
    const r2 = calculateRegionalTbsa({ data: LB, columnId: 'adult', entries: [entry({ regionId: 'neck', surface: 'anterior', involvementPercent: 25 })] });
    expect(r2.ok && r2.totals.eligible).toBe(0.3); // 0.25 → 0.3 (half away from zero)
  });
});

describe('Rule of Nines', () => {
  it('adult whole upper limb = 9%', () => {
    const r = calculateRegionalTbsa({
      data: RON,
      columnId: 'adult',
      entries: [
        entry({ regionId: 'upper-limb-left', surface: 'anterior' }),
        entry({ regionId: 'upper-limb-left', surface: 'posterior' }),
      ],
    });
    expect(r.ok && r.totals.eligible).toBe(9);
  });
  it('maps body segments to the containing region (buttock → posterior trunk)', () => {
    expect(findRowForSegment(RON, 'buttock-left', 'posterior')?.id).toBe('trunk');
    expect(findRowForSegment(RON, 'hand-right', 'anterior')?.id).toBe('upper-limb-right');
    expect(findRowForSegment(LB, 'hand-right', 'anterior')?.id).toBe('hand-right');
  });
  it('flags pediatric use as outside the documented population', () => {
    const issue = checkAgeApplicability(6, RULE_OF_NINES_TEMPLATE.ageRangeYears, 'Rule of Nines (adult)');
    expect(issue?.code).toBe('AGE_OUTSIDE_POPULATION');
    expect(checkAgeApplicability(40, RULE_OF_NINES_TEMPLATE.ageRangeYears, 'x')).toBeNull();
    expect(checkAgeApplicability(null, RULE_OF_NINES_TEMPLATE.ageRangeYears, 'x')?.code).toBe('AGE_UNKNOWN');
  });
});

describe('Palm method', () => {
  it('multiplies palm-equivalents by the clinician-entered palm percentage', () => {
    const r = calculatePalmTbsa({
      palmPercent: 0.8,
      entries: [
        { id: 'a', palmEquivalents: 3, depth: 'superficial-partial', segmentKey: 'thigh-left:anterior' },
        { id: 'b', palmEquivalents: 1.5, depth: 'full-thickness', segmentKey: null },
        { id: 'c', palmEquivalents: 2, depth: 'superficial', segmentKey: null },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.eligibleExact).toBeCloseTo(3.6, 12);
      expect(r.totals.superficialExact).toBeCloseTo(1.6, 12);
      expect(r.items[0]!.label).toBe('Left thigh (anterior)');
    }
  });
  it('requires a palm percentage', () => {
    expect(calculatePalmTbsa({ palmPercent: null, entries: [] }).ok).toBe(false);
    expect(calculatePalmTbsa({ palmPercent: 0, entries: [] }).ok).toBe(false);
  });
  it('rejects negative palm counts and totals above 100%', () => {
    expect(calculatePalmTbsa({ palmPercent: 1, entries: [{ id: 'a', palmEquivalents: -1, depth: 'deep-partial', segmentKey: null }] }).ok).toBe(false);
    const over = calculatePalmTbsa({ palmPercent: 1, entries: [{ id: 'a', palmEquivalents: 101, depth: 'deep-partial', segmentKey: null }] });
    expect(over.ok).toBe(false);
    expect(over.issues[0]!.code).toBe('TOTAL_OVER_100');
  });
});

describe('body map colouring', () => {
  it('uses the most severe depth per segment', () => {
    const m = depthBySegment([
      { segmentKeys: ['trunk:anterior'], depth: 'superficial-partial' },
      { segmentKeys: ['trunk:anterior'], depth: 'full-thickness' },
      { segmentKeys: ['trunk:posterior'], depth: 'indeterminate' },
    ]);
    expect(m.get('trunk:anterior')).toBe('full-thickness');
    expect(m.get('trunk:posterior')).toBe('indeterminate');
  });
});

describe('default column', () => {
  it('uses the only column of a single-column dataset, keeping the age limitation separate', async () => {
    const { defaultAgeColumn } = await import('./index');
    expect(defaultAgeColumn(RON.columns, 6)?.id).toBe('adult');
    expect(defaultAgeColumn(LB.columns, 6)?.id).toBe('age-5');
    expect(defaultAgeColumn(LB.columns, null)).toBeNull();
  });
});
