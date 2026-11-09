#!/usr/bin/env node
/**
 * Builds public/models/makehuman-body.glb from the CC0 MakeHuman base mesh (hm08).
 *
 * Inputs (download into a folder, then pass it as the first argument):
 *   https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
 *   https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw
 *   https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.ASSETS.md
 * Both data files are released under CC0 1.0 (see the file headers and LICENSE.ASSETS.md).
 *
 * Usage: node scripts/build-anatomical-model.mjs <input-dir> [output-dir=public/models]
 *
 * Segmentation (documented in docs/ARCHITECTURE.md and the manifest):
 *  1. Each vertex is assigned to the skeleton bone with the highest skinning weight; bones map
 *     to the body segments used by the reference datasets (head, neck, trunk, upper arm,
 *     forearm, hand, thigh, lower leg, foot).
 *  2. Buttocks and genitalia/perineum are carved geometrically from the pelvic region.
 *  3. Anterior/posterior is decided per face from its normal: +Z for head, neck, trunk, upper
 *     arm and lower limb; the palm direction (derived from thumb and finger positions) for the
 *     forearm and hand; dorsum vs. sole/heel for the foot.
 *  4. Labels are smoothed over face adjacency to remove isolated faces.
 * The boundaries are an engineering approximation and must be reviewed (manifest:
 * anatomicallyReviewed = false).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const inDir = process.argv[2];
const outDir = process.argv[3] ?? 'public/models';
if (!inDir) {
  console.error('Usage: node scripts/build-anatomical-model.mjs <input-dir> [output-dir]');
  process.exit(1);
}
const objText = readFileSync(path.join(inDir, 'base.obj'), 'utf8');
const weightsJson = JSON.parse(readFileSync(path.join(inDir, 'default_weights.mhw'), 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');

/* ------------------------------------------------------------------ */
/* Parse OBJ                                                           */
/* ------------------------------------------------------------------ */
const V = [];
const bodyQuads = [];
const eyeQuads = [];
let group = '';
for (const line of objText.split('\n')) {
  if (line.startsWith('v ')) {
    const [, x, y, z] = line.trim().split(/\s+/);
    V.push([+x, +y, +z]);
  } else if (line.startsWith('g ')) {
    group = line.trim().split(/\s+/)[1];
  } else if (line.startsWith('f ')) {
    const idx = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split('/')[0], 10) - 1);
    if (group === 'body') bodyQuads.push(idx);
    else if (group === 'helper-l-eye' || group === 'helper-r-eye') eyeQuads.push(idx);
  }
}
const tri = (quads) => quads.flatMap((q) => (q.length === 4 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[2]]]));
// Labels are assigned per original quad (clean boundaries); triangulation happens on output.
const T = bodyQuads;
const eyeT = tri(eyeQuads);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mean = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);

/* Smooth vertex normals over the whole body (seamless shading across region boundaries). */
const vn = V.map(() => [0, 0, 0]);
const faceNormal = T.map((q) => {
  const n = [0, 0, 0];
  for (const [a, b, c] of tri([q])) {
    const tn = cross(sub(V[b], V[a]), sub(V[c], V[a])); // area-weighted
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) vn[i][k] += tn[k];
    for (let k = 0; k < 3; k++) n[k] += tn[k];
  }
  return norm(n);
});
for (let i = 0; i < vn.length; i++) vn[i] = norm(vn[i]);
const centroid = T.map((q) => mean(q.map((i) => V[i])));

/* ------------------------------------------------------------------ */
/* Bones → segments                                                    */
/* ------------------------------------------------------------------ */
const bestBone = new Map();
for (const [bone, list] of Object.entries(weightsJson.weights)) {
  for (const [vi, w] of list) {
    const cur = bestBone.get(vi);
    if (!cur || w > cur.w) bestBone.set(vi, { bone, w });
  }
}
function boneSegment(bone) {
  const side = bone.endsWith('.L') ? 'left' : bone.endsWith('.R') ? 'right' : null;
  const n = bone.replace(/\.(L|R)$/, '');
  if (/^(head|jaw|eye|levator|oculi|orbicularis|oris|risorius|special0|tongue)/.test(n)) return 'head';
  if (/^neck/.test(n)) return 'neck';
  if (/^(spine|breast|clavicle|root)/.test(n)) return 'trunk';
  if (/^pelvis/.test(n)) return 'trunk';
  if (/^(shoulder|upperarm)/.test(n)) return `upper-arm-${side}`;
  if (/^lowerarm/.test(n)) return `forearm-${side}`;
  if (/^(wrist|metacarpal|finger)/.test(n)) return `hand-${side}`;
  if (/^upperleg/.test(n)) return `thigh-${side}`;
  if (/^lowerleg/.test(n)) return `leg-${side}`;
  if (/^(foot|toe)/.test(n)) return `foot-${side}`;
  return 'trunk';
}
const vSeg = V.map((_, i) => (bestBone.has(i) ? boneSegment(bestBone.get(i).bone) : null));

