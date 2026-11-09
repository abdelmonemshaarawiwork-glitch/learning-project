/**
 * Photo-assisted planimetry (clinician-traced).
 *
 * The clinician photographs a body area from several views and, on each photo, traces:
 *   • the outline of every body segment visible (e.g. upper arm, forearm, hand),
 *   • each burned area, with a burn depth chosen by the clinician,
 *   • on side views, a divider line between the anterior and posterior halves.
 * This engine measures the traced areas and proposes % involvement of each segment surface.
 * It does NOT detect burns or depth from pixels — every shape is drawn by the clinician.
 *
 * Measurement: polygons are rasterised on a fixed grid (pixel-centre sampling). Within a photo,
 * overlapping outlines are assigned to the first-drawn segment and overlapping burns to the most
 * severe depth; both are reported. Burned area outside every outline is ignored and reported.
 *
 * Pooling across views (documented heuristic, see docs/MEDICAL_CALCULATIONS.md §8):
 * each photo counts as one unit of the segment's visible area. A part of a photo that belongs to
 * surface S contributes weight u = partArea / segmentAreaInThatPhoto (direct view ≈ 1, each side
 * half ≈ 0.5), and burned fraction f_d = burnedArea_d / partArea. For each depth d:
 *     F_d(S) = Σ u·f_d / Σ u = Σ (burned_d / segmentArea) / Σ (partArea / segmentArea)
 * Proposed involvement(S, d) = 100 · F_d(S). Because burns of different depths never share a pixel,
 * Σ_d F_d ≤ 1. Photographs are 2D projections of curved surfaces: results are estimates that the
 * clinician must review before they are applied to an assessment.
 */
import { BODY_SEGMENT_MAP, BURN_DEPTHS, BURN_DEPTH_MAP, segmentKey, type BodySegmentId } from '@/constants/clinical';
import type { BurnDepth, Surface } from '@/types/domain';
import { preciseSum, roundHalfAwayFromZero } from '@/utils/rounding';

export type PhotoView = 'anterior' | 'posterior' | 'medial' | 'lateral' | 'left-side' | 'right-side';

export const SIDE_VIEWS: readonly PhotoView[] = ['medial', 'lateral', 'left-side', 'right-side'];
export const isSideView = (v: PhotoView) => SIDE_VIEWS.includes(v);

/** Normalised image coordinates: x ∈ [0,1] of width, y ∈ [0,1] of height (y down). */
export interface NormPoint {
  x: number;
  y: number;
}

export interface SegmentOutline {
  id: string;
  segment: BodySegmentId;
  points: NormPoint[];
}

export interface BurnShape {
  id: string;
  depth: BurnDepth;
  points: NormPoint[];
}

export interface Divider {
  a: NormPoint;
  b: NormPoint;
  /** Any point on the anterior side of the line, tapped by the clinician. */
  anteriorPoint: NormPoint | null;
}

export interface PhotoAnnotation {
  outlines: SegmentOutline[];
  burns: BurnShape[];
  divider: Divider | null;
}

export interface PhotoForMeasurement {
  id: string;
  view: PhotoView;
  /** width / height of the image */
  aspect: number;
  annotation: PhotoAnnotation;
}

export const EMPTY_ANNOTATION: PhotoAnnotation = { outlines: [], burns: [], divider: null };

/** Grid resolution (long side) used for area measurement. */
export const GRID_LONG_SIDE = 400;

export function gridSize(aspect: number, longSide = GRID_LONG_SIDE): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return a >= 1 ? { w: longSide, h: Math.max(1, Math.round(longSide / a)) } : { w: Math.max(1, Math.round(longSide * a)), h: longSide };
}

