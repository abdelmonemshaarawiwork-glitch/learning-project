import { describe, expect, it } from 'vitest';
import { ALL_SEGMENT_KEYS } from '@/constants/clinical';
import { buildMannequin, surfaceFromNormal } from './mannequin';
import { parseManifest } from './modelManifest';

describe('development mannequin', () => {
  const m = buildMannequin();
  it('has one selectable mesh for every body segment surface', () => {
    expect(m.parts.map((p) => p.key).sort()).toEqual([...ALL_SEGMENT_KEYS].sort());
  });
  it('every part has geometry within a human-sized bounding box', () => {
    for (const p of m.parts) {
      expect(p.geometry.attributes.position!.count).toBeGreaterThan(10);
      p.geometry.computeBoundingBox();
      const b = p.geometry.boundingBox!;
      expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(b.max.y).toBeLessThanOrEqual(1.8);
    }
  });
  it('anterior halves face +Z and posterior halves face −Z (except feet: sole is posterior)', () => {
    const centroidZ = (key: string) => {
      const p = m.parts.find((x) => x.key === key)!;
      p.geometry.computeBoundingBox();
      const b = p.geometry.boundingBox!;
      return (b.min.z + b.max.z) / 2;
    };
    expect(centroidZ('trunk:anterior')).toBeGreaterThan(centroidZ('trunk:posterior'));
    expect(centroidZ('thigh-left:anterior')).toBeGreaterThan(centroidZ('thigh-left:posterior'));
    const footY = (key: string) => {
      const p = m.parts.find((x) => x.key === key)!;
      p.geometry.computeBoundingBox();
      return (p.geometry.boundingBox!.min.y + p.geometry.boundingBox!.max.y) / 2;
    };
    expect(footY('foot-left:anterior')).toBeGreaterThan(footY('foot-left:posterior'));
  });
  it("patient's left side is +X", () => {
    const p = m.parts.find((x) => x.key === 'hand-left:anterior')!;
    p.geometry.computeBoundingBox();
    expect(p.geometry.boundingBox!.min.x).toBeGreaterThan(0);
  });
  it('derives surface from a face normal', () => {
    expect(surfaceFromNormal({ x: 0, y: 0, z: 1 })).toBe('anterior');
    expect(surfaceFromNormal({ x: 0, y: 0.2, z: -0.9 })).toBe('posterior');
  });
});

describe('licensed model manifest', () => {
  const valid = {
    file: 'body.glb',
    name: 'Model',
    version: '1.0.0',
    license: { name: 'CC-BY-4.0', attribution: 'Author', redistributionPermitted: true },
    anatomicallyReviewed: false,
    meshRegions: { Head: { segment: 'head' } },
  };
  it('accepts a complete manifest', () => {
    expect(parseManifest(valid).ok).toBe(true);
  });
  it('rejects missing licence information, unknown segments and unsafe file names', () => {
    expect(parseManifest({ ...valid, license: { name: '', attribution: 'x', redistributionPermitted: true } }).ok).toBe(false);
    expect(parseManifest({ ...valid, license: { ...valid.license, redistributionPermitted: false } }).ok).toBe(false);
    expect(parseManifest({ ...valid, meshRegions: { Head: { segment: 'tail' } } }).ok).toBe(false);
    expect(parseManifest({ ...valid, file: '../evil.glb' }).ok).toBe(false);
  });
});
