import { describe, expect, it } from 'vitest';
import { calculateRegionalTbsa } from '@/engines/tbsa';
import { LUND_BROWDER_TEMPLATE } from '@/reference-data/tbsa-templates';
import {
  combineMeasurements,
  estimatesToEntries,
  measurePhoto,
  polygonArea,
  rasterizePolygon,
  simplifyPath,
  type NormPoint,
  type PhotoForMeasurement,
} from './index';

const rect = (x0: number, y0: number, x1: number, y1: number): NormPoint[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
let n = 0;
const id = () => `id-${++n}`;

function photo(over: Partial<PhotoForMeasurement> & Pick<PhotoForMeasurement, 'view'>): PhotoForMeasurement {
  return { id: id(), aspect: 1, annotation: { outlines: [], burns: [], divider: null }, ...over };
}

describe('geometry helpers', () => {
  it('rasterises a rectangle to the expected pixel count', () => {
    const m = rasterizePolygon(rect(0.25, 0.25, 0.75, 0.75), 100, 100);
    expect(m.reduce((a, b) => a + b, 0)).toBe(2500);
  });
  it('shoelace area and path simplification', () => {
    expect(polygonArea(rect(0, 0, 0.5, 0.5))).toBeCloseTo(0.25, 12);
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i / 49, y: 0.5 + (i % 2) * 0.0001 }));
    expect(simplifyPath(line, 0.002).length).toBe(2);
  });
});

describe('single photo measurement', () => {
  it('measures burn fraction of a segment on a direct (anterior) view', () => {
    const m = measurePhoto(
      photo({
        view: 'anterior',
        annotation: {
          outlines: [{ id: 'o', segment: 'forearm-left', points: rect(0.2, 0.1, 0.6, 0.9) }],
          burns: [{ id: 'b', depth: 'deep-partial', points: rect(0.2, 0.1, 0.6, 0.5) }],
          divider: null,
        },
      }),
    );
    expect(m.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const seg = m.segments[0]!;
    expect(seg.parts).toHaveLength(1);
    expect(seg.parts[0]!.surface).toBe('anterior');
    expect(seg.parts[0]!.burnedPx['deep-partial'] / seg.parts[0]!.px).toBeCloseTo(0.5, 2);
  });
  it('ignores burns outside outlines and reports it', () => {
    const m = measurePhoto(
      photo({
        view: 'posterior',
        annotation: { outlines: [{ id: 'o', segment: 'thigh-right', points: rect(0.2, 0.2, 0.4, 0.8) }], burns: [{ id: 'b', depth: 'full-thickness', points: rect(0.5, 0.2, 0.7, 0.4) }], divider: null },
      }),
    );
    expect(m.segments[0]!.parts[0]!.burnedPx['full-thickness']).toBe(0);
    expect(m.issues.some((i) => i.message.includes('outside every segment outline'))).toBe(true);
  });
  it('counts overlapping burns once, with the most severe depth', () => {
    const m = measurePhoto(
      photo({
        view: 'anterior',
        annotation: {
          outlines: [{ id: 'o', segment: 'trunk', points: rect(0, 0, 1, 1) }],
          burns: [
            { id: 'a', depth: 'superficial-partial', points: rect(0, 0, 0.5, 1) },
            { id: 'b', depth: 'full-thickness', points: rect(0.25, 0, 0.75, 1) },
          ],
          divider: null,
        },
      }),
    );
    const p = m.segments[0]!.parts[0]!;
    expect(p.burnedPx['superficial-partial'] / p.px).toBeCloseTo(0.25, 2);
    expect(p.burnedPx['full-thickness'] / p.px).toBeCloseTo(0.5, 2);
    expect(m.issues.some((i) => i.message.includes('overlap'))).toBe(true);
  });
  it('splits side views by the divider and requires it', () => {
    const outlines = [{ id: 'o', segment: 'upper-arm-left' as const, points: rect(0.2, 0.1, 0.8, 0.9) }];
    const burns = [{ id: 'b', depth: 'deep-partial' as const, points: rect(0.2, 0.1, 0.5, 0.9) }];
    const missing = measurePhoto(photo({ view: 'lateral', annotation: { outlines, burns, divider: null } }));
    expect(missing.issues.some((i) => i.severity === 'error' && i.message.includes('divider'))).toBe(true);
    const ok = measurePhoto(
      photo({ view: 'lateral', annotation: { outlines, burns, divider: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 }, anteriorPoint: { x: 0.3, y: 0.5 } } } }),
    );
    const seg = ok.segments[0]!;
    const ant = seg.parts.find((p) => p.surface === 'anterior')!;
    const post = seg.parts.find((p) => p.surface === 'posterior')!;
    expect(ant.px / seg.totalPx).toBeCloseTo(0.5, 1);
    expect(ant.burnedPx['deep-partial'] / ant.px).toBeCloseTo(1, 2);
    expect(post.burnedPx['deep-partial']).toBe(0);
  });
  it('assigns single-surface segments regardless of the divider and ignores impossible surfaces', () => {
    const m = measurePhoto(
      photo({ view: 'anterior', annotation: { outlines: [{ id: 'o', segment: 'buttock-left', points: rect(0.1, 0.1, 0.5, 0.5) }], burns: [], divider: null } }),
    );
    expect(m.segments).toHaveLength(0);
    expect(m.issues.some((i) => i.message.includes('cannot show'))).toBe(true);
  });
});

