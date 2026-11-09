import { db } from '@/database/db';
import { fluidProtocolSchema, referenceDatasetSchema, validateOrThrow } from '@/database/validation';
import { hashDataset, hashProtocol, validateDatasetData, validateProtocolParameters } from '@/engines/integrity';
import type { FluidProtocol, FluidProtocolParameters, ReferenceDataset, VerificationRecord } from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/ids';
import { audit } from './audit';

export interface VerificationInput {
  verifiedBy: string;
  role: string;
  verificationDate: string;
  notes: string;
  /** The user must explicitly confirm this statement. */
  attestationConfirmed: boolean;
}

export const ATTESTATION_TEXT =
  'I have compared every value and parameter shown with the cited primary source and with our local policy, and I confirm they are correct for clinical use in this deployment.';

function checkVerificationInput(v: VerificationInput) {
  if (!v.attestationConfirmed) throw new Error('The attestation must be confirmed.');
  if (!v.verifiedBy.trim()) throw new Error('Verifier name is required.');
  if (!v.role.trim()) throw new Error('Verifier role is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.verificationDate)) throw new Error('Verification date is required.');
}

/* --------------------------- Reference datasets --------------------------- */

export async function verifyDataset(id: string, v: VerificationInput): Promise<ReferenceDataset> {
  checkVerificationInput(v);
  // Hash outside the transaction (Web Crypto is not transaction-safe), then re-check inside.
  const snapshot = await db.referenceDatasets.get(id);
  if (!snapshot) throw new Error('Dataset not found.');
  const contentHash = await hashDataset(snapshot);
  return db.transaction('rw', [db.referenceDatasets, db.auditEvents], async () => {
    const ds = await db.referenceDatasets.get(id);
    if (!ds) throw new Error('Dataset not found.');
    if (ds.updatedAt !== snapshot.updatedAt) throw new Error('The dataset changed while it was being verified. Review it again.');
    if (ds.status === 'retired') throw new Error('A retired dataset cannot be verified.');
    const problems = validateDatasetData(ds);
    if (problems.length) throw new Error(`Dataset fails integrity checks: ${problems.join(' ')}`);
    if (ds.kind !== 'urine-output-targets' && ds.sources.length === 0) throw new Error('A source reference is required.');
    if (ds.kind === 'urine-output-targets' && (!ds.source.trim() || ds.source.startsWith('Not configured')))
      throw new Error('A source reference is required.');
    const record: VerificationRecord = {
      verifiedBy: v.verifiedBy.trim(),
      role: v.role.trim(),
      verificationDate: v.verificationDate,
      attestation: ATTESTATION_TEXT,
      notes: v.notes,
      recordedAt: nowIso(),
      contentHash,
    };
    const updated: ReferenceDataset = { ...ds, status: 'verified', configured: true, verification: record, verificationDate: v.verificationDate, updatedAt: nowIso() };
    validateOrThrow(referenceDatasetSchema, updated, 'reference dataset');
    await db.referenceDatasets.put(updated);
    await audit('verify', 'referenceDataset', id, `version=${ds.version};hash=${record.contentHash.slice(0, 12)}`);
    return updated;
  });
}

export async function revokeDatasetVerification(id: string, reason: string): Promise<void> {
  await db.transaction('rw', [db.referenceDatasets, db.auditEvents], async () => {
    const ds = await db.referenceDatasets.get(id);
    if (!ds) throw new Error('Dataset not found.');
    await db.referenceDatasets.put({ ...ds, status: 'not-configured', configured: false, verification: null, verificationDate: null, updatedAt: nowIso() });
    await audit('revoke-verification', 'referenceDataset', id, `reason-length=${reason.length}`);
  });
}

/** Editing is only allowed while a dataset is NOT verified (verified data is immutable). */
export async function updateDatasetDraft(
  id: string,
  changes: Partial<Pick<ReferenceDataset, 'data' | 'name' | 'source' | 'sources' | 'population' | 'ageRangeYears' | 'transcriptionNotes'>>,
): Promise<ReferenceDataset> {
  return db.transaction('rw', [db.referenceDatasets, db.auditEvents], async () => {
    const ds = await db.referenceDatasets.get(id);
    if (!ds) throw new Error('Dataset not found.');
    if (ds.status === 'verified') throw new Error('A verified dataset cannot be edited. Create a new version instead.');
    const updated = { ...ds, ...changes, updatedAt: nowIso() };
    validateOrThrow(referenceDatasetSchema, updated, 'reference dataset');
    await db.referenceDatasets.put(updated);
    await audit('update', 'referenceDataset', id, `fields=${Object.keys(changes).join(',')}`);
    return updated;
  });
}

export async function createDatasetVersion(id: string, newVersion: string): Promise<ReferenceDataset> {
  return db.transaction('rw', [db.referenceDatasets, db.auditEvents], async () => {
    const ds = await db.referenceDatasets.get(id);
    if (!ds) throw new Error('Dataset not found.');
    const newIdValue = `${ds.key}@${newVersion}`;
    if (await db.referenceDatasets.get(newIdValue)) throw new Error(`Version ${newVersion} already exists.`);
    const now = nowIso();
    const copy: ReferenceDataset = {
      ...structuredClone(ds),
      id: newIdValue,
      version: newVersion,
      status: 'not-configured',
      configured: false,
      verification: null,
      verificationDate: null,
      origin: 'user-defined',
      createdAt: now,
      updatedAt: now,
    };
    validateOrThrow(referenceDatasetSchema, copy, 'reference dataset');
    await db.referenceDatasets.add(copy);
    await audit('create-version', 'referenceDataset', newIdValue, `from=${ds.version}`);
    return copy;
  });
}

export async function setDatasetRetired(id: string, retired: boolean): Promise<void> {
  await db.transaction('rw', [db.referenceDatasets, db.auditEvents], async () => {
    const ds = await db.referenceDatasets.get(id);
    if (!ds) throw new Error('Dataset not found.');
    await db.referenceDatasets.put({
      ...ds,
      status: retired ? 'retired' : 'not-configured',
      configured: false,
      verification: retired ? ds.verification : null,
      verificationDate: retired ? ds.verificationDate : null,
      updatedAt: nowIso(),
    });
    await audit(retired ? 'retire' : 'unretire', 'referenceDataset', id, '');
  });
}

/* ------------------------------ Fluid protocols ------------------------------ */

export async function verifyProtocol(id: string, v: VerificationInput): Promise<FluidProtocol> {
  checkVerificationInput(v);
  const snapshot = await db.fluidProtocols.get(id);
  if (!snapshot) throw new Error('Protocol not found.');
  const contentHash = await hashProtocol(snapshot);
  return db.transaction('rw', [db.fluidProtocols, db.auditEvents], async () => {
    const p = await db.fluidProtocols.get(id);
    if (!p) throw new Error('Protocol not found.');
    if (p.updatedAt !== snapshot.updatedAt) throw new Error('The protocol changed while it was being verified. Review it again.');
    if (p.status === 'retired') throw new Error('A retired protocol cannot be verified.');
    const problems = validateProtocolParameters(p.parameters);
    if (problems.length) throw new Error(`Protocol is incomplete: ${problems.join(' ')}`);
    if (!p.source.trim() || p.source.startsWith('Not configured')) throw new Error('A source/reference is required.');
    const record: VerificationRecord = {
      verifiedBy: v.verifiedBy.trim(),
      role: v.role.trim(),
      verificationDate: v.verificationDate,
      attestation: ATTESTATION_TEXT,
      notes: v.notes,
      recordedAt: nowIso(),
      contentHash,
    };
    const updated: FluidProtocol = { ...p, status: 'verified', configured: true, verified: true, verification: record, verificationDate: v.verificationDate, updatedAt: nowIso() };
    validateOrThrow(fluidProtocolSchema, updated, 'fluid protocol');
    await db.fluidProtocols.put(updated);
    await audit('verify', 'fluidProtocol', id, `version=${p.version};hash=${record.contentHash.slice(0, 12)}`);
    return updated;
  });
}

export async function revokeProtocolVerification(id: string): Promise<void> {
  await db.transaction('rw', [db.fluidProtocols, db.auditEvents], async () => {
    const p = await db.fluidProtocols.get(id);
    if (!p) throw new Error('Protocol not found.');
    await db.fluidProtocols.put({ ...p, status: 'not-configured', configured: false, verified: false, verification: null, verificationDate: null, updatedAt: nowIso() });
    await audit('revoke-verification', 'fluidProtocol', id, '');
  });
}

export async function updateProtocolDraft(
  id: string,
  changes: Partial<Pick<FluidProtocol, 'name' | 'description' | 'source' | 'sources' | 'population' | 'ageRangeYears' | 'transcriptionNotes'>> & {
    parameters?: FluidProtocolParameters;
  },
): Promise<FluidProtocol> {
  return db.transaction('rw', [db.fluidProtocols, db.auditEvents], async () => {
    const p = await db.fluidProtocols.get(id);
    if (!p) throw new Error('Protocol not found.');
    if (p.status === 'verified') throw new Error('A verified protocol cannot be edited. Create a new version instead.');
    const updated = { ...p, ...changes, updatedAt: nowIso() };
    validateOrThrow(fluidProtocolSchema, updated, 'fluid protocol');
    await db.fluidProtocols.put(updated);
    await audit('update', 'fluidProtocol', id, `fields=${Object.keys(changes).join(',')}`);
    return updated;
  });
}

export async function createProtocolVersion(id: string, newVersion: string, asNewProtocol?: { name: string }): Promise<FluidProtocol> {
  return db.transaction('rw', [db.fluidProtocols, db.auditEvents], async () => {
    const p = await db.fluidProtocols.get(id);
    if (!p) throw new Error('Protocol not found.');
    const key = asNewProtocol ? `custom-${newId().slice(0, 8)}` : p.key;
    const newIdValue = `${key}@${newVersion}`;
    if (await db.fluidProtocols.get(newIdValue)) throw new Error(`Version ${newVersion} already exists.`);
    const now = nowIso();
    const copy: FluidProtocol = {
      ...structuredClone(p),
      id: newIdValue,
      key,
      name: asNewProtocol?.name ?? p.name,
      version: newVersion,
      status: 'not-configured',
      configured: false,
      verified: false,
      verification: null,
      verificationDate: null,
      origin: 'user-defined',
      createdAt: now,
      updatedAt: now,
    };
    validateOrThrow(fluidProtocolSchema, copy, 'fluid protocol');
    await db.fluidProtocols.add(copy);
    await audit('create-version', 'fluidProtocol', newIdValue, `from=${p.id}`);
    return copy;
  });
}

export async function setProtocolRetired(id: string, retired: boolean): Promise<void> {
  await db.transaction('rw', [db.fluidProtocols, db.auditEvents], async () => {
    const p = await db.fluidProtocols.get(id);
    if (!p) throw new Error('Protocol not found.');
    await db.fluidProtocols.put({
      ...p,
      status: retired ? 'retired' : 'not-configured',
      configured: false,
      verified: false,
      verification: retired ? p.verification : null,
      verificationDate: retired ? p.verificationDate : null,
      updatedAt: nowIso(),
    });
    await audit(retired ? 'retire' : 'unretire', 'fluidProtocol', id, '');
  });
}
