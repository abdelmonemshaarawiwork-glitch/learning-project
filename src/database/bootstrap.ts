import { db } from '@/database/db';
import { REFERENCE_TEMPLATES } from '@/reference-data/tbsa-templates';
import { FLUID_PROTOCOL_TEMPLATES } from '@/reference-data/fluid-protocol-templates';
import type { FluidProtocol, ReferenceDataset } from '@/types/domain';
import { nowIso } from '@/utils/dates';

/**
 * Adds any bundled reference/protocol TEMPLATE that is not yet present.
 * Existing records (including verified ones) are never modified or replaced.
 * Templates are always inserted as NOT CONFIGURED.
 */
export async function ensureBundledTemplates(): Promise<{ added: string[] }> {
  const added: string[] = [];
  await db.transaction('rw', [db.referenceDatasets, db.fluidProtocols], async () => {
    const now = nowIso();
    for (const t of REFERENCE_TEMPLATES) {
      if (await db.referenceDatasets.get(t.id)) continue;
      const ds: ReferenceDataset = {
        ...structuredClone(t),
        status: 'not-configured',
        configured: false,
        verification: null,
        verificationDate: null,
        createdAt: now,
        updatedAt: now,
      } as ReferenceDataset;
      await db.referenceDatasets.add(ds);
      added.push(t.id);
    }
    for (const t of FLUID_PROTOCOL_TEMPLATES) {
      if (await db.fluidProtocols.get(t.id)) continue;
      const p: FluidProtocol = {
        ...structuredClone(t),
        status: 'not-configured',
        configured: false,
        verified: false,
        verification: null,
        verificationDate: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.fluidProtocols.add(p);
      added.push(t.id);
    }
  });
  return { added };
}

/** Asks the browser to keep IndexedDB data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function initialiseDatabase(): Promise<void> {
  await db.open();
  await ensureBundledTemplates();
}
