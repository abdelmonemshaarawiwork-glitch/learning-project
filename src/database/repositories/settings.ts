import { db } from '@/database/db';
import { nowIso } from '@/utils/dates';
import { audit } from './audit';

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const rec = await db.settings.get(key);
  return rec?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.transaction('rw', [db.settings, db.auditEvents], async () => {
    await db.settings.put({ id: key, key, value, updatedAt: nowIso() });
    await audit('update', 'setting', key, '');
  });
}

export async function getDraft<T>(id: string): Promise<T | null> {
  const rec = await db.drafts.get(id);
  return (rec?.data as T | undefined) ?? null;
}

export async function saveDraft(id: string, data: unknown): Promise<void> {
  await db.drafts.put({ id, data, updatedAt: nowIso() });
}

export async function clearDraft(id: string): Promise<void> {
  await db.drafts.delete(id);
}