/* Face adjacency (shared edges) */
const edgeMap = new Map();
T.forEach((t, fi) => {
  for (let k = 0; k < t.length; k++) {
    const a = t[k];
    const b = t[(k + 1) % t.length];
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const list = edgeMap.get(key);
    if (list) list.push(fi);
    else edgeMap.set(key, [fi]);
  }
});
const adj = T.map(() => []);
for (const list of edgeMap.values()) if (list.length === 2) {
  adj[list[0]].push(list[1]);
  adj[list[1]].push(list[0]);
}

function mode(values) {
  const c = new Map();
  for (const v of values) c.set(v, (c.get(v) ?? 0) + 1);
  let best = null;
  let n = -1;
  for (const [v, k] of c) if (k > n) [best, n] = [v, k];
  return best;
}
let fSeg = T.map((t) => mode(t.map((i) => vSeg[i]).filter(Boolean)) ?? 'trunk');

/* Geometric landmarks (MakeHuman units = decimetres, +Y up, +Z anterior, +X patient's left) */
const bodyVerts = [...new Set(T.flat())];
const minY = Math.min(...bodyVerts.map((i) => V[i][1]));
const crotchY = Math.min(...bodyVerts.filter((i) => Math.abs(V[i][0]) < 0.25 && V[i][1] > minY + 6).map((i) => V[i][1]));
const pelvisVerts = bodyVerts.filter((i) => Math.abs(V[i][1] - crotchY) < 1.5 && Math.abs(V[i][0]) < 1.8);
const pelvisZ = mean(pelvisVerts.map((i) => V[i]))[2];
const P = JSON.parse(process.env.BT_SEG_PARAMS ?? '{}');
const glutealFoldY = crotchY + (P.foldBelow ?? -0.35);
const glutealTopY = crotchY + (P.glutealTop ?? 2.1);
const genitalTopY = crotchY + (P.genitalTop ?? 0.75);
const genitalHalfWidth = P.genitalHalfWidth ?? 0.55;

/* Carve buttocks (posterior pelvis) and genitalia/perineum (anterior crotch). */
fSeg = fSeg.map((s, fi) => {
  const [x, y, z] = centroid[fi];
  const n = faceNormal[fi];
  const pelvic = s === 'trunk' || s.startsWith('thigh-');
  if (!pelvic) return s;
  if (z < pelvisZ && y >= glutealFoldY && y <= glutealTopY && Math.abs(x) < 1.75 && n[2] < -0.05) return x >= 0 ? 'buttock-left' : 'buttock-right';
  if (z >= pelvisZ - 0.1 && y >= crotchY - 0.15 && y <= genitalTopY && Math.abs(x) < genitalHalfWidth * (1 - Math.max(0, y - crotchY) / (genitalTopY - crotchY + 1e-9) * 0.45) && Math.abs(n[0]) < 0.7 && (n[2] > -0.1 || n[1] < -0.5)) return 'genitalia';
  return s;
});

/* Smooth segment labels (majority of neighbours) */
for (let pass = 0; pass < 3; pass++) {
  fSeg = fSeg.map((s, fi) => {
    const m = mode(adj[fi].map((j) => fSeg[j]));
    const same = adj[fi].filter((j) => fSeg[j] === s).length;
    return same <= 1 && m ? m : s;
  });
}

/* ------------------------------------------------------------------ */
/* Anterior / posterior                                                */
/* ------------------------------------------------------------------ */
const segCentroid = new Map();
for (const s of new Set(fSeg)) segCentroid.set(s, mean(T.map((_, fi) => fi).filter((fi) => fSeg[fi] === s).map((fi) => centroid[fi])));

