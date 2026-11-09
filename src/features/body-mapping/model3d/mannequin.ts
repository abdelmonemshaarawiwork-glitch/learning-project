/**
 * TEMPORARY DEVELOPMENT MODEL — schematic mannequin built from smooth lathe surfaces.
 *
 * This is NOT an anatomically accurate model and must never be presented as one. It exists so the
 * 3D mapping workflow can be developed and used until a properly licensed anatomical asset is
 * integrated (see public/models/README.md and docs/ARCHITECTURE.md → "3D model integration").
 *
 * Conventions: metres, +Y up, the figure faces +Z (anterior), the patient's LEFT side is +X.
 * Anatomical position: arms slightly abducted, palms facing forward.
 * Every body segment surface (segment:surface) is a separate mesh so it can be selected and coloured.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { segmentKey, type BodySegmentId } from '@/constants/clinical';
import type { Surface } from '@/types/domain';

type P = [number, number]; // [radius, y]

interface Arc {
  phiStart: number;
  phiLength: number;
}

const FRONT: Arc = { phiStart: -Math.PI / 2, phiLength: Math.PI }; // local z > 0
const BACK: Arc = { phiStart: Math.PI / 2, phiLength: Math.PI }; // local z < 0

const RADIAL_SEGMENTS = 20;

function smoothProfile(points: P[], samples = 36): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)));
  return curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(v.x, 0.0005), v.y));
}

function lathe(profile: THREE.Vector2[], arc: Arc, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile, RADIAL_SEGMENTS, arc.phiStart, arc.phiLength);
  g.applyMatrix4(matrix);
  return g;
}

function ellipsoid(center: THREE.Vector3, radii: THREE.Vector3, arc?: Arc): THREE.BufferGeometry {
  const g = arc
    ? new THREE.LatheGeometry(smoothProfile(halfCircle(), 20), RADIAL_SEGMENTS, arc.phiStart, arc.phiLength)
    : new THREE.SphereGeometry(1, 20, 14);
  g.applyMatrix4(new THREE.Matrix4().compose(center, new THREE.Quaternion(), radii));
  return g;
}

function halfCircle(): P[] {
  return Array.from({ length: 9 }, (_, i) => {
    const t = -Math.PI / 2 + (i / 8) * Math.PI;
    return [Math.cos(t), Math.sin(t)] as P;
  });
}

const m4 = () => new THREE.Matrix4();
const T = (x: number, y: number, z: number) => m4().makeTranslation(x, y, z);
const S = (x: number, y: number, z: number) => m4().makeScale(x, y, z);
const Rz = (a: number) => m4().makeRotationZ(a);
const Rx = (a: number) => m4().makeRotationX(a);
const chain = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), m4());

/* Profiles (radius, local y) */
const HEAD: P[] = [[0, -0.125], [0.05, -0.117], [0.072, -0.075], [0.084, -0.015], [0.088, 0.035], [0.079, 0.083], [0.05, 0.115], [0, 0.127]];
const NECK: P[] = [[0.06, -0.01], [0.053, 0.03], [0.05, 0.07], [0.053, 0.1], [0.06, 0.115]];
const TRUNK: P[] = [
  [0, 0.852], [0.06, 0.858], [0.125, 0.878], [0.16, 0.905], [0.17, 0.96], [0.158, 1.04], [0.14, 1.12], [0.146, 1.2],
  [0.16, 1.28], [0.172, 1.36], [0.178, 1.42], [0.152, 1.465], [0.09, 1.495], [0.045, 1.508], [0, 1.512],
];
const THIGH: P[] = [[0.03, -0.02], [0.05, 0], [0.056, 0.06], [0.068, 0.18], [0.08, 0.32], [0.088, 0.4], [0.084, 0.45], [0.05, 0.48]];
const LEG: P[] = [[0.025, -0.015], [0.032, 0], [0.035, 0.05], [0.045, 0.16], [0.053, 0.28], [0.05, 0.36], [0.05, 0.41], [0.035, 0.43]];
const FOOT: P[] = [[0, 0], [0.028, 0.006], [0.036, 0.03], [0.04, 0.08], [0.046, 0.15], [0.046, 0.2], [0.036, 0.235], [0, 0.252]];
const UPPER_ARM: P[] = [[0.03, -0.31], [0.037, -0.29], [0.041, -0.24], [0.047, -0.12], [0.05, -0.04], [0.048, 0], [0.03, 0.03], [0, 0.042]];
const FOREARM: P[] = [[0.024, -0.27], [0.027, -0.25], [0.031, -0.19], [0.04, -0.08], [0.038, -0.02], [0.034, 0.01]];
const HAND: P[] = [[0, -0.19], [0.022, -0.182], [0.036, -0.14], [0.043, -0.08], [0.041, -0.03], [0.028, 0.005], [0.022, 0.012]];

