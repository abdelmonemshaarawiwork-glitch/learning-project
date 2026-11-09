import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileUp, KeyRound, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Checkbox, Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { db } from '@/database/db';
import {
  analyseBackup,
  applyBackup,
  BACKUP_TABLES,
  buildBackup,
  decryptBackup,
  encryptBackup,
  MIN_PASSWORD_LENGTH,
  parseBackupText,
  type BackupAnalysis,
  type EncryptedBackupFile,
  type ImportResult,
  type ImportStrategy,
} from '@/database/backup';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import { downloadBlob } from '@/utils/download';
import { nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { cn } from '@/utils/cn';

const TABLE_LABEL: Record<string, string> = {
  patients: 'Patients',
  assessments: 'Assessments',
  assessmentRegions: 'Assessment regions',
  fluidCalculations: 'Fluid calculations',
  intakeRecords: 'Intake records',
  outputRecords: 'Output records',
  clinicalObservations: 'Observations',
  timelineEvents: 'Timeline events',
  fluidProtocols: 'Fluid protocols',
  referenceDatasets: 'Reference datasets',
  settings: 'Settings',
  auditEvents: 'Audit events',
  clinicalPhotos: 'Clinical photos',
};

export function BackupTab() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ExportCard />
      <RestoreCard />
    </div>
  );
}