function palmNormal(side) {
  const verts = (re) => bodyVerts.filter((i) => re.test(bestBone.get(i)?.bone ?? '')).map((i) => V[i]);
  const sfx = side === 'left' ? 'L' : 'R';
  const wrist = mean(verts(new RegExp(`^wrist\\.${sfx}$`)));
  const fingers = mean(verts(new RegExp(`^finger3-3\\.${sfx}$`)));
  const thumb = mean(verts(new RegExp(`^finger1-[23]\\.${sfx}$`)));
  const handC = mean(verts(new RegExp(`^(metacarpal|finger)\\d?-?\\d?\\.${sfx}$`)));
  const f = norm(sub(fingers, wrist));
  let t = sub(thumb, handC);
  t = norm(sub(t, f.map((c) => c * dot(t, f))));
  return norm(side === 'left' ? cross(f, t) : cross(t, f)); // anatomical position: palm faces +Z
}
const palm = { left: palmNormal('left'), right: palmNormal('right') };
/** Forearm anterior direction: the arm's front (+Z) at the elbow, rotating to the palm direction at the wrist. */
const forearmAxis = {};
for (const side of ['left', 'right']) {
  const sfx = side === 'left' ? 'L' : 'R';
  const pts = (re) => bodyVerts.filter((i) => re.test(bestBone.get(i)?.bone ?? '')).map((i) => V[i]);
  forearmAxis[side] = { elbow: mean(pts(new RegExp(`^upperarm02\\.${sfx}$`))), wrist: mean(pts(new RegExp(`^wrist\\.${sfx}$`))) };
}
function forearmReference(side, p) {
  const { elbow, wrist } = forearmAxis[side];
  const axis = sub(wrist, elbow);
  const len2 = dot(axis, axis);
  const t = Math.min(1, Math.max(0, dot(sub(p, elbow), axis) / len2));
  const a = norm(axis);
  const perp = (v) => norm(sub(v, a.map((c) => c * dot(v, a))));
  const front = perp([0, 0, 1]);
  const pal = perp(palm[side]);
  return norm(front.map((c, k) => c * (1 - t) + pal[k] * t));
}
const forward = [0, 0, 1];
const ONLY_POSTERIOR = new Set(['buttock-left', 'buttock-right']);
const ONLY_ANTERIOR = new Set(['genitalia']);

let fSurf = fSeg.map((s, fi) => {
  if (ONLY_POSTERIOR.has(s)) return 'posterior';
  if (ONLY_ANTERIOR.has(s)) return 'anterior';
  const n = faceNormal[fi];
  if (s.startsWith('foot-')) return n[1] < -0.35 || n[2] < -0.55 ? 'posterior' : 'anterior';
  if (s.startsWith('hand-') || s.startsWith('forearm-')) {
    const side = s.endsWith('left') ? 'left' : 'right';
    const pn = s.startsWith('hand-') ? palm[side] : forearmReference(side, centroid[fi]);
    const d = dot(n, pn);
    if (Math.abs(d) > 0.15) return d > 0 ? 'anterior' : 'posterior';
    return dot(sub(centroid[fi], segCentroid.get(s)), pn) >= 0 ? 'anterior' : 'posterior';
  }
  const d = dot(n, forward);
  if (Math.abs(d) > 0.15) return d > 0 ? 'anterior' : 'posterior';
  return centroid[fi][2] >= segCentroid.get(s)[2] ? 'anterior' : 'posterior';
});
for (let pass = 0; pass < 2; pass++) {
  fSurf = fSurf.map((s, fi) => {
    if (ONLY_POSTERIOR.has(fSeg[fi]) || ONLY_ANTERIOR.has(fSeg[fi])) return s;
    const same = adj[fi].filter((j) => fSeg[j] === fSeg[fi] && fSurf[j] === s).length;
    const other = adj[fi].filter((j) => fSeg[j] === fSeg[fi] && fSurf[j] !== s).length;
    return same === 0 && other >= 2 ? (s === 'anterior' ? 'posterior' : 'anterior') : s;
  });
}

/* ------------------------------------------------------------------ */
/* Build parts and write GLB                                           */
/* ------------------------------------------------------------------ */
const SCALE = 0.1; // decimetres → metres
const yOffset = -minY * SCALE;
const parts = new Map();
T.forEach((q, fi) => {
  const name = `${fSeg[fi]}__${fSurf[fi]}`;
  const list = parts.get(name);
  if (list) list.push(...tri([q]));
  else parts.set(name, tri([q]));
});
parts.set('eyes', eyeT);

