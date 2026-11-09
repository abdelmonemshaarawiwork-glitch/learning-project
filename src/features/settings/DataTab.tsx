import { useLiveQuery } from 'dexie-react-hooks';
import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { db, ALL_TABLES } from '@/database/db';
import { wipeAllData } from '@/database/backup';
import { ensureBundledTemplates, requestPersistentStorage } from '@/database/bootstrap';
import { listAuditEvents } from '@/database/repositories/audit';
import { useFormatters } from '@/hooks/useFormatters';
import { useAssessmentDraft } from '@/stores/assessmentDraft';
import { useUiStore } from '@/stores/ui';
import { describeError } from '@/utils/logger';

function bytes(n: number | undefined) {
  if (n === undefined) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function DataTab() {
  const f = useFormatters();
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const counts = useLiveQuery(async () => Object.fromEntries(await Promise.all(ALL_TABLES.map(async (t) => [t, await db.table(t).count()] as const))), []);
  const audit = useLiveQuery(() => listAuditEvents(100), []);

  useEffect(() => {
    void navigator.storage?.estimate?.().then(setEstimate).catch(() => setEstimate(null));
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4" /> Local storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Used: <strong>{bytes(estimate?.usage)}</strong> of approximately {bytes(estimate?.quota)} available to this site.
          </p>
          <p>
            Persistent storage:{' '}
            <strong>{persisted === null ? 'unknown' : persisted ? 'granted (the browser will not evict data automatically)' : 'not granted (the browser may evict data under storage pressure)'}</strong>
          </p>
          {!persisted && (
            <Button size="sm" variant="outline" onClick={async () => setPersisted(await requestPersistentStorage())}>
              Request persistent storage
            </Button>
          )}
          <Alert variant="info">IndexedDB data is not encrypted by this application. Clearing site data or uninstalling the app removes it permanently unless you have a backup.</Alert>
          <Table>
            <THead>
              <TR>
                <TH>Table</TH>
                <TH className="text-right">Records</TH>
              </TR>
            </THead>
            <TBody>
              {ALL_TABLES.map((t) => (
                <TR key={t}>
                  <TD className="font-mono text-xs">{t}</TD>
                  <TD className="tabular text-right">{counts?.[t] ?? '…'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { added } = await ensureBundledTemplates();
              toast(added.length ? `Restored ${added.length} missing template(s).` : 'All bundled templates are present.');
            }}
          >
            <RefreshCw /> Restore missing reference templates
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete all data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently deletes every patient, record, verification, setting and audit entry stored by BurnMatrix in this browser. Bundled reference templates are re-added as NOT
            CONFIGURED.
          </p>
          <Button variant="destructive" onClick={() => setWipeOpen(true)} data-testid="wipe-all">
            <Trash2 /> Delete all data…
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Audit log (latest 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">The audit log stores actions and record identifiers only — never names or clinical notes.</p>
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
                <TH>Details</TH>
              </TR>
            </THead>
            <TBody>
              {(audit ?? []).map((a) => (
                <TR key={a.id}>
                  <TD className="text-xs whitespace-nowrap">{f.dateTime(a.timestamp)}</TD>
                  <TD className="text-xs">{a.action}</TD>
                  <TD className="font-mono text-xs">
                    {a.entityType}:{a.entityId.slice(0, 8)}
                  </TD>
                  <TD className="max-w-md truncate font-mono text-xs text-muted-foreground">{a.details}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="Delete ALL data on this device?"
        destructive
        requireText="DELETE ALL DATA"
        confirmLabel="Delete everything"
        description="This cannot be undone. Export a full backup first if you may need any of the data."
        consequences={['All patients and their clinical records', 'All clinical reference verifications and protocol configurations', 'All settings and the audit log']}
        onConfirm={async () => {
          try {
            await wipeAllData();
            await ensureBundledTemplates();
            await useAssessmentDraft.getState().discard();
            useUiStore.getState().setActivePatientId(null);
            toast.success('All data deleted.');
          } catch (e) {
            toast.error('Delete failed.', { description: describeError(e) });
          }
        }}
      />
    </div>
  );
}
