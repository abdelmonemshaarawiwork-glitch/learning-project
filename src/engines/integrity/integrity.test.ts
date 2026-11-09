import { describe, expect, it } from 'vitest';
import { LUND_BROWDER_TEMPLATE } from '@/reference-data/tbsa-templates';
import { PARKLAND_TEMPLATE } from '@/reference-data/fluid-protocol-templates';
import type { FluidProtocol, ReferenceDataset } from '@/types/domain';
import { canonicalJson, checkDatasetUsable, checkProtocolUsable, hashDataset, hashProtocol } from './index';

const now = '2026-01-01T00:00:00.000Z';
const ds = (): ReferenceDataset => ({ ...structuredClone(LUND_BROWDER_TEMPLATE), status: 'not-configured', configured: false, verification: null, verificationDate: null, createdAt: now, updatedAt: now });

describe('integrity', () => {
  it('canonical JSON is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
  it('unverified dataset is not usable', async () => {
    const r = await checkDatasetUsable(ds());
    expect(r.usable).toBe(false);
    expect(r.reasons[0]).toContain('NOT CONFIGURED');
  });
  it('verified dataset with matching hash is usable; tampering invalidates it', async () => {
    const d = ds();
    const hash = await hashDataset(d);
    d.status = 'verified';
    d.configured = true;
    d.verification = { verifiedBy: 'Dr Test', role: 'Consultant', verificationDate: '2026-01-01', attestation: 'ok', notes: '', recordedAt: now, contentHash: hash };
    expect((await checkDatasetUsable(d)).usable).toBe(true);
    (d.data as { regions: { percentByColumn: Record<string, number> }[] }).regions[0]!.percentByColumn['adult'] = 3.6;
    const after = await checkDatasetUsable(d);
    expect(after.usable).toBe(false);
    expect(after.reasons.join(' ')).toMatch(/hash mismatch|sums to/);
  });
  it('protocol verification gating', async () => {
    const p: FluidProtocol = { ...structuredClone(PARKLAND_TEMPLATE), status: 'not-configured', configured: false, verified: false, verification: null, verificationDate: null, createdAt: now, updatedAt: now };
    expect((await checkProtocolUsable(p)).usable).toBe(false);
    p.status = 'verified';
    p.verification = { verifiedBy: 'x', role: 'y', verificationDate: '2026-01-01', attestation: 'ok', notes: '', recordedAt: now, contentHash: await hashProtocol(p) };
    expect((await checkProtocolUsable(p)).usable).toBe(true);
  });
});
