/**
 * Local backup & restore.
 *
 * - Plain backups are JSON files with a SHA-256 checksum over their table contents.
 * - Optional encryption: AES-GCM-256 with a key derived from the user's password via
 *   PBKDF2-SHA-256 (600,000 iterations, 16-byte random salt, 12-byte random IV).
 *   The password is never stored. If it is forgotten the backup cannot be decrypted.
 * - Restore is a two-step process: analyse (validate + preview) → apply (single transaction).
 * - Nothing is uploaded anywhere: files are created and read locally.
 */
import { z } from 'zod';
import { APP_VERSION } from '@/constants/clinical';
import { ALL_TABLES, db, PATIENT_TABLES, type TableName } from '@/database/db';
import { CURRENT_SCHEMA_VERSION } from '@/database/migrations';
import { clinicalPhotoBackupSchema, formatZodError, TABLE_SCHEMAS } from '@/database/validation';
import { canonicalJson, sha256Hex } from '@/engines/integrity';
import type { Assessment, ClinicalPhoto, FluidCalculationRecord, Patient, TimelineEvent } from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { generatePatientCode, newId } from '@/utils/ids';
import { audit } from '@/database/repositories/audit';

export const BACKUP_FORMAT = 'burn-tool-backup';
export const ENCRYPTED_BACKUP_FORMAT = 'burn-tool-backup-encrypted';
export const BACKUP_FORMAT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;

/** Tables included in backups (drafts are transient and excluded). */
export const BACKUP_TABLES = ALL_TABLES.filter((t) => t !== 'drafts') as Exclude<TableName, 'drafts'>[];
export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  scope: 'all' | 'patients';
  patientIds: string[];
  counts: Partial<Record<BackupTable, number>>;
  checksum: string;
  tables: Partial<Record<BackupTable, unknown[]>>;
}

export interface EncryptedBackupFile {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** Photos are stored as bytes; in backup files they are base64 strings. */
function photoToBackup(p: ClinicalPhoto) {
  const { imageData, ...rest } = p;
  return { ...rest, imageBase64: toBase64(new Uint8Array(imageData)) };
}

function photoFromBackup(r: Record<string, unknown>): ClinicalPhoto {
  const { imageBase64, ...rest } = r as { imageBase64: string } & Record<string, unknown>;
  const bytes = fromBase64(imageBase64);
  return { ...(rest as unknown as Omit<ClinicalPhoto, 'imageData'>), imageData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

export interface BackupOptions {
  /** Include clinical photographs (default true). */
  includePhotos?: boolean;
}

export async function buildBackup(options: ({ scope: 'all' } | { scope: 'patients'; patientIds: string[] }) & BackupOptions): Promise<BackupFile> {
  const tables: Partial<Record<BackupTable, unknown[]>> = {};
  let patientIds: string[] = [];
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    if (options.scope === 'all') {
      for (const t of BACKUP_TABLES) tables[t] = await db.table(t).toArray();
      patientIds = (tables.patients as Patient[]).map((p) => p.id);
    } else {
      patientIds = [...new Set(options.patientIds)];
      if (patientIds.length === 0) throw new Error('Select at least one patient to export.');
      tables.patients = (await db.patients.bulkGet(patientIds)).filter(Boolean) as Patient[];
      if (tables.patients.length !== patientIds.length) throw new Error('One or more selected patients no longer exist.');
      for (const t of PATIENT_TABLES) tables[t] = await db.table(t).where('patientId').anyOf(patientIds).toArray();
      // Include the exact reference/protocol versions these records were calculated with.
      const refIds = new Set((tables.assessments as Assessment[]).map((a) => a.referenceDatasetId).filter((x): x is string => !!x));
      const protoIds = new Set((tables.fluidCalculations as FluidCalculationRecord[]).map((c) => c.protocolId));
      tables.referenceDatasets = (await db.referenceDatasets.bulkGet([...refIds])).filter(Boolean);
      tables.fluidProtocols = (await db.fluidProtocols.bulkGet([...protoIds])).filter(Boolean);
    }
  });
  if (options.includePhotos === false) delete tables.clinicalPhotos;
  else if (tables.clinicalPhotos) tables.clinicalPhotos = (tables.clinicalPhotos as ClinicalPhoto[]).map(photoToBackup);
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v?.length ?? 0])) as BackupFile['counts'];
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: nowIso(),
    scope: options.scope,
    patientIds,
    counts,
    checksum: await sha256Hex(canonicalJson(tables)),
    tables,
  };
}

