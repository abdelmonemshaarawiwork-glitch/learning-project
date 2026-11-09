import { db } from '@/database/db';
import { nowIso } from '@/utils/dates';

/**
 * Appends an audit event. Details must be NON-identifying (ids, counts, versions only).
 * Must be called inside the caller's transaction when one is open (Dexie picks it up via zone).
 */
export async function audit(action: string, entityType: string, entityId: string, details = ''): Promise<void> {
  await db.auditEvents.add({ timestamp: nowIso(), action, entityType, entityId, details });
}

export async function listAuditEvents(limit = 200) {
  return db.auditEvents.orderBy('timestamp').reverse().limit(limit).toArray();
}
