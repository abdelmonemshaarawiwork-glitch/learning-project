/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SEGMENT_KEYS, segmentKey } from '@/constants/clinical';
import { parseManifest } from './modelManifest';

const dir = path.resolve(process.cwd(), 'public/models');

function glbJson(file: string): { meshes: { name: string }[]; nodes: { name: string; mesh?: number }[]; asset: { version: string } } {
  const buf = readFileSync(file);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  expect(buf.readUInt32LE(4)).toBe(2);
  expect(buf.readUInt32LE(8)).toBe(buf.length);
  const jsonLen = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16)).toBe(0x4e4f534a); // "JSON"
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

describe('bundled anatomical model (MakeHuman CC0)', () => {
  const manifestJson = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const parsed = parseManifest(manifestJson);
  it('has a valid manifest with licence information and is flagged as not clinically reviewed', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.license.name).toBe('CC0-1.0');
    expect(parsed.manifest.license.redistributionPermitted).toBe(true);
    expect(parsed.manifest.anatomicallyReviewed).toBe(false);
  });
  it('maps every body segment surface to exactly one mesh present in the GLB', () => {
    if (!parsed.ok) throw new Error('manifest invalid');
    const gltf = glbJson(path.join(dir, parsed.manifest.file));
    expect(gltf.asset.version).toBe('2.0');
    const meshNames = new Set(gltf.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name));
    const mapped = Object.entries(parsed.manifest.meshRegions).map(([name, r]) => {
      expect(meshNames.has(name), name).toBe(true);
      return segmentKey(r.segment, r.surface!);
    });
    expect([...mapped].sort()).toEqual([...ALL_SEGMENT_KEYS].sort());
  });
});