const bufferChunks = [];
let byteLength = 0;
const gltf = {
  asset: { version: '2.0', generator: 'BURN TOOL build-anatomical-model.mjs', copyright: 'MakeHuman base mesh hm08 — CC0 1.0 (Data Collection AB, Joel Palmius, Jonas Hauquier)' },
  scene: 0,
  scenes: [{ name: 'body', nodes: [] }],
  nodes: [],
  meshes: [],
  materials: [
    { name: 'skin', pbrMetallicRoughness: { baseColorFactor: [0.80, 0.62, 0.52, 1], metallicFactor: 0, roughnessFactor: 0.72 }, doubleSided: false },
    { name: 'eye', pbrMetallicRoughness: { baseColorFactor: [0.12, 0.12, 0.14, 1], metallicFactor: 0, roughnessFactor: 0.3 } },
  ],
  accessors: [],
  bufferViews: [],
  buffers: [],
};
function addView(typed, target) {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) {
    bufferChunks.push(new Uint8Array(pad));
    byteLength += pad;
  }
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, target });
  bufferChunks.push(bytes);
  byteLength += bytes.byteLength;
  return gltf.bufferViews.length - 1;
}
const summary = {};
for (const [name, tris] of [...parts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const remap = new Map();
  const pos = [];
  const nor = [];
  const idx = [];
  for (const t of tris) for (const vi of t) {
    if (!remap.has(vi)) {
      remap.set(vi, remap.size);
      const p = V[vi];
      pos.push(p[0] * SCALE, p[1] * SCALE + yOffset, p[2] * SCALE);
      nor.push(...vn[vi]);
    }
    idx.push(remap.get(vi));
  }
  const P32 = new Float32Array(pos);
  const N32 = new Float32Array(nor);
  const I = remap.size < 65536 ? new Uint16Array(idx) : new Uint32Array(idx);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P32.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], P32[i + k]);
    max[k] = Math.max(max[k], P32[i + k]);
  }
  const pv = addView(P32, 34962);
  const nv = addView(N32, 34962);
  const iv = addView(I, 34963);
  const a0 = gltf.accessors.push({ bufferView: pv, componentType: 5126, count: remap.size, type: 'VEC3', min, max }) - 1;
  const a1 = gltf.accessors.push({ bufferView: nv, componentType: 5126, count: remap.size, type: 'VEC3' }) - 1;
  const a2 = gltf.accessors.push({ bufferView: iv, componentType: I instanceof Uint16Array ? 5123 : 5125, count: I.length, type: 'SCALAR' }) - 1;
  const mesh = gltf.meshes.push({ name: `${name}_mesh`, primitives: [{ attributes: { POSITION: a0, NORMAL: a1 }, indices: a2, material: name === 'eyes' ? 1 : 0 }] }) - 1;
  gltf.scenes[0].nodes.push(gltf.nodes.push({ name, mesh }) - 1);
  summary[name] = tris.length;
}
gltf.buffers.push({ byteLength });

const bin = new Uint8Array(byteLength + ((4 - (byteLength % 4)) % 4));
let off = 0;
for (const c of bufferChunks) {
  bin.set(c, off);
  off += c.byteLength;
}
let json = Buffer.from(JSON.stringify(gltf), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const total = 12 + 8 + json.length + 8 + bin.length;
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(json.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, jh, json, bh, Buffer.from(bin)]);

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'makehuman-body.glb'), glb);

const meshRegions = Object.fromEntries(
  [...parts.keys()]
    .filter((n) => n !== 'eyes')
    .map((n) => {
      const [segment, surface] = n.split('__');
      return [n, { segment, surface }];
    }),
);
const manifest = {
  file: 'makehuman-body.glb',
  name: 'MakeHuman base mesh (hm08), segmented for burn mapping',
  version: '1.0.0',
  license: {
    name: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution:
      'MakeHuman base mesh hm08 and default skeleton weights, released as CC0 by the MakeHuman project (Data Collection AB, Joel Palmius, Jonas Hauquier). https://github.com/makehumancommunity/makehuman',
    redistributionPermitted: true,
  },
  anatomicallyReviewed: false,
  reviewNotes:
    'Realistic human surface model. Region boundaries were derived automatically from skeleton skinning weights, geometric rules for buttocks/genitalia and face normals for anterior/posterior; they are approximate and have not been reviewed by a clinician. Always check the selected region label.',
  forwardAxis: '+z',
  scale: 1,
  offsetY: 0,
  meshRegions,
  provenance: {
    source: 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj',
    sourceSha256: sha(objText),
    weights: 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw',
    weightsSha256: sha(readFileSync(path.join(inDir, 'default_weights.mhw'))),
    builtBy: 'scripts/build-anatomical-model.mjs',
    segmentationParameters: { crotchY, pelvisZ, glutealFoldY, glutealTopY, genitalTopY, genitalHalfWidth, units: 'decimetres (source)' },
  },
};
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${glb.length} bytes, ${parts.size} meshes`);
console.log(JSON.stringify(summary));