/* ------------------------------------------------------------------ */
/* Encryption (Web Crypto)                                             */
/* ------------------------------------------------------------------ */

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export const MIN_PASSWORD_LENGTH = 10;

export async function encryptBackup(backup: BackupFile, password: string, iterations = PBKDF2_ITERATIONS): Promise<EncryptedBackupFile> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: backup.exportedAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ciphertext: toBase64(ciphertext),
  };
}

export async function decryptBackup(file: EncryptedBackupFile, password: string): Promise<unknown> {
  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(file.cipher.iv) }, key, fromBase64(file.ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('Decryption failed: the password is incorrect or the file is damaged.');
  }
}

/* ------------------------------------------------------------------ */
/* Parse & analyse                                                     */
/* ------------------------------------------------------------------ */

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int(),
  appVersion: z.string(),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  scope: z.enum(['all', 'patients']),
  patientIds: z.array(z.string()),
  counts: z.record(z.string(), z.number()),
  checksum: z.string(),
  tables: z.record(z.string(), z.array(z.unknown())),
});

const encryptedSchema = z.object({
  format: z.literal(ENCRYPTED_BACKUP_FORMAT),
  formatVersion: z.number().int(),
  appVersion: z.string(),
  exportedAt: z.string(),
  kdf: z.object({ name: z.literal('PBKDF2'), hash: z.literal('SHA-256'), iterations: z.number().int().min(100_000), salt: z.string() }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: z.string() }),
  ciphertext: z.string(),
});

export type ParsedFile =
  | { kind: 'plain'; data: unknown }
  | { kind: 'encrypted'; file: EncryptedBackupFile }
  | { kind: 'invalid'; error: string };

export function parseBackupText(text: string): ParsedFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'invalid', error: 'The file is not valid JSON.' };
  }
  const fmt = (json as { format?: unknown })?.format;
  if (fmt === ENCRYPTED_BACKUP_FORMAT) {
    const r = encryptedSchema.safeParse(json);
    if (!r.success) return { kind: 'invalid', error: `Encrypted backup header is invalid: ${formatZodError(r.error)}` };
    return { kind: 'encrypted', file: r.data as EncryptedBackupFile };
  }
  if (fmt === BACKUP_FORMAT) return { kind: 'plain', data: json };
  return { kind: 'invalid', error: 'This file is not a BurnMatrix backup.' };
}

export type ImportStrategy = 'skip-existing' | 'replace-existing' | 'import-as-copies';

export interface RecordError {
  table: string;
  index: number;
  id: string | null;
  message: string;
}

export interface BackupAnalysis {
  compatible: boolean;
  fatalErrors: string[];
  warnings: string[];
  backup: BackupFile | null;
  /** Valid records per table. */
  valid: Partial<Record<BackupTable, unknown[]>>;
  counts: Partial<Record<BackupTable, number>>;
  /** Records whose id already exists locally, per table. */
  duplicates: Partial<Record<BackupTable, number>>;
  recordErrors: RecordError[];
  checksumOk: boolean;
}

function recordId(r: unknown): string | null {
  const id = (r as { id?: unknown })?.id;
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : null;
}

