import { CopyPlus, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfigStatusBadge } from '@/components/common/ClinicalNotices';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { DefinitionList } from '@/components/ui/stat';
import { createDatasetVersion, revokeDatasetVerification, setDatasetRetired, updateDatasetDraft, verifyDataset } from '@/database/repositories/references';
import { validateDatasetData } from '@/engines/integrity';
import type { PalmReferenceData, RegionalReferenceData } from '@/engines/tbsa/types';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useDatasetUsability, useReferenceDatasets } from '@/features/burn-assessment/service';
import { useFormatters } from '@/hooks/useFormatters';
import type { ReferenceDataset } from '@/types/domain';
import { cn } from '@/utils/cn';
import { describeError } from '@/utils/logger';
import { formatCompact, preciseSum } from '@/utils/rounding';
import { SourceList, VerificationDialog } from './VerificationDialog';

export function ReferencesTab() {
  const datasets = useReferenceDatasets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!datasets) return <LoadingState />;
  const list = datasets.filter((d) => d.kind !== 'urine-output-targets').sort((a, b) => a.key.localeCompare(b.key) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  const selected = list.find((d) => d.id === selectedId) ?? list[0] ?? null;
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-2">
        <Alert variant="info">
          Bundled datasets contain values transcribed from the cited publications and are shipped <strong>NOT CONFIGURED</strong>. A qualified clinician must verify them before any
          calculation is enabled.
        </Alert>
        {list.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSelectedId(d.id)}
            className={cn('w-full rounded-xl border bg-card p-3 text-left hover:bg-muted', selected?.id === d.id && 'border-primary ring-1 ring-primary')}
            data-testid={`dataset-${d.key}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{d.name}</p>
              <ConfigStatusBadge status={d.status} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">v{d.version}</p>
          </button>
        ))}
      </div>
      {selected && <DatasetDetail key={selected.id} ds={selected} onSelect={setSelectedId} />}
    </div>
  );
}

function DatasetDetail({ ds, onSelect }: { ds: ReferenceDataset; onSelect: (id: string) => void }) {
  const f = useFormatters();
  const usability = useDatasetUsability(ds);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const editable = ds.status === 'not-configured';
  const structural = validateDatasetData(ds);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {ds.name} <span className="font-mono text-sm font-normal text-muted-foreground">v{ds.version}</span> <ConfigStatusBadge status={ds.status} />
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {ds.id} · origin: {ds.origin}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ds.status === 'not-configured' && (
            <Button size="sm" onClick={() => setVerifyOpen(true)} disabled={structural.length > 0} data-testid="verify-dataset">
              <ShieldCheck /> Verify
            </Button>
          )}
          {ds.status === 'verified' && (
            <Button size="sm" variant="outline" onClick={() => setRevokeOpen(true)}>
              <ShieldOff /> Revoke verification
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setVersionOpen(true)}>
            <CopyPlus /> New version
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void setDatasetRetired(ds.id, ds.status !== 'retired')}>
            {ds.status === 'retired' ? 'Restore' : 'Retire'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {usability && !usability.usable && ds.status !== 'retired' && (
          <Alert variant="warning" title="Not usable for calculations">
            <ul className="list-disc pl-4">
              {usability.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Alert>
        )}
        {usability?.usable && <Alert variant="success">Integrity check passed: verified content hash matches.</Alert>}
        <DefinitionList
          items={[
            { label: 'Population', value: ds.population },
            { label: 'Applicable ages (years)', value: `${ds.ageRangeYears.min ?? 'none'} to ${ds.ageRangeYears.max === null ? 'no upper limit' : `<${ds.ageRangeYears.max}`}` },
            { label: 'Verified by', value: ds.verification ? `${ds.verification.verifiedBy} (${ds.verification.role})` : 'Not verified' },
            { label: 'Date of verification', value: ds.verification ? f.date(ds.verification.verificationDate) : '—' },
            { label: 'Verification recorded', value: ds.verification ? f.dateTime(ds.verification.recordedAt) : '—' },
            { label: 'Content hash (SHA-256)', value: ds.verification ? <span className="font-mono text-xs break-all">{ds.verification.contentHash}</span> : '—' },
          ]}
        />
        <div>
          <p className="mb-1 text-sm font-semibold">Source</p>
          <SourceList sources={ds.sources} />
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Transcription notes</p>
          <p className="text-sm text-muted-foreground">{ds.transcriptionNotes}</p>
        </div>
        {(ds.kind === 'lund-browder' || ds.kind === 'rule-of-nines') && <RegionalValues ds={ds} editable={editable} />}
        {ds.kind === 'palm' && <PalmValues ds={ds} editable={editable} />}
        {!editable && ds.status === 'verified' && <p className="text-xs text-muted-foreground">Verified data is locked. Create a new version to make changes.</p>}
      </CardContent>

      <VerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title={`Verify ${ds.name} v${ds.version}`}
        summary={
          <>
            <p className="font-medium">{ds.source}</p>
            <p className="mt-1 text-xs text-muted-foreground">{ds.transcriptionNotes}</p>
          </>
        }
        onVerify={async (v) => {
          await verifyDataset(ds.id, v);
        }}
      />
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Revoke verification?"
        description="Calculations using this dataset will be disabled until it is verified again. Saved assessments keep their stored results."
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          await revokeDatasetVerification(ds.id, 'revoked by user');
          toast('Verification revoked.');
        }}
      />
      <NewVersionDialog
        open={versionOpen}
        onOpenChange={setVersionOpen}
        current={ds.version}
        onCreate={async (v) => {
          const copy = await createDatasetVersion(ds.id, v);
          onSelect(copy.id);
        }}
      />
    </Card>
  );
}

export function NewVersionDialog({ open, onOpenChange, current, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; current: string; onCreate: (v: string) => Promise<void> }) {
  const [version, setVersion] = useState('');
  const valid = /^\d+\.\d+\.\d+$/.test(version) && version !== current;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Create new version" description="Copies this configuration into a new, editable, NOT CONFIGURED version. Existing records keep referencing their original version." size="sm">
        <Field label="New version number" htmlFor="nv" hint={`Current: ${current}. Use semantic versioning, e.g. 1.0.1.`}>
          <Input id="nv" value={version} onChange={(e) => setVersion(e.target.value.trim())} placeholder="1.0.1" />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={async () => {
              try {
                await onCreate(version);
                toast.success(`Version ${version} created.`);
                onOpenChange(false);
              } catch (e) {
                toast.error('Could not create the version.', { description: describeError(e) });
              }
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ValueInput({ value, editable, onCommit, label }: { value: number; editable: boolean; onCommit: (n: number) => void; label: string }) {
  if (!editable) return <span className="tabular">{formatCompact(value, 3)}</span>;
  return (
    <Input
      aria-label={label}
      defaultValue={String(value)}
      inputMode="decimal"
      className="h-8 w-20 text-right"
      onBlur={(e) => {
        const n = parseNumberInput(e.target.value);
        if (Number.isFinite(n) && n !== value) onCommit(n);
        else e.target.value = String(value);
      }}
    />
  );
}

function RegionalValues({ ds, editable }: { ds: ReferenceDataset; editable: boolean }) {
  const data = ds.data as RegionalReferenceData;
  const commit = async (rowIdx: number, colId: string, n: number) => {
    const next = structuredClone(data);
    next.regions[rowIdx]!.percentByColumn[colId] = n;
    try {
      await updateDatasetDraft(ds.id, { data: next });
    } catch (e) {
      toast.error('Could not update value.', { description: describeError(e) });
    }
  };
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">Values (% TBSA of the whole region surface)</p>
      <p className="mb-2 text-xs text-muted-foreground">{data.columnSelectionNote}</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="dataset-values">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Region</th>
              <th className="px-3 py-2 text-left">Surface</th>
              {data.columns.map((c) => (
                <th key={c.id} className="px-3 py-2 text-right whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.regions.map((r, i) => (
              <tr key={`${r.id}:${r.surface}`} className="border-t">
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.surface}</td>
                {data.columns.map((c) => (
                  <td key={c.id} className="px-3 py-1 text-right">
                    <ValueInput value={r.percentByColumn[c.id] ?? Number.NaN} editable={editable} label={`${r.label} ${r.surface} ${c.label}`} onCommit={(n) => void commit(i, c.id, n)} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 bg-muted/60 font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Column total (must be 100)
              </td>
              {data.columns.map((c) => {
                const sum = preciseSum(data.regions.map((r) => r.percentByColumn[c.id] ?? 0));
                const ok = Math.abs(sum - 100) < 1e-6;
                return (
                  <td key={c.id} className={cn('tabular px-3 py-2 text-right', ok ? 'text-success' : 'text-danger')}>
                    {formatCompact(sum, 3)} {ok ? '✓' : '✗'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PalmValues({ ds, editable }: { ds: ReferenceDataset; editable: boolean }) {
  const data = ds.data as PalmReferenceData;
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">Reference options</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Option</th>
              <th className="px-3 py-2 text-left">Population</th>
              <th className="px-3 py-2 text-right">% TBSA per palm</th>
            </tr>
          </thead>
          <tbody>
            {data.options.map((o, i) => (
              <tr key={o.id} className="border-t">
                <td className="px-3 py-1.5">{o.label}</td>
                <td className="px-3 py-1.5 text-xs">{o.population}</td>
                <td className="px-3 py-1 text-right">
                  <ValueInput
                    value={o.percent}
                    editable={editable}
                    label={o.label}
                    onCommit={async (n) => {
                      const next = structuredClone(data);
                      next.options[i]!.percent = n;
                      await updateDatasetDraft(ds.id, { data: next });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 mb-1 text-sm font-semibold">Limitations</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {data.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <Badge className="mt-3">The clinician still enters the palm value used for each assessment.</Badge>
    </div>
  );
}