export interface MannequinPart {
  key: string;
  segment: BodySegmentId;
  surface: Surface;
  geometry: THREE.BufferGeometry;
}

export interface Mannequin {
  parts: MannequinPart[];
  /** Non-selectable skin geometry that smooths joints (shoulders, elbows, knees…). */
  joints: THREE.BufferGeometry;
  height: number;
}

export const ARM_ABDUCTION = THREE.MathUtils.degToRad(12);
const SHOULDER = { x: 0.19, y: 1.425, z: -0.01 };

export function buildMannequin(): Mannequin {
  const parts = new Map<string, THREE.BufferGeometry[]>();
  const add = (segment: BodySegmentId, surface: Surface, g: THREE.BufferGeometry) => {
    const k = segmentKey(segment, surface);
    parts.set(k, [...(parts.get(k) ?? []), g]);
  };
  const joints: THREE.BufferGeometry[] = [];

  // Head (+ nose on the anterior surface), neck
  const head = smoothProfile(HEAD);
  const headM = chain(T(0, 1.62, 0.005), S(1, 1, 1.12));
  add('head', 'anterior', lathe(head, FRONT, headM));
  add('head', 'posterior', lathe(head, BACK, headM));
  add('head', 'anterior', ellipsoid(new THREE.Vector3(0, 1.612, 0.1), new THREE.Vector3(0.014, 0.028, 0.02)));
  for (const sx of [-1, 1]) joints.push(ellipsoid(new THREE.Vector3(sx * 0.088, 1.618, -0.004), new THREE.Vector3(0.012, 0.03, 0.02)));
  const neck = smoothProfile(NECK);
  const neckM = chain(T(0, 1.44, -0.008), S(1, 1, 1.05));
  add('neck', 'anterior', lathe(neck, FRONT, neckM));
  add('neck', 'posterior', lathe(neck, BACK, neckM));

  // Trunk, buttocks, genitalia
  const trunk = smoothProfile(TRUNK, 60);
  const trunkM = S(1, 1, 0.62);
  add('trunk', 'anterior', lathe(trunk, FRONT, trunkM));
  add('trunk', 'posterior', lathe(trunk, BACK, trunkM));
  add('buttock-left', 'posterior', ellipsoid(new THREE.Vector3(0.072, 0.935, -0.058), new THREE.Vector3(0.088, 0.1, 0.07), BACK));
  add('buttock-right', 'posterior', ellipsoid(new THREE.Vector3(-0.072, 0.935, -0.058), new THREE.Vector3(0.088, 0.1, 0.07), BACK));
  add('genitalia', 'anterior', ellipsoid(new THREE.Vector3(0, 0.872, 0.062), new THREE.Vector3(0.034, 0.042, 0.03)));

  // Lower limbs
  for (const [side, sx] of [['left', 1], ['right', -1]] as const) {
    const thigh = smoothProfile(THIGH);
    const thighM = chain(T(sx * 0.088, 0.48, 0), S(0.96, 1, 1));
    add(`thigh-${side}`, 'anterior', lathe(thigh, FRONT, thighM));
    add(`thigh-${side}`, 'posterior', lathe(thigh, BACK, thighM));
    const leg = smoothProfile(LEG);
    const legM = T(sx * 0.086, 0.07, 0);
    add(`leg-${side}`, 'anterior', lathe(leg, FRONT, legM));
    add(`leg-${side}`, 'posterior', lathe(leg, BACK, legM));
    // Foot: lathe axis rotated to point forward; local front half becomes the sole (posterior surface).
    const foot = smoothProfile(FOOT);
    const footM = chain(T(sx * 0.09, 0.038, -0.06), Rx(Math.PI / 2), S(1, 1, 0.72));
    add(`foot-${side}`, 'posterior', lathe(foot, FRONT, footM));
    add(`foot-${side}`, 'anterior', lathe(foot, BACK, footM));
    joints.push(ellipsoid(new THREE.Vector3(sx * 0.087, 0.485, 0), new THREE.Vector3(0.05, 0.05, 0.05)));
    joints.push(ellipsoid(new THREE.Vector3(sx * 0.087, 0.075, -0.012), new THREE.Vector3(0.033, 0.035, 0.035)));
  }

  // Upper limbs (anatomical position: palms forward, so the anterior half of the hand is the palm)
  for (const [side, sx] of [['left', 1], ['right', -1]] as const) {
    const base = chain(T(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z), Rz(sx * ARM_ABDUCTION));
    const upper = smoothProfile(UPPER_ARM);
    add(`upper-arm-${side}`, 'anterior', lathe(upper, FRONT, base.clone()));
    add(`upper-arm-${side}`, 'posterior', lathe(upper, BACK, base.clone()));
    const elbow = chain(base.clone(), T(0, -0.3, 0));
    const fore = smoothProfile(FOREARM);
    add(`forearm-${side}`, 'anterior', lathe(fore, FRONT, elbow.clone()));
    add(`forearm-${side}`, 'posterior', lathe(fore, BACK, elbow.clone()));
    const wrist = chain(elbow.clone(), T(0, -0.262, 0));
    const hand = smoothProfile(HAND);
    const handM = chain(wrist.clone(), S(1, 1, 0.4));
    add(`hand-${side}`, 'anterior', lathe(hand, FRONT, handM));
    add(`hand-${side}`, 'posterior', lathe(hand, BACK, handM));
    const shoulderJoint = ellipsoid(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.056, 0.058, 0.056));
    shoulderJoint.applyMatrix4(base.clone());
    const elbowJoint = ellipsoid(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.036, 0.036, 0.036));
    elbowJoint.applyMatrix4(elbow.clone());
    const wristJoint = ellipsoid(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.025, 0.022, 0.018));
    wristJoint.applyMatrix4(wrist.clone());
    joints.push(shoulderJoint, elbowJoint, wristJoint);
  }

  const out: MannequinPart[] = [];
  for (const [key, geoms] of parts) {
    const [segment, surface] = key.split(':') as [BodySegmentId, Surface];
    const merged = geoms.length === 1 ? geoms[0]! : (mergeGeometries(geoms.map(nonIndexed), false) ?? geoms[0]!);
    merged.computeBoundingSphere();
    out.push({ key, segment, surface, geometry: merged });
  }
  const jointGeometry = mergeGeometries(joints.map(nonIndexed), false)!;
  return { parts: out, joints: jointGeometry, height: 1.75 };
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  // mergeGeometries requires identical attribute sets.
  for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(name)) ng.deleteAttribute(name);
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((ng.attributes.position!.count) * 2), 2));
  return ng;
}

export const CAMERA_TARGET: [number, number, number] = [0, 0.88, 0];
export const CAMERA_VIEWS = {
  anterior: { label: 'Anterior', position: [0, 0.92, 3.5] as [number, number, number] },
  posterior: { label: 'Posterior', position: [0, 0.92, -3.5] as [number, number, number] },
  'left-lateral': { label: 'Left lateral', position: [3.5, 0.92, 0] as [number, number, number] },
  'right-lateral': { label: 'Right lateral', position: [-3.5, 0.92, 0] as [number, number, number] },
} as const;
export type CameraView = keyof typeof CAMERA_VIEWS;

/** For assets without per-surface meshes: decide anterior/posterior from a world-space face normal. */
export function surfaceFromNormal(normal: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number } = { x: 0, y: 0, z: 1 }): Surface {
  return normal.x * forward.x + normal.y * forward.y + normal.z * forward.z >= 0 ? 'anterior' : 'posterior';
}