/** Even-odd scanline fill at pixel centres. Returns a 0/1 mask of size w*h. */
export function rasterizePolygon(points: readonly NormPoint[], w: number, h: number, out = new Uint8Array(w * h)): Uint8Array {
  if (points.length < 3) return out;
  const px = points.map((p) => p.x * w);
  const py = points.map((p) => p.y * h);
  const n = points.length;
  const xs: number[] = [];
  for (let row = 0; row < h; row++) {
    const y = row + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = py[i]!;
      const yj = py[j]!;
      if (yi > y !== yj > y) xs.push(px[i]! + ((y - yi) / (yj - yi)) * (px[j]! - px[i]!));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const start = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const end = Math.min(w - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let col = start; col <= end; col++) out[row * w + col] = 1;
    }
  }
  return out;
}

/** Polygon area in normalised units (shoelace); useful for quick UI feedback. */
export function polygonArea(points: readonly NormPoint[]): number {
  let s = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) s += (points[j]!.x + points[i]!.x) * (points[j]!.y - points[i]!.y);
  return Math.abs(s) / 2;
}

/** Ramer–Douglas–Peucker simplification for freehand traces. */
export function simplifyPath(points: readonly NormPoint[], epsilon = 0.002): NormPoint[] {
  if (points.length < 3) return [...points];
  const dist = (p: NormPoint, a: NormPoint, b: NormPoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = dist(points[i]!, points[s]!, points[e]!);
      if (d > max) [max, idx] = [d, i];
    }
    if (idx >= 0 && max > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export interface PhotoIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface PartMeasurement {
  surface: Surface;
  /** Pixels of this segment on this surface in this photo. */
  px: number;
  burnedPx: Record<BurnDepth, number>;
}

export interface SegmentMeasurement {
  segment: BodySegmentId;
  totalPx: number;
  parts: PartMeasurement[];
}

export interface PhotoMeasurement {
  photoId: string;
  view: PhotoView;
  segments: SegmentMeasurement[];
  issues: PhotoIssue[];
}

const zeroDepths = (): Record<BurnDepth, number> => ({ superficial: 0, 'superficial-partial': 0, 'deep-partial': 0, 'full-thickness': 0, indeterminate: 0 });

/** Side of the divider line (pixel coordinates) for a point: sign of the 2D cross product. */
function sideOf(a: NormPoint, b: NormPoint, p: NormPoint, w: number, h: number): number {
  return Math.sign((b.x - a.x) * w * ((p.y - a.y) * h) - (b.y - a.y) * h * ((p.x - a.x) * w));
}

export function measurePhoto(photo: PhotoForMeasurement, longSide = GRID_LONG_SIDE): PhotoMeasurement {
  const { w, h } = gridSize(photo.aspect, longSide);
  const issues: PhotoIssue[] = [];
  const ann = photo.annotation;
  const view = photo.view;
  const side = isSideView(view);

  if (ann.outlines.length === 0) issues.push({ severity: 'error', message: 'No segment outline traced on this photo.' });
  if (side && (!ann.divider || !ann.divider.anteriorPoint))
    issues.push({ severity: 'error', message: 'Side view: draw the divider between the anterior and posterior halves and mark the anterior side.' });

  // Segment ownership map: 0 = none, k = index+1 into segmentOrder (first drawn wins).
  const owner = new Int16Array(w * h);
  const segmentOrder: BodySegmentId[] = [];
  let overlapPx = 0;
  for (const o of ann.outlines) {
    if (o.points.length < 3) continue;
    let idx = segmentOrder.indexOf(o.segment);
    if (idx < 0) idx = segmentOrder.push(o.segment) - 1;
    const mask = rasterizePolygon(o.points, w, h);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      if (owner[i] === 0) owner[i] = idx + 1;
      else if (owner[i] !== idx + 1) overlapPx++;
    }
  }
  if (overlapPx > 0) issues.push({ severity: 'warning', message: `Outlines of different segments overlap (${overlapPx} grid px); overlapping area was assigned to the first-drawn segment.` });

  // Burn depth map: 0 = none, else index+1 into BURN_DEPTHS; most severe wins on overlap.
  const depthIndex = new Int8Array(w * h);
  let burnOverlap = 0;
  for (const b of ann.burns) {
    if (b.points.length < 3) continue;
    const di = BURN_DEPTHS.findIndex((d) => d.id === b.depth);
    const mask = rasterizePolygon(b.points, w, h);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const cur = depthIndex[i]!;
      if (cur === 0) depthIndex[i] = di + 1;
      else if (cur !== di + 1) {
        burnOverlap++;
        if (BURN_DEPTHS[di]!.severity > BURN_DEPTHS[cur - 1]!.severity) depthIndex[i] = di + 1;
      }
    }
  }
  if (burnOverlap > 0) issues.push({ severity: 'warning', message: 'Burn areas of different depths overlap; the overlapping area was counted once with the most severe depth.' });

  const segs = new Map<BodySegmentId, SegmentMeasurement>();
  const partOf = (seg: BodySegmentId, surface: Surface) => {
    let m = segs.get(seg);
    if (!m) segs.set(seg, (m = { segment: seg, totalPx: 0, parts: [] }));
    let p = m.parts.find((x) => x.surface === surface);
    if (!p) m.parts.push((p = { surface, px: 0, burnedPx: zeroDepths() }));
    return { m, p };
  };

  const div = ann.divider;
  const antSign = side && div?.anteriorPoint ? sideOf(div.a, div.b, div.anteriorPoint, w, h) : 0;
  let outsideBurn = 0;
  let unusable = 0;

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = row * w + col;
      const own = owner[i]!;
      const d = depthIndex[i]!;
      if (own === 0) {
        if (d !== 0) outsideBurn++;
        continue;
      }
      const seg = segmentOrder[own - 1]!;
      const surfaces = BODY_SEGMENT_MAP[seg].surfaces;
      let surface: Surface | null;
      if (surfaces.length === 1) surface = surfaces[0]!;
      else if (view === 'anterior') surface = 'anterior';
      else if (view === 'posterior') surface = 'posterior';
      else if (antSign !== 0 && div) {
        const s = sideOf(div.a, div.b, { x: (col + 0.5) / w, y: (row + 0.5) / h }, w, h);
        surface = s === 0 || s === antSign ? 'anterior' : 'posterior';
      } else surface = null;

      if (surface === null || !surfaces.includes(surface)) {
        unusable++;
        continue;
      }
      // A direct view cannot measure a surface it does not face (e.g. a buttock on an anterior photo).
      if ((view === 'anterior' && surface === 'posterior') || (view === 'posterior' && surface === 'anterior')) {
        unusable++;
        continue;
      }
      const { m, p } = partOf(seg, surface);
      m.totalPx++;
      p.px++;
      if (d !== 0) p.burnedPx[BURN_DEPTHS[d - 1]!.id]++;
    }
  }
  if (outsideBurn > 0) issues.push({ severity: 'warning', message: `Part of the traced burn area lies outside every segment outline and was ignored (${outsideBurn} grid px).` });
  if (unusable > 0 && !(side && antSign === 0))
    issues.push({ severity: 'info', message: 'Some outlined area belongs to a surface this view cannot show (for example a buttock on a front photo) and was ignored.' });

  return { photoId: photo.id, view, segments: [...segs.values()], issues };
}

