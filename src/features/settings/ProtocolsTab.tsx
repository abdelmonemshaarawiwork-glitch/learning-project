import { CopyPlus, Plus, Save, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfigStatusBadge } from '@/components/common/ClinicalNotices';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { DefinitionList } from '@/components/ui/stat';
import { INTAKE_CATEGORIES } from '@/constants/clinical';
import { createProtocolVersion, revokeProtocolVerification, setProtocolRetired, updateProtocolDraft, verifyProtocol } from '@/database/repositories/references';
import { validateProtocolParameters } from '@/engines/integrity';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useFluidProtocols, useProtocolUsability } from '@/features/burn-assessment/service';
import { useFormatters } from '@/hooks/useFormatters';
import type { FluidProtocol, FluidProtocolParameters, IntakeCategory } from '@/types/domain';
import { cn } from '@/utils/cn';
import { newId } from '@/utils/ids';
import { describeError } from '@/utils/logger';
import { formatCompact } from '@/utils/rounding';
import { NewVersionDialog } from './ReferencesTab';
import { SourceList, VerificationDialog } from './VerificationDialog';

export function ProtocolsTab() {
  const protocols = useFluidProtocols();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  if (!protocols) return <LoadingState />;
  const list = [...protocols].sort((a, b) => a.name.localeCompare(b.name) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  const selected = list.find((p) => p.id === selectedId) ?? list[0] ?? null;
  const blank = protocols.find((p) => p.key === 'institutional-protocol');
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-2">
        <Alert variant="info">Protocols are calculation templates only. They never generate orders or pump settings. Unverified protocols cannot be used.</Alert>
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className={cn('w-full rounded-xl border bg-card p-3 text-left hover:bg-muted', selected?.id === p.id && 'border-primary ring-1 ring-primary')}
            data-testid={`protocol-${p.key}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{p.name}</p>
              <ConfigStatusBadge status={p.status} />
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">v{p.version}</p>
          </button>
        ))}
        {blank && (
          <Button variant="outline" className="w-full" onClick={() => setCreateOpen(true)}>
            <Plus /> New institution-defined protocol
          </Button>
        )}
      </div>
      {selected && <ProtocolDetail key={`${selected.id}-${selected.updatedAt}`} p={selected} onSelect={setSelectedId} />}
      {blank && (
        <CreateProtocolDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={async (name) => {
            const p = await createProtocolVersion(blank.id, '1.0.0', { name });
            setSelectedId(p.id);
          }}
        />
      )}
    </div>
  );
}

function CreateProtocolDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New institution-defined protocol" size="sm" description="Creates an empty, NOT CONFIGURED protocol. Enter every parameter from your local protocol document.">
        <Field label="Protocol name" htmlFor="np-name">
          <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              try {
                await onCreate(name.trim());
                onOpenChange(false);
              } catch (e) {
                toast.error('Could not create protocol.', { description: describeError(e) });
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

function ProtocolDetail({ p, onSelect }: { p: FluidProtocol; onSelect: (id: string) => void }) {
  const f = useFormatters();
  const usability = useProtocolUsability(p);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const editable = p.status === 'not-configured';
  const problems = validateProtocolParameters(p.parameters);
  const params = p.parameters;
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {p.name} <span className="font-mono text-sm font-normal text-muted-foreground">v{p.version}</span> <ConfigStatusBadge status={p.status} />
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.id} · origin: {p.origin}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === 'not-configured' && (
            <Button size="sm" onClick={() => setVerifyOpen(true)} disabled={problems.length > 0} data-testid="verify-protocol">
              <ShieldCheck /> Verify
            </Button>
          )}
          {p.status === 'verified' && (
            <Button size="sm" variant="outline" onClick={() => setRevokeOpen(true)}>
              <ShieldOff /> Revoke verification
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setVersionOpen(true)}>
            <CopyPlus /> New version
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void setProtocolRetired(p.id, p.status !== 'retired')}>
            {p.status === 'retired' ? 'Restore' : 'Retire'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {usability && !usability.usable && p.status !== 'retired' && (
          <Alert variant="warning" title="Not usable for calculations">
            <ul className="list-disc pl-4">
              {usability.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Alert>
        )}
        {usability?.usable && <Alert variant="success">Verified; integrity check passed.</Alert>}
        <p className="text-sm">{p.description}</p>
        {params.mlPerKgPerPercentTbsa !== null && (
          <p className="rounded-lg bg-muted px-3 py-2 font-mono text-sm">
            Estimated volume = {formatCompact(params.mlPerKgPerPercentTbsa, 3)} mL × weight (kg) × %TBSA, over {params.periodHours ?? '?'} h from {params.timeReference === 'injury' ? 'time of injury' : 'start of resuscitation'}
          </p>
        )}
        <DefinitionList
          items={[
            { label: 'Population', value: p.population },
            { label: 'Fluid', value: params.fluidDescription },
            { label: 'Phases', value: params.phases.map((ph) => `${ph.label}: ${formatCompact(ph.fractionOfTotal * 100, 2)}% (h ${ph.startHour}–${ph.endHour})`).join('\n') || 'None' },
            { label: 'Counted as administered', value: params.countedIntakeCategories.join(', ') },
            { label: 'Applicability notes', value: params.applicabilityNotes },
            { label: 'Verified by', value: p.verification ? `${p.verification.verifiedBy} (${p.verification.role}), ${f.date(p.verification.verificationDate)}` : 'Not verified' },
          ]}
        />
        <div>
          <p className="mb-1 text-sm font-semibold">Source</p>
          <SourceList sources={p.sources.length ? p.sources : [{ citation: p.source }]} />
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Transcription notes</p>
          <p className="text-sm text-muted-foreground">{p.transcriptionNotes}</p>
        </div>
        {editable ? <ProtocolEditor p={p} /> : <p className="text-xs text-muted-foreground">{p.status === 'verified' ? 'Verified parameters are locked. Create a new version to change them.' : ''}</p>}
      </CardContent>
      <VerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title={`Verify ${p.name} v${p.version}`}
        summary={
          <>
            <p className="font-medium">{p.source}</p>
            <p className="mt-1 font-mono text-xs">
              {formatCompact(params.mlPerKgPerPercentTbsa, 3)} mL/kg/%TBSA · {params.periodHours} h · from {params.timeReference} · phases {params.phases.map((x) => `${x.label} ${formatCompact(x.fractionOfTotal * 100, 1)}%`).join(', ')}
            </p>
          </>
        }
        onVerify={async (v) => {
          await verifyProtocol(p.id, v);
        }}
      />
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="Revoke verification?"
        description="Fluid calculations with this protocol will be disabled until it is verified again. Saved snapshots are kept."
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          await revokeProtocolVerification(p.id);
        }}
      />
      <NewVersionDialog
        open={versionOpen}
        onOpenChange={setVersionOpen}
        current={p.version}
        onCreate={async (v) => {
          const copy = await createProtocolVersion(p.id, v);
          onSelect(copy.id);
        }}
      />
    </Card>
  );
}

function ProtocolEditor({ p }: { p: FluidProtocol }) {
  const [meta, setMeta] = useState({ name: p.name, description: p.description, source: p.source, population: p.population, transcriptionNotes: p.transcriptionNotes });
  const [params, setParams] = useState<FluidProtocolParameters>(structuredClone(p.parameters));
  const [coef, setCoef] = useState(params.mlPerKgPerPercentTbsa === null ? '' : String(params.mlPerKgPerPercentTbsa));
  const [period, setPeriod] = useState(params.periodHours === null ? '' : String(params.periodHours));
  const next: FluidProtocolParameters = {
    ...params,
    mlPerKgPerPercentTbsa: Number.isFinite(parseNumberInput(coef)) ? parseNumberInput(coef) : null,
    periodHours: Number.isFinite(parseNumberInput(period)) ? parseNumberInput(period) : null,
  };
  const problems = validateProtocolParameters(next);
  const phasesComplete = next.phases.every(
    (ph) => Number.isFinite(ph.startHour) && ph.startHour >= 0 && Number.isFinite(ph.endHour) && ph.endHour > 0 && Number.isFinite(ph.fractionOfTotal) && ph.fractionOfTotal > 0 && ph.fractionOfTotal <= 1,
  );
  const setPhase = (i: number, changes: Partial<FluidProtocolParameters['phases'][number]>) =>
    setParams({ ...params, phases: params.phases.map((ph, k) => (k === i ? { ...ph, ...changes } : ph)) });

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm font-semibold">Edit draft (not verified)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="pe-name">
          <Input id="pe-name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
        </Field>
        <Field label="Population / applicability" htmlFor="pe-pop">
          <Input id="pe-pop" value={meta.population} onChange={(e) => setMeta({ ...meta, population: e.target.value })} />
        </Field>
        <Field label="Source / reference (required)" htmlFor="pe-src" className="sm:col-span-2">
          <Textarea id="pe-src" rows={2} value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="pe-desc" className="sm:col-span-2">
          <Textarea id="pe-desc" rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
        </Field>
        <Field label="Volume coefficient (mL/kg/%TBSA)" htmlFor="pe-coef">
          <Input id="pe-coef" inputMode="decimal" value={coef} onChange={(e) => setCoef(e.target.value)} />
        </Field>
        <Field label="Estimation period (h)" htmlFor="pe-period">
          <Input id="pe-period" inputMode="decimal" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Field label="Time reference" htmlFor="pe-ref">
          <Select id="pe-ref" value={params.timeReference} onChange={(e) => setParams({ ...params, timeReference: e.target.value as FluidProtocolParameters['timeReference'] })}>
            <option value="injury">Time of injury</option>
            <option value="resuscitation-start">Start of resuscitation</option>
          </Select>
        </Field>
        <Field label="Fluid description" htmlFor="pe-fluid">
          <Input id="pe-fluid" value={params.fluidDescription} onChange={(e) => setParams({ ...params, fluidDescription: e.target.value })} />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Phases</p>
        {params.phases.map((ph, i) => (
          <div key={ph.id} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_90px_110px_auto]">
            <Input aria-label="Phase label" value={ph.label} onChange={(e) => setPhase(i, { label: e.target.value })} />
            <Input aria-label="Start hour" inputMode="decimal" defaultValue={ph.startHour} onBlur={(e) => setPhase(i, { startHour: parseNumberInput(e.target.value) })} />
            <Input aria-label="End hour" inputMode="decimal" defaultValue={ph.endHour} onBlur={(e) => setPhase(i, { endHour: parseNumberInput(e.target.value) })} />
            <Input aria-label="Fraction of total (0–1)" inputMode="decimal" defaultValue={ph.fractionOfTotal} onBlur={(e) => setPhase(i, { fractionOfTotal: parseNumberInput(e.target.value) })} />
            <Button variant="ghost" size="icon" aria-label="Remove phase" onClick={() => setParams({ ...params, phases: params.phases.filter((_, k) => k !== i) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <p className="mb-2 text-xs text-muted-foreground">Columns: label · start hour · end hour · fraction of total (0–1). Phases must be contiguous from hour 0 and fractions must sum to 1.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const last = params.phases.at(-1);
            setParams({ ...params, phases: [...params.phases, { id: newId(), label: `Phase ${params.phases.length + 1}`, startHour: last?.endHour ?? 0, endHour: Number.NaN, fractionOfTotal: Number.NaN }] });
          }}
        >
          <Plus /> Add phase
        </Button>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Intake categories counted as administered</p>
        <div className="flex flex-wrap gap-3">
          {INTAKE_CATEGORIES.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={params.countedIntakeCategories.includes(c.id)}
                onChange={(e) =>
                  setParams({
                    ...params,
                    countedIntakeCategories: e.target.checked ? [...params.countedIntakeCategories, c.id] : params.countedIntakeCategories.filter((x: IntakeCategory) => x !== c.id),
                  })
                }
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      <Field label="Applicability notes" htmlFor="pe-notes">
        <Textarea id="pe-notes" rows={2} value={params.applicabilityNotes} onChange={(e) => setParams({ ...params, applicabilityNotes: e.target.value })} />
      </Field>
      {problems.length > 0 && (
        <Alert variant="warning" title="Incomplete — cannot be verified yet">
          <ul className="list-disc pl-4">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!phasesComplete && <p className="text-xs text-danger">Each phase needs a start hour ≥ 0, an end hour &gt; 0 and a fraction between 0 and 1 before the draft can be saved.</p>}
      <Button
        disabled={!phasesComplete}
        onClick={async () => {
          try {
            await updateProtocolDraft(p.id, {
              ...meta,
              sources: meta.source.trim() && !meta.source.startsWith('Not configured') ? (p.sources.length ? p.sources : [{ citation: meta.source }]) : p.sources,
              parameters: next,
            });
            toast.success('Draft saved.');
          } catch (e) {
            toast.error('Could not save the draft.', { description: describeError(e) });
          }
        }}
      >
        <Save /> Save draft
      </Button>
    </div>
  );
}