export async function analyseBackup(raw: unknown): Promise<BackupAnalysis> {
  const base: BackupAnalysis = {
    compatible: false,
    fatalErrors: [],
    warnings: [],
    backup: null,
    valid: {},
    counts: {},
    duplicates: {},
    recordErrors: [],
    checksumOk: false,
  };
  const env = envelopeSchema.safeParse(raw);
  if (!env.success) return { ...base, fatalErrors: [`Backup structure is invalid: ${formatZodError(env.error)}`] };
  const backup = env.data as unknown as BackupFile;
  base.backup = backup;

  if (backup.formatVersion > BACKUP_FORMAT_VERSION)
    base.fatalErrors.push(`Backup format v${backup.formatVersion} was created by a newer version of BurnMatrix (supported: v${BACKUP_FORMAT_VERSION}). Update the application first.`);
  if (backup.schemaVersion > CURRENT_SCHEMA_VERSION)
    base.fatalErrors.push(`Backup database schema v${backup.schemaVersion} is newer than this application's schema v${CURRENT_SCHEMA_VERSION}. Update the application first.`);
  if (backup.schemaVersion < CURRENT_SCHEMA_VERSION)
    base.warnings.push(`Backup was created with schema v${backup.schemaVersion}; records will be checked against schema v${CURRENT_SCHEMA_VERSION}.`);

  base.checksumOk = (await sha256Hex(canonicalJson(backup.tables))) === backup.checksum;
  if (!base.checksumOk) base.fatalErrors.push('Checksum mismatch: the backup file has been modified or is damaged.');

  const unknownTables = Object.keys(backup.tables).filter((t) => !(BACKUP_TABLES as string[]).includes(t));
  if (unknownTables.length) base.warnings.push(`Ignoring unknown tables: ${unknownTables.join(', ')}.`);

  // Per-record validation
  for (const t of BACKUP_TABLES) {
    const rows = backup.tables[t];
    if (!rows) continue;
    const schema = (t === 'clinicalPhotos' ? clinicalPhotoBackupSchema : TABLE_SCHEMAS[t]) as z.ZodType;
    const ok: unknown[] = [];
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const r = schema.safeParse(row);
      const id = recordId(row);
      if (!r.success) {
        base.recordErrors.push({ table: t, index, id, message: formatZodError(r.error) });
        return;
      }
      if (id && t !== 'auditEvents') {
        if (seen.has(id)) {
          base.recordErrors.push({ table: t, index, id, message: 'Duplicate id inside the backup file.' });
          return;
        }
        seen.add(id);
      }
      ok.push(row);
    });
    base.valid[t] = ok;
    base.counts[t] = ok.length;
  }

  // Referential integrity: patient-linked records must reference a patient in the backup or on this device.
  const backupPatientIds = new Set((base.valid.patients as Patient[] | undefined)?.map((p) => p.id) ?? []);
  const localPatientIds = new Set(await db.patients.toCollection().primaryKeys());
  for (const t of PATIENT_TABLES) {
    const rows = base.valid[t] as { id: string; patientId: string }[] | undefined;
    if (!rows) continue;
    base.valid[t] = rows.filter((r, index) => {
      if (backupPatientIds.has(r.patientId) || localPatientIds.has(r.patientId)) return true;
      base.recordErrors.push({ table: t, index, id: r.id, message: 'References a patient that is not in the backup or on this device.' });
      return false;
    });
    base.counts[t] = base.valid[t]!.length;
  }
  const assessmentIds = new Set((base.valid.assessments as { id: string }[] | undefined)?.map((a) => a.id) ?? []);
  const regions = base.valid.assessmentRegions as { id: string; assessmentId: string }[] | undefined;
  if (regions) {
    const localAssessmentIds = new Set(await db.assessments.toCollection().primaryKeys());
    base.valid.assessmentRegions = regions.filter((r, index) => {
      if (assessmentIds.has(r.assessmentId) || localAssessmentIds.has(r.assessmentId)) return true;
      base.recordErrors.push({ table: 'assessmentRegions', index, id: r.id, message: 'References an assessment that is not in the backup.' });
      return false;
    });
    base.counts.assessmentRegions = base.valid.assessmentRegions.length;
  }

  // Duplicate ids against the local database
  for (const t of BACKUP_TABLES) {
    if (t === 'auditEvents') continue;
    const rows = base.valid[t];
    if (!rows?.length) continue;
    const ids = rows.map(recordId).filter((x): x is string => !!x);
    const existing = await db.table(t).bulkGet(ids);
    base.duplicates[t] = existing.filter(Boolean).length;
  }

  if (base.recordErrors.length) base.warnings.push(`${base.recordErrors.length} record(s) failed validation and will not be imported.`);
  base.compatible = base.fatalErrors.length === 0;
  return base;
}

/* ------------------------------------------------------------------ */
/* Apply                                                               */
/* ------------------------------------------------------------------ */

export interface ImportResult {
  inserted: Partial<Record<BackupTable, number>>;
  replaced: Partial<Record<BackupTable, number>>;
  skipped: Partial<Record<BackupTable, number>>;
}