export interface Contribution {
  photoId: string;
  view: PhotoView;
  /** Weight unit u = part area / segment area in that photo. */
  unit: number;
  fractionByDepth: Record<BurnDepth, number>;
  totalFraction: number;
}

export interface SurfaceEstimate {
  key: string;
  segment: BodySegmentId;
  surface: Surface;
  /** Proposed % involvement of the segment surface, per depth (rounded to 1 decimal). */
  percentByDepth: Record<BurnDepth, number>;
  totalPercent: number;
  /** Exact pooled fractions (0–1). */
  fractionByDepth: Record<BurnDepth, number>;
  contributions: Contribution[];
  hasDirectView: boolean;
  /** Range of total burned fraction across contributing views (0–1). */
  spread: { min: number; max: number };
}

export const PLANIMETRY_PERCENT_DECIMALS = 1;

export function combineMeasurements(measurements: readonly PhotoMeasurement[]): SurfaceEstimate[] {
  const acc = new Map<string, { segment: BodySegmentId; surface: Surface; contributions: Contribution[] }>();
  for (const m of measurements) {
    for (const s of m.segments) {
      if (s.totalPx === 0) continue;
      for (const p of s.parts) {
        if (p.px === 0) continue;
        const key = segmentKey(s.segment, p.surface);
        let a = acc.get(key);
        if (!a) acc.set(key, (a = { segment: s.segment, surface: p.surface, contributions: [] }));
        const fractionByDepth = zeroDepths();
        for (const d of BURN_DEPTHS) fractionByDepth[d.id] = p.burnedPx[d.id] / p.px;
        a.contributions.push({
          photoId: m.photoId,
          view: m.view,
          unit: p.px / s.totalPx,
          fractionByDepth,
          totalFraction: preciseSum(Object.values(fractionByDepth)),
        });
      }
    }
  }
  const out: SurfaceEstimate[] = [];
  for (const [key, a] of acc) {
    const sumU = preciseSum(a.contributions.map((c) => c.unit));
    const fractionByDepth = zeroDepths();
    const percentByDepth = zeroDepths();
    for (const d of BURN_DEPTHS) {
      fractionByDepth[d.id] = preciseSum(a.contributions.map((c) => c.unit * c.fractionByDepth[d.id])) / sumU;
      percentByDepth[d.id] = roundHalfAwayFromZero(fractionByDepth[d.id] * 100, PLANIMETRY_PERCENT_DECIMALS);
    }
    // Independent rounding must never push the combined involvement above 100 %.
    const roundedSum = preciseSum(Object.values(percentByDepth));
    if (roundedSum > 100) {
      const largest = BURN_DEPTHS.reduce((m, d) => (percentByDepth[d.id] > percentByDepth[m.id] ? d : m), BURN_DEPTHS[0]!);
      percentByDepth[largest.id] = roundHalfAwayFromZero(percentByDepth[largest.id] - (roundedSum - 100), PLANIMETRY_PERCENT_DECIMALS);
    }
    const totals = a.contributions.map((c) => c.totalFraction);
    out.push({
      key,
      segment: a.segment,
      surface: a.surface,
      fractionByDepth,
      percentByDepth,
      totalPercent: roundHalfAwayFromZero(preciseSum(Object.values(fractionByDepth)) * 100, PLANIMETRY_PERCENT_DECIMALS),
      contributions: a.contributions,
      hasDirectView: a.contributions.some((c) => c.view === a.surface),
      spread: { min: Math.min(...totals), max: Math.max(...totals) },
    });
  }
  return out.sort((x, y) => x.key.localeCompare(y.key));
}

/** Converts estimates into regional entries for a Lund and Browder draft (one entry per non-zero depth). */
export function estimatesToEntries(estimates: readonly SurfaceEstimate[], newId: () => string, noteSuffix = '') {
  return estimates.flatMap((e) =>
    BURN_DEPTHS.filter((d) => e.percentByDepth[d.id] > 0).map((d) => ({
      id: newId(),
      regionId: e.segment as string,
      surface: e.surface,
      depth: d.id,
      involvementPercent: e.percentByDepth[d.id],
      notes: `Photo-assisted estimate (${e.contributions.length} view${e.contributions.length === 1 ? '' : 's'}${e.hasDirectView ? '' : ', no direct view'})${noteSuffix}`,
    })),
  );
}

export function depthLabel(d: BurnDepth) {
  return BURN_DEPTH_MAP[d].label;
}