function ExportCard() {
  const f = useFormatters();
  const { settings, update } = useSettings();
  const patients = useLiveQuery(() => db.patients.toArray(), []);
  const [scope, setScope] = useState<'all' | 'patients'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [encrypt, setEncrypt] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const pwOk = !encrypt || (password.length >= MIN_PASSWORD_LENGTH && password === confirm);
  const canExport = pwOk && (scope === 'all' || selected.length > 0) && !busy;

  async function exportNow() {
    setBusy(true);
    try {
      const backup = await buildBackup(scope === 'all' ? { scope: 'all', includePhotos } : { scope: 'patients', patientIds: selected, includePhotos });
      const payload = encrypt ? await encryptBackup(backup, password) : backup;
      const stamp = nowIso().slice(0, 16).replace(/[:T]/g, '');
      await downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `burnmatrix-backup-${scope}-${stamp}${encrypt ? '.encrypted' : ''}.json`);
      if (scope === 'all') await update('lastBackupAt', nowIso());
      setPassword('');
      setConfirm('');
      toast.success('Backup file created.', { description: encrypt ? 'Encrypted with your password (not stored).' : 'Unencrypted: it contains readable patient data. Store it securely.' });
    } catch (e) {
      toast.error('Backup failed.', { description: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Last full backup: <strong className="text-foreground">{settings.lastBackupAt ? f.dateTime(settings.lastBackupAt) : 'never'}</strong>. Data stored in this browser is not
          backed up automatically and is not synchronised to other devices.
        </p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Remind me on the dashboard when the last full backup is older than
          <select
            aria-label="Backup reminder"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            value={settings.backupReminderDays ?? 'off'}
            onChange={(e) => void update('backupReminderDays', e.target.value === 'off' ? null : Number(e.target.value))}
          >
            <option value="off">never (reminder off)</option>
            {[1, 3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Backup scope">
          {(['all', 'patients'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scope === s}
              onClick={() => setScope(s)}
              className={cn('rounded-xl border px-3 py-2 text-sm', scope === s && 'border-primary bg-accent')}
            >
              {s === 'all' ? 'All application data' : 'Selected patients'}
            </button>
          ))}
        </div>
        {scope === 'patients' && (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2">
            {(patients ?? []).length === 0 && <p className="p-2 text-sm text-muted-foreground">No patients.</p>}
            {(patients ?? []).map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{p.code}</span>
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} data-testid="backup-include-photos" />
          Include clinical photographs (larger file; photos are identifiable data)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} data-testid="encrypt-backup" />
          <KeyRound className="size-4" /> Encrypt the backup file with a password (AES-GCM 256, PBKDF2-SHA-256)
        </label>
        {encrypt && (
          <div className="space-y-3 rounded-xl border p-3">
            <Alert variant="warning">The password is never stored. If you forget it, the backup cannot be decrypted by anyone, including you.</Alert>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`} htmlFor="bk-pw" error={password && password.length < MIN_PASSWORD_LENGTH ? 'Too short' : undefined}>
                <Input id="bk-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label="Confirm password" htmlFor="bk-pw2" error={confirm && confirm !== password ? 'Passwords do not match' : undefined}>
                <Input id="bk-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
        {!encrypt && <p className="text-xs text-muted-foreground">Unencrypted backups are readable JSON. The local database itself is not encrypted by this application.</p>}
        <Button onClick={() => void exportNow()} disabled={!canExport} data-testid="export-backup">
          <Download /> {busy ? 'Preparing…' : 'Export backup'}
        </Button>
      </CardContent>
    </Card>
  );
}

function RestoreCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [encrypted, setEncrypted] = useState<EncryptedBackupFile | null>(null);
  const [password, setPassword] = useState('');
  const [analysis, setAnalysis] = useState<BackupAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>('skip-existing');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEncrypted(null);
    setAnalysis(null);
    setError(null);
    setResult(null);
    setPassword('');
  };

  async function onFile(file: File) {
    reset();
    setFileName(file.name);
    if (file.size > 200 * 1024 * 1024) return setError('The file is larger than 200 MB and cannot be imported in the browser.');
    const parsed = parseBackupText(await file.text());
    if (parsed.kind === 'invalid') return setError(parsed.error);
    if (parsed.kind === 'encrypted') return setEncrypted(parsed.file);
    setAnalysis(await analyseBackup(parsed.data));
  }

  async function decrypt() {
    if (!encrypted) return;
    setBusy(true);
    setError(null);
    try {
      const plain = await decryptBackup(encrypted, password);
      setAnalysis(await analyseBackup(plain));
      setEncrypted(null);
      setPassword('');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const totalDuplicates = analysis ? Object.values(analysis.duplicates).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restore from backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          data-testid="restore-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = '';
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <FileUp /> Choose backup file…
        </Button>
        {fileName && <p className="text-xs text-muted-foreground">File: {fileName}</p>}
        {error && <Alert variant="danger" title="Cannot import">{error}</Alert>}

        {encrypted && (
          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm">This backup is encrypted. Enter its password to preview it.</p>
            <Field label="Backup password" htmlFor="rs-pw">
              <Input id="rs-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button onClick={() => void decrypt()} disabled={!password || busy}>
              <KeyRound /> {busy ? 'Decrypting…' : 'Decrypt'}
            </Button>
          </div>
        )}

        {analysis && analysis.backup && !result && (
          <div className="space-y-4" data-testid="restore-preview">
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p>
                Exported {analysis.backup.exportedAt} · app {analysis.backup.appVersion} · schema v{analysis.backup.schemaVersion} · scope: {analysis.backup.scope}
              </p>
              <p className={analysis.checksumOk ? 'text-success' : 'text-danger'}>{analysis.checksumOk ? 'Checksum verified.' : 'Checksum mismatch.'}</p>
            </div>
            {analysis.fatalErrors.map((e) => (
              <Alert key={e} variant="danger">
                {e}
              </Alert>
            ))}
            {analysis.warnings.map((w) => (
              <Alert key={w} variant="warning">
                {w}
              </Alert>
            ))}
            <Table>
              <THead>
                <TR>
                  <TH>Table</TH>
                  <TH className="text-right">Valid records</TH>
                  <TH className="text-right">Already on this device</TH>
                </TR>
              </THead>
              <TBody>
                {BACKUP_TABLES.filter((t) => analysis.counts[t] !== undefined).map((t) => (
                  <TR key={t}>
                    <TD>{TABLE_LABEL[t] ?? t}</TD>
                    <TD className="tabular text-right">{analysis.counts[t]}</TD>
                    <TD className="tabular text-right">{t === 'auditEvents' ? '—' : (analysis.duplicates[t] ?? 0)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {analysis.recordErrors.length > 0 && (
              <details className="rounded-xl border p-3 text-sm">
                <summary className="cursor-pointer font-medium text-danger">{analysis.recordErrors.length} record(s) with errors (will not be imported)</summary>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
                  {analysis.recordErrors.slice(0, 100).map((r, i) => (
                    <li key={i}>
                      {r.table}[{r.index}] {r.id ?? ''}: {r.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {analysis.compatible && (
              <>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-semibold">When a record already exists on this device ({totalDuplicates} found)</legend>
                  {(
                    [
                      ['skip-existing', 'Keep the local version (skip duplicates) — safest'],
                      ['replace-existing', 'Replace local records with the backup version (reference datasets and protocols are never replaced)'],
                      ['import-as-copies', 'Import patients as new copies with new IDs (relationships are remapped)'],
                    ] as const
                  ).map(([id, label]) => (
                    <label key={id} className="flex items-start gap-2 text-sm">
                      <input type="radio" name="strategy" className="mt-1 accent-[var(--primary)]" checked={strategy === id} onChange={() => setStrategy(id)} />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <Button onClick={() => setConfirmOpen(true)} data-testid="restore-import">
                  <Upload /> Import
                </Button>
              </>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-3" data-testid="restore-result">
            <Alert variant="success" title="Import complete">
              Records were imported in a single transaction.
            </Alert>
            <Table>
              <THead>
                <TR>
                  <TH>Table</TH>
                  <TH className="text-right">Inserted</TH>
                  <TH className="text-right">Replaced</TH>
                  <TH className="text-right">Skipped</TH>
                </TR>
              </THead>
              <TBody>
                {BACKUP_TABLES.filter((t) => result.inserted[t] !== undefined).map((t) => (
                  <TR key={t}>
                    <TD>{TABLE_LABEL[t] ?? t}</TD>
                    <TD className="tabular text-right">{result.inserted[t] ?? 0}</TD>
                    <TD className="tabular text-right">{result.replaced[t] ?? 0}</TD>
                    <TD className="tabular text-right">{result.skipped[t] ?? 0}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Button variant="outline" onClick={() => { reset(); setFileName(''); }}>
              Done
            </Button>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Import this backup?"
        destructive={strategy === 'replace-existing'}
        requireText={strategy === 'replace-existing' ? 'REPLACE' : undefined}
        confirmLabel="Import"
        description={
          strategy === 'replace-existing'
            ? 'Local records with the same ID will be OVERWRITTEN by the backup version. This cannot be undone. Consider exporting a backup of the current data first.'
            : strategy === 'import-as-copies'
              ? 'Patients from the backup are added as new patients with new IDs, even if they already exist.'
              : 'New records are added; existing local records are left unchanged.'
        }
        onConfirm={async () => {
          if (!analysis) return;
          try {
            setResult(await applyBackup(analysis, strategy));
            toast.success('Backup imported.');
          } catch (e) {
            toast.error('Import failed — no changes were made.', { description: describeError(e) });
          }
        }}
      />
    </Card>
  );
}