function remapForCopies(valid: Partial<Record<BackupTable, unknown[]>>): Partial<Record<BackupTable, unknown[]>> {
  const out = structuredClone(valid);
  const patientMap = new Map<string, string>();
  const recordMap = new Map<string, string>();
  for (const p of (out.patients ?? []) as Patient[]) {
    const nid = newId();
    patientMap.set(p.id, nid);
    p.id = nid;
    p.code = generatePatientCode();
  }
  // Only records belonging to patients in this backup are copied.
  for (const t of PATIENT_TABLES) {
    const rows = (out[t] ?? []) as { id: string; patientId: string }[];
    out[t] = rows.filter((r) => patientMap.has(r.patientId));
    for (const r of out[t] as { id: string; patientId: string }[]) {
      const nid = newId();
      recordMap.set(r.id, nid);
      r.id = nid;
      r.patientId = patientMap.get(r.patientId)!;
    }
  }
  const remap = (id: string | null) => (id ? (recordMap.get(id) ?? null) : null);
  for (const a of (out.assessments ?? []) as Assessment[]) {
    a.supersedesId = remap(a.supersedesId);
    a.supersededById = remap(a.supersededById);
  }
  for (const r of (out.assessmentRegions ?? []) as { assessmentId: string }[]) r.assessmentId = remap(r.assessmentId) ?? r.assessmentId;
  for (const c of (out.fluidCalculations ?? []) as FluidCalculationRecord[]) c.assessmentId = remap(c.assessmentId);
  for (const e of (out.timelineEvents ?? []) as TimelineEvent[]) e.linkedRecordId = remap(e.linkedRecordId);
  // Settings and audit history are not copied in copy mode.
  delete out.settings;
  delete out.auditEvents;
  return out;
}

export async function applyBackup(analysis: BackupAnalysis, strategy: ImportStrategy): Promise<ImportResult> {
  if (!analysis.compatible || !analysis.backup) throw new Error('This backup cannot be imported.');
  const data = strategy === 'import-as-copies' ? remapForCopies(analysis.valid) : analysis.valid;
  const result: ImportResult = { inserted: {}, replaced: {}, skipped: {} };

  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rawRows = data[t];
      if (!rawRows?.length) continue;
      // Convert without mutating the analysis (so a failed import can be retried).
      const rows = t === 'clinicalPhotos' ? rawRows.map((r) => photoFromBackup(r as Record<string, unknown>)) : rawRows;
      const table = db.table(t);
      if (t === 'auditEvents') {
        const existing = new Set((await db.auditEvents.toArray()).map((a) => `${a.timestamp}|${a.action}|${a.entityId}`));
        const fresh = (rows as { timestamp: string; action: string; entityId: string }[])
          .filter((a) => !existing.has(`${a.timestamp}|${a.action}|${a.entityId}`))
          .map((a) => {
            const { id: _drop, ...rest } = a as { id?: number };
            void _drop;
            return rest;
          });
        if (fresh.length) await db.auditEvents.bulkAdd(fresh as never[]);
        result.inserted[t] = fresh.length;
        result.skipped[t] = rows.length - fresh.length;
        continue;
      }
      const ids = rows.map(recordId) as string[];
      const existing = await table.bulkGet(ids);
      const toInsert: unknown[] = [];
      const toReplace: unknown[] = [];
      rows.forEach((row, i) => {
        if (!existing[i]) toInsert.push(row);
        else toReplace.push(row);
      });
      // Clinical references/protocols are versioned & immutable: never replace an existing version.
      const replaceAllowed = strategy === 'replace-existing' && t !== 'referenceDatasets' && t !== 'fluidProtocols';
      if (t === 'patients') {
        // Avoid unique-code collisions with different local patients.
        for (const p of toInsert as Patient[]) {
          if ((await db.patients.where('code').equals(p.code).count()) > 0) p.code = generatePatientCode();
        }
      }
      if (t === 'referenceDatasets' || t === 'fluidProtocols') {
        for (const r of toInsert as { origin: string }[]) r.origin = 'imported';
      }
      if (toInsert.length) await table.bulkAdd(toInsert);
      if (replaceAllowed && toReplace.length) await table.bulkPut(toReplace);
      result.inserted[t] = toInsert.length;
      result.replaced[t] = replaceAllowed ? toReplace.length : 0;
      result.skipped[t] = replaceAllowed ? 0 : toReplace.length;
    }
    const sum = (o: ImportResult['inserted']) => Object.values(o).reduce((a, b) => a + (b ?? 0), 0);
    await audit('restore', 'backup', analysis.backup!.exportedAt, `strategy=${strategy};inserted=${sum(result.inserted)};replaced=${sum(result.replaced)};skipped=${sum(result.skipped)}`);
  });
  return result;
}

/** Deletes ALL application data (used by Settings → Data management). Templates are re-seeded afterwards. */
export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear();
  });
}