describe('pooling views', () => {
  it('weights the direct view as one unit and each side half by its share', () => {
    // Anterior view: 40 % burned. Lateral view: anterior half 100 % burned (half of the segment).
    const anterior = measurePhoto(
      photo({ view: 'anterior', annotation: { outlines: [{ id: 'o', segment: 'forearm-left', points: rect(0, 0, 1, 1) }], burns: [{ id: 'b', depth: 'deep-partial', points: rect(0, 0, 0.4, 1) }], divider: null } }),
    );
    const lateral = measurePhoto(
      photo({
        view: 'lateral',
        annotation: {
          outlines: [{ id: 'o', segment: 'forearm-left', points: rect(0, 0, 1, 1) }],
          burns: [{ id: 'b', depth: 'deep-partial', points: rect(0, 0, 0.5, 1) }],
          divider: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 }, anteriorPoint: { x: 0.25, y: 0.5 } },
        },
      }),
    );
    const est = combineMeasurements([anterior, lateral]);
    const ant = est.find((e) => e.key === 'forearm-left:anterior')!;
    // F = (0.4·1 + 1·0.5) / (1 + 0.5) = 0.6
    expect(ant.fractionByDepth['deep-partial']).toBeCloseTo(0.6, 2);
    expect(ant.percentByDepth['deep-partial']).toBeCloseTo(60, 0);
    expect(ant.hasDirectView).toBe(true);
    const post = est.find((e) => e.key === 'forearm-left:posterior')!;
    expect(post.totalPercent).toBe(0);
    expect(post.hasDirectView).toBe(false);
  });
  it('is scale-independent (photos taken from different distances)', () => {
    const near = measurePhoto(photo({ view: 'anterior', annotation: { outlines: [{ id: 'o', segment: 'thigh-left', points: rect(0, 0, 1, 1) }], burns: [{ id: 'b', depth: 'superficial-partial', points: rect(0, 0, 0.5, 1) }], divider: null } }));
    const far = measurePhoto(photo({ view: 'anterior', annotation: { outlines: [{ id: 'o', segment: 'thigh-left', points: rect(0.4, 0.4, 0.6, 0.6) }], burns: [], divider: null } }));
    const e = combineMeasurements([near, far]).find((x) => x.key === 'thigh-left:anterior')!;
    expect(e.fractionByDepth['superficial-partial']).toBeCloseTo(0.25, 2); // (0.5 + 0) / 2, not area-weighted
    expect(e.spread.min).toBe(0);
    expect(e.spread.max).toBeCloseTo(0.5, 2);
  });
  it('feeds valid Lund and Browder entries (never above 100 %)', () => {
    const m = measurePhoto(
      photo({
        view: 'anterior',
        annotation: {
          outlines: [{ id: 'o', segment: 'trunk', points: rect(0, 0, 1, 1) }],
          burns: [
            { id: 'a', depth: 'deep-partial', points: rect(0, 0, 0.3333, 1) },
            { id: 'b', depth: 'full-thickness', points: rect(0.3333, 0, 1, 1) },
          ],
          divider: null,
        },
      }),
    );
    const entries = estimatesToEntries(combineMeasurements([m]), id);
    expect(entries.reduce((s, e) => s + e.involvementPercent, 0)).toBeLessThanOrEqual(100);
    const r = calculateRegionalTbsa({ data: LUND_BROWDER_TEMPLATE.data, columnId: 'adult', entries });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totals.eligible).toBe(13);
  });
});
