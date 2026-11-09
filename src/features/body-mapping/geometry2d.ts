/**
 * 2D anatomical region map geometry (schematic chart-style figures).
 *
 * Two figures in anatomical position: anterior view (patient's right on the viewer's left)
 * and posterior view (patient's right on the viewer's right). Each polygon is one body segment
 * surface. The same geometry is used by the on-screen SVG map and the PDF report renderer.
 */
import type { BodySegmentId } from '@/constants/clinical';
import type { Surface } from '@/types/domain';

export type Pt = readonly [number, number];

export interface MapShape {
  segment: BodySegmentId;
  surface: Surface;
  points: Pt[];
}

export const FIGURE_WIDTH = 160;
export const FIGURE_HEIGHT = 400;
/** x offset of the posterior figure inside the combined drawing. */
export const POSTERIOR_OFFSET_X = 180;
export const MAP_VIEWBOX = { width: 340, height: 410 };

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [FIGURE_WIDTH - x, y] as const);

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 28): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)] as const;
  });
}

function symmetric(leftHalfTopToBottom: Pt[]): Pt[] {
  const right = mirror(leftHalfTopToBottom).reverse();
  return [...leftHalfTopToBottom, ...right.slice(1, -1)];
}

// Viewer-left limb outlines (mirrored for the viewer-right side).
const UPPER_ARM: Pt[] = [[47, 71], [36, 74], [29, 90], [25, 138], [37, 140], [41, 114], [46, 96]];
const FOREARM: Pt[] = [[25, 138], [37, 140], [35, 170], [31, 203], [19, 203], [21, 170]];
const HAND: Pt[] = [[19, 203], [31, 203], [33, 212], [32, 232], [27, 242], [21, 241], [16, 230], [15, 214]];
const THIGH_ANT: Pt[] = [[52, 188], [75, 196], [78, 212], [76, 236], [74, 272], [55, 272], [50, 236], [48, 206]];
const THIGH_POST: Pt[] = [[49, 198], [52, 203], [62, 208], [75, 207], [78, 212], [76, 236], [74, 272], [55, 272], [50, 236], [48, 212]];
const LEG: Pt[] = [[55, 272], [74, 272], [73, 300], [70, 340], [68, 356], [58, 356], [56, 330], [53, 300]];
const FOOT_ANT: Pt[] = [[58, 356], [68, 356], [71, 366], [73, 378], [63, 383], [52, 381], [54, 368]];
const FOOT_POST: Pt[] = [[58, 356], [68, 356], [70, 368], [69, 378], [63, 381], [57, 380], [56, 368]];
const BUTTOCK: Pt[] = [[50, 172], [80, 174], [80, 200], [75, 207], [62, 208], [52, 203], [49, 188]];

const HEAD = ellipse(80, 33, 16, 21);
const NECK: Pt[] = [[72, 50], [88, 50], [89, 64], [71, 64]];
const TRUNK_ANT = symmetric([[80, 63], [68, 63], [49, 70], [46, 84], [50, 120], [54, 148], [50, 176], [52, 188], [75, 196], [80, 197]]);
const TRUNK_POST = symmetric([[80, 63], [68, 63], [49, 70], [46, 84], [50, 120], [54, 148], [50, 172], [80, 174]]);
const GENITALIA: Pt[] = [[75, 196], [85, 196], [82, 211], [78, 211]];

type Side = 'right' | 'left';
const seg = (base: string, side: Side) => `${base}-${side}` as BodySegmentId;

function limbs(surface: Surface, viewerLeftSide: Side, viewerRightSide: Side, thigh: Pt[], foot: Pt[]): MapShape[] {
  const out: MapShape[] = [];
  const add = (base: string, pts: Pt[]) => {
    out.push({ segment: seg(base, viewerLeftSide), surface, points: pts });
    out.push({ segment: seg(base, viewerRightSide), surface, points: mirror(pts) });
  };
  add('upper-arm', UPPER_ARM);
  add('forearm', FOREARM);
  add('hand', HAND);
  add('thigh', thigh);
  add('leg', LEG);
  add('foot', foot);
  return out;
}

/** Anterior view: patient's right limbs appear on the viewer's left. */
export const ANTERIOR_SHAPES: MapShape[] = [
  { segment: 'neck', surface: 'anterior', points: NECK },
  { segment: 'head', surface: 'anterior', points: HEAD },
  { segment: 'trunk', surface: 'anterior', points: TRUNK_ANT },
  { segment: 'genitalia', surface: 'anterior', points: GENITALIA },
  ...limbs('anterior', 'right', 'left', THIGH_ANT, FOOT_ANT),
];

/** Posterior view: patient's left limbs appear on the viewer's left. */
export const POSTERIOR_SHAPES: MapShape[] = [
  { segment: 'neck', surface: 'posterior', points: NECK },
  { segment: 'head', surface: 'posterior', points: HEAD },
  { segment: 'trunk', surface: 'posterior', points: TRUNK_POST },
  { segment: 'buttock-left', surface: 'posterior', points: BUTTOCK },
  { segment: 'buttock-right', surface: 'posterior', points: mirror(BUTTOCK) },
  ...limbs('posterior', 'left', 'right', THIGH_POST, FOOT_POST),
];

export function shapePath(points: Pt[], offsetX = 0): string {
  return `M${points.map(([x, y]) => `${(x + offsetX).toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
}

export const SIDE_LABELS = {
  anterior: { viewerLeft: 'R', viewerRight: 'L' },
  posterior: { viewerLeft: 'L', viewerRight: 'R' },
} as const;
