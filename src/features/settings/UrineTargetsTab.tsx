import { Plus, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfigStatusBadge } from '@/components/common/ClinicalNotices';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { createDatasetVersion, revokeDatasetVerification, updateDatasetDraft, verifyDataset } from '@/database/repositories/references';
import { validateUrineTargetData } from '@/engines/integrity';
import type { UrineOutputTarget, UrineOutputTargetData } from '@/engines/tbsa/types';
import { describeTarget } from '@/engines/urine-output';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useDatasetUsability, useReferenceDatasets } from '@/features/burn-assessment/service';
import { newId } from '@/utils/ids';
import { describeError } from '@/utils/logger';
import { NewVersionDialog } from './ReferencesTab';
import { VerificationDialog } from './VerificationDialog';

const numOrNull = (s: string) => (s.trim() === '' ? null : parseNumberInput(s));

export function UrineTargetsTab() {
  const datasets = useReferenceDatasets();
  const list = (datasets ?? []).filter((d) => d.kind === 'urine-output-targets').sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  const ds = list.find((d) => d.status !== 'retired') ?? null;
  const usability = useDatasetUsability(ds);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  if (!datasets) return <LoadingState />;
  if (!ds) return <Alert variant="warning">No urine-output target dataset found.</Alert>;
  const data = ds.data as UrineOutputTargetData;
  const editable = ds.status === 'not-configured';
  const problems = validateUrineTargetData(data);

  const saveTargets = async (targets: UrineOutputTarget[]) => {
    try {
      await updateDatasetDraft(ds.id, { data: { targets } });
    } catch (e) {
      toast.error('Could not save.', { description: describeError(e) });
    }
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {ds.name} <span className="font-mono text-sm font-normal text-muted-foreground">v{ds.version}</span> <ConfigStatusBadge status={ds.status} />
          </CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{ds.transcriptionNotes}</p>
        </div>
        <div className="flex gap-2">
          {editable && (
            <Button size="sm" disabled={problems.length > 0 || !ds.source.trim() || ds.source.startsWith('Not configured')} onClick={() => setVerifyOpen(true)}>
              <ShieldCheck /> Verify
            </Button>
          )}
          {ds.status === 'verified' && (
            <>
              <Button size="sm" variant="outline" onClick={() => void revokeDatasetVerification(ds.id, 'user')}>
                <ShieldOff /> Revoke
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVersionOpen(true)}>
                New version
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="info">
          No urine-output target is provided by the application. Until a verified, age-specific target exists, calculated rates are shown without any normal/abnormal label.
        </Alert>
        {usability?.usable && <Alert variant="success">Targets verified — calculated rates are labelled against the matching target.</Alert>}
        <Field label="Clinical reference for these targets (required)" htmlFor="ut-src">
          <Textarea
            id="ut-src"
            rows={2}
            disabled={!editable}
            defaultValue={ds.source.startsWith('Not configured') ? '' : ds.source}
            placeholder="e.g. Institutional burns resuscitation protocol, version, section"
            onBlur={(e) => editable && void updateDatasetDraft(ds.id, { source: e.target.value.trim() || 'Not configured — enter the institutional protocol or guideline used.', sources: e.target.value.trim() ? [{ citation: e.target.value.trim() }] : [] })}
          />
        </Field>
        <div className="space-y-3">
          {data.targets.length === 0 && <p className="rounded-lg bg-muted px-3 py-4 text-center text-sm text-muted-foreground">No targets defined.</p>}
          {data.targets.map((t, i) => (
            <TargetRow
              key={t.id}
              target={t}
              editable={editable}
              onChange={(nt) => void saveTargets(data.targets.map((x, k) => (k === i ? nt : x)))}
              onRemove={() => void saveTargets(data.targets.filter((_, k) => k !== i))}
            />
          ))}
          {editable && (
            <Button
              variant="outline"
              onClick={() =>
                void saveTargets([
                  ...data.targets,
                  { id: newId(), label: `Target ${data.targets.length + 1}`, ageMinYears: null, ageMaxYearsExclusive: null, weightMinKg: null, weightMaxKgExclusive: null, minMlPerKgPerHour: null, maxMlPerKgPerHour: null, notes: '' },
                ])
              }
            >
              <Plus /> Add target
            </Button>
          )}
        </div>
        {problems.length > 0 && (
          <Alert variant="warning" title="Cannot be verified yet">
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        )}
      </CardContent>
      <VerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verify urine-output targets"
        summary={
          <ul className="list-disc pl-4">
            <li>Source: {ds.source}</li>
            {data.targets.map((t) => (
              <li key={t.id}>{describeTarget(t)}</li>
            ))}
          </ul>
        }
        onVerify={async (v) => {
          await verifyDataset(ds.id, v);
        }}
      />
      <NewVersionDialog open={versionOpen} onOpenChange={setVersionOpen} current={ds.version} onCreate={async (v) => void (await createDatasetVersion(ds.id, v))} />
    </Card>
  );
}

function TargetRow({ target, editable, onChange, onRemove }: { target: UrineOutputTarget; editable: boolean; onChange: (t: UrineOutputTarget) => void; onRemove: () => void }) {
  const field = (key: keyof UrineOutputTarget, label: string) => (
    <Field label={label} htmlFor={`${target.id}-${key}`}>
      <Input
        id={`${target.id}-${key}`}
        inputMode="decimal"
        disabled={!editable}
        defaultValue={target[key] === null ? '' : String(target[key])}
        onBlur={(e) => {
          const n = numOrNull(e.target.value);
          if (n === null || Number.isFinite(n)) onChange({ ...target, [key]: n });
        }}
      />
    </Field>
  );
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-3 flex items-end gap-2">
        <Field label="Label (age category)" htmlFor={`${target.id}-label`} className="flex-1">
          <Input id={`${target.id}-label`} disabled={!editable} defaultValue={target.label} onBlur={(e) => onChange({ ...target, label: e.target.value })} />
        </Field>
        {editable && (
          <Button variant="ghost" size="icon" aria-label="Remove target" onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {field('ageMinYears', 'Age from (y, incl.)')}
        {field('ageMaxYearsExclusive', 'Age to (y, excl.)')}
        {field('weightMinKg', 'Weight from (kg)')}
        {field('weightMaxKgExclusive', 'Weight to (kg, excl.)')}
        {field('minMlPerKgPerHour', 'Min mL/kg/h')}
        {field('maxMlPerKgPerHour', 'Max mL/kg/h')}
      </div>
    </div>
  );
}
