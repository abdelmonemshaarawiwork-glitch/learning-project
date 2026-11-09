import { ArrowLeft, ArrowRight, Check, ClipboardList, Droplets, FileDown, History, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ConfigStatusBadge, ConfigureLink, DisclaimerNote } from '@/components/common/ClinicalNotices';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, patientAgeYears, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { ASSESSMENT_METHODS, METHOD_LABEL } from '@/constants/clinical';
import { saveAssessment } from '@/database/repositories/assessments';
import { defaultAgeColumn, type PalmReferenceData, type RegionalReferenceData, type TbsaSuccess } from '@/engines/tbsa';
import { BodyMap2D } from '@/features/body-mapping/BodyMap2D';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import { useAssessmentDraft, type AssessmentDraft } from '@/stores/assessmentDraft';
import type { Assessment, AssessmentMethod, Patient, ReferenceDataset } from '@/types/domain';
import { cn } from '@/utils/cn';
import { nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { formatCompact } from '@/utils/rounding';
import { draftDepthMap, RegionMappingPanel } from './components/RegionMappingPanel';
import { parseNumberInput } from './components/RegionEditors';
import { BreakdownTable, CalculationSteps, IssuesPanel, TbsaTotalsPanel } from './components/TbsaSummary';
import { usePatientAssessments } from './queries';
import {
  buildAssessmentPayload,
  computeDraftResult,
  datasetsForMethod,
  limitationIssues,
  palmReferenceText,
  useDatasetUsability,
  useReferenceDatasets,
} from './service';

const STEPS = [
  { label: 'Patient', steps: '1' },
  { label: 'Date & time', steps: '2' },
  { label: 'Method', steps: '3' },
  { label: 'Regions, depth & involvement', steps: '4–6' },
  { label: 'Review TBSA & warnings', steps: '7–8' },
  { label: 'Save & report', steps: '9–10' },
];

export function defaultDraftFor(patient: Patient, method: AssessmentMethod, datasets: ReferenceDataset[] | undefined): Omit<AssessmentDraft, 'updatedAt'> {
  const assessmentDate = nowIso();
  const ds = method === 'palm' ? null : (datasetsForMethod(datasets, method)[0] ?? null);
  const age = patientAgeYears(patient, assessmentDate).age;
  const column = ds ? defaultAgeColumn((ds.data as RegionalReferenceData).columns, age) : null;
  return {
    patientId: patient.id,
    assessmentDate,
    assessor: '',
    method,
    datasetId: ds?.id ?? null,
    columnId: column?.id ?? null,
    columnOverridden: false,
    palmPercent: null,
    palmReference: null,
    regionalEntries: [],
    palmEntries: [],
    notes: '',
    limitationAcknowledged: false,
    amendsAssessmentId: null,
    step: 1,
  };
}

export async function downloadAssessmentPdf(assessmentId: string, print = false) {
  try {
    const { runReport } = await import('@/features/reports/pdf/runReport');
    await runReport({ type: 'assessment', assessmentId }, print ? 'print' : 'download');
  } catch (e) {
    toast.error('Could not generate the report.', { description: describeError(e) });
  }
}

export default function AssessmentWorkflowPage() {
  const active = useActivePatient();
  const { draft, loaded, start, update, discard } = useAssessmentDraft();
  const datasets = useReferenceDatasets();
  const { settings } = useSettings();
  const [saved, setSaved] = useState<Assessment | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!loaded || datasets === undefined || active.patients === undefined) return <LoadingState />;

  const draftPatient = draft ? active.patients.find((p) => p.id === draft.patientId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Burn assessment"
        description="Regional TBSA estimation with Lund and Browder, Rule of Nines or the Palm method. Previous assessments are never overwritten."
        actions={
          <Button variant="outline" asChild>
            <Link to={`/assessment/history${active.patient ? `?patient=${active.patient.id}` : ''}`}>
              <History /> History &amp; comparison
            </Link>
          </Button>
        }
      />

      {saved ? (
        <SavedPanel assessment={saved} onNew={() => setSaved(null)} />
      ) : !draft || !draftPatient ? (
        <>
          <Stepper current={0} />
          <PatientContextBar {...active} />
          {active.patient && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Start a new assessment for <strong className="text-foreground">{active.patient.name}</strong>. A draft is kept on this device until you save or discard it.
                </p>
                <Button
                  size="lg"
                  onClick={() => void start(defaultDraftFor(active.patient!, settings.defaultAssessmentMethod, datasets))}
                  data-testid="start-assessment"
                >
                  <ClipboardList /> Start assessment
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          {active.patient && active.patient.id !== draftPatient.id && (
            <Alert variant="warning" className="mb-4" title="A draft assessment is in progress for another patient">
              Draft for {draftPatient.name} ({draftPatient.code}). Save or discard it before assessing {active.patient.name}.
            </Alert>
          )}
          <Stepper current={draft.step} onGo={(s) => void update({ step: s })} />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
            <span>
              Draft for <strong>{draftPatient.name}</strong> <span className="font-mono text-xs text-muted-foreground">{draftPatient.code}</span>
              {draft.amendsAssessmentId && <span className="ml-2 text-warning">· amends an earlier assessment (the original is kept)</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)}>
              <Trash2 /> Discard draft
            </Button>
          </div>
          <DraftSteps draft={draft} patient={draftPatient} datasets={datasets} onSaved={setSaved} />
        </>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this draft?"
        description="All unsaved regional entries in this draft will be lost. Saved assessments are not affected."
        destructive
        confirmLabel="Discard draft"
        onConfirm={async () => {
          await discard();
          toast('Draft discarded.');
        }}
      />
    </>
  );
}

function Stepper({ current, onGo }: { current: number; onGo?: (s: number) => void }) {
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Assessment steps">
      {STEPS.map((s, i) => {
        const done = i < current;
        const isCur = i === current;
        return (
          <li key={s.label}>
            <button
              type="button"
              disabled={!onGo || i === 0 || i > current}
              onClick={() => onGo?.(i)}
              aria-current={isCur ? 'step' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-default',
                isCur && 'border-primary bg-accent text-accent-foreground',
                done && 'bg-card hover:bg-muted',
                !done && !isCur && 'bg-card text-muted-foreground',
              )}
            >
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', isCur ? 'bg-primary text-primary-foreground' : done ? 'bg-success-soft text-success' : 'bg-muted')}>
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] tracking-wide uppercase opacity-70">Step {s.steps}</span>
                <span className="block truncate font-medium">{s.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepNav({ step, canNext, onBack, onNext, nextLabel = 'Next' }: { step: number; canNext: boolean; onBack: () => void; onNext?: () => void; nextLabel?: string }) {
  return (
    <div className="mt-5 flex justify-between gap-2">
      <Button variant="outline" onClick={onBack} disabled={step <= 1}>
        <ArrowLeft /> Back
      </Button>
      {onNext && (
        <Button onClick={onNext} disabled={!canNext} data-testid="step-next">
          {nextLabel} <ArrowRight />
        </Button>
      )}
    </div>
  );
}

function DraftSteps({ draft, patient, datasets, onSaved }: { draft: AssessmentDraft; patient: Patient; datasets: ReferenceDataset[]; onSaved: (a: Assessment) => void }) {
  const { update } = useAssessmentDraft();
  const f = useFormatters();
  const previous = usePatientAssessments(patient.id);
  const [pendingMethod, setPendingMethod] = useState<AssessmentMethod | null>(null);
  const [saving, setSaving] = useState(false);

  const dataset = draft.method === 'palm' ? null : (datasets.find((d) => d.id === draft.datasetId) ?? null);
  const palmDataset = datasetsForMethod(datasets, 'palm')[0] ?? null;
  const usability = useDatasetUsability(dataset);
  const palmUsability = useDatasetUsability(palmDataset);
  const result = useMemo(() => computeDraftResult(draft, dataset), [draft, dataset]);
  const limitations = limitationIssues(draft, dataset, patient);
  const age = patientAgeYears(patient, draft.assessmentDate);

  const methodReady = draft.method === 'palm' ? Number.isFinite(draft.palmPercent ?? Number.NaN) && (draft.palmPercent ?? 0) > 0 : !!usability?.usable && !!draft.columnId;
  const resultOk = result?.ok === true;
  const canSave = methodReady && resultOk && (limitations.length === 0 || draft.limitationAcknowledged) && !saving;
  const go = (step: number) => void update({ step });

  const setMethod = (m: AssessmentMethod) => {
    const ds = m === 'palm' ? null : (datasetsForMethod(datasets, m)[0] ?? null);
    const column = ds ? defaultAgeColumn((ds.data as RegionalReferenceData).columns, age.age) : null;
    void update({ method: m, datasetId: ds?.id ?? null, columnId: column?.id ?? null, columnOverridden: false, regionalEntries: [], palmEntries: [], limitationAcknowledged: false });
  };

  async function save() {
    if (!result?.ok) return;
    setSaving(true);
    try {
      const payload = buildAssessmentPayload({ draft, result: result as TbsaSuccess, dataset, palmDataset: palmUsability?.usable ? palmDataset : null, patient, limitations });
      const a = await saveAssessment(payload.assessment, payload.regions);
      await useAssessmentDraft.getState().discard();
      toast.success(`Assessment saved: TBSA ${formatCompact(a.tbsaTotal, 1)}%.`);
      onSaved(a);
    } catch (e) {
      toast.error('The assessment could not be saved.', { description: describeError(e) });
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Step 2: date & time ---------------- */
  if (draft.step <= 1) {
    const future = draft.assessmentDate > new Date(Date.now() + 5 * 60_000).toISOString();
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assessment date and time</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Date and time of assessment" htmlFor="assessmentDate" required error={!draft.assessmentDate ? 'Required' : undefined}>
            <DateTimeInput id="assessmentDate" value={draft.assessmentDate} onValueChange={(v) => void update({ assessmentDate: v ?? '' })} />
          </Field>
          <Field label="Assessor (optional)" htmlFor="assessor" hint="Name or role of the clinician performing the assessment.">
            <Input id="assessor" value={draft.assessor} onChange={(e) => void update({ assessor: e.target.value })} />
          </Field>
          {future && (
            <Alert variant="warning" className="sm:col-span-2">
              The assessment time is in the future.
            </Alert>
          )}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Age at assessment: <strong className="text-foreground">{age.age ?? 'unknown'}</strong>
            {age.source === 'date-of-birth' ? ' (from date of birth)' : age.source === 'recorded-age' ? ' (from recorded age)' : ''}
          </p>
          <div className="sm:col-span-2">
            <StepNav step={draft.step} canNext={!!draft.assessmentDate} onBack={() => go(0)} onNext={() => go(2)} />
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ---------------- Step 3: method ---------------- */
  if (draft.step === 2) {
    const methodDatasets = draft.method === 'palm' ? [] : datasetsForMethod(datasets, draft.method);
    const columns = dataset ? (dataset.data as RegionalReferenceData).columns : [];
    const autoColumn = dataset ? defaultAgeColumn(columns, age.age) : null;
    const palmOptions = palmDataset ? (palmDataset.data as PalmReferenceData).options : [];
    const entryCount = draft.regionalEntries.length + draft.palmEntries.length;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assessment method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Assessment method">
            {ASSESSMENT_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={draft.method === m.id}
                onClick={() => (m.id === draft.method ? undefined : entryCount > 0 ? setPendingMethod(m.id) : setMethod(m.id))}
                className={cn('rounded-xl border p-4 text-left transition-colors hover:bg-muted', draft.method === m.id && 'border-primary bg-accent ring-1 ring-primary')}
              >
                <p className="font-semibold">{m.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
              </button>
            ))}
          </div>

          {draft.method !== 'palm' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reference dataset" htmlFor="dataset">
                <Select
                  id="dataset"
                  value={draft.datasetId ?? ''}
                  onChange={(e) => {
                    const ds = datasets.find((d) => d.id === e.target.value) ?? null;
                    const col = ds ? defaultAgeColumn((ds.data as RegionalReferenceData).columns, age.age) : null;
                    void update({ datasetId: ds?.id ?? null, columnId: col?.id ?? null, columnOverridden: false, regionalEntries: [] });
                  }}
                >
                  {methodDatasets.length === 0 && <option value="">No dataset available</option>}
                  {methodDatasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} v{d.version} — {d.status === 'verified' ? 'verified' : 'NOT CONFIGURED'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Age column"
                htmlFor="column"
                hint={autoColumn ? `Suggested from age ${age.age}: ${autoColumn.label}` : 'Age unknown — select the column manually.'}
              >
                <Select
                  id="column"
                  value={draft.columnId ?? ''}
                  onChange={(e) => void update({ columnId: e.target.value || null, columnOverridden: !!autoColumn && e.target.value !== autoColumn.id })}
                >
                  <option value="">Select…</option>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {dataset && (
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <ConfigStatusBadge status={dataset.status} />
                    <span className="text-muted-foreground">{dataset.source}</span>
                  </div>
                  {usability === undefined ? (
                    <LoadingState label="Checking dataset integrity…" className="py-2" />
                  ) : !usability.usable ? (
                    <Alert variant="danger" title="Calculation disabled — reference dataset NOT CONFIGURED" data-testid="dataset-not-configured">
                      <ul className="list-disc pl-4">
                        {usability.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                      <p className="mt-1">
                        A qualified clinician must verify the dataset values against the cited source before use. <ConfigureLink />
                      </p>
                    </Alert>
                  ) : (
                    <Alert variant="success" title="Verified reference dataset">
                      Verified by {dataset.verification?.verifiedBy} ({dataset.verification?.role}) on {f.date(dataset.verification?.verificationDate)}.
                    </Alert>
                  )}
                  {limitations.map((l, i) => (
                    <Alert key={i} variant="warning">
                      {l.message}
                    </Alert>
                  ))}
                  <p className="text-xs text-muted-foreground">{(dataset.data as RegionalReferenceData).columnSelectionNote}</p>
                </div>
              )}
            </div>
          )}

          {draft.method === 'palm' && (
            <div className="space-y-4">
              <Alert variant="info" title="Palm method limitations">
                <ul className="list-disc pl-4">
                  {(palmDataset ? (palmDataset.data as PalmReferenceData).limitations : []).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Alert>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Reference value"
                  htmlFor="palmRef"
                  hint={palmUsability?.usable ? 'Pre-fills the percentage below. Verify it applies to this patient.' : 'Palm reference dataset is NOT CONFIGURED: enter the value manually as a clinician assumption.'}
                >
                  <Select
                    id="palmRef"
                    value={draft.palmReference ?? 'clinician-entered'}
                    onChange={(e) => {
                      const opt = palmOptions.find((o) => o.id === e.target.value);
                      void update({ palmReference: e.target.value, palmPercent: opt ? opt.percent : draft.palmPercent });
                    }}
                  >
                    <option value="clinician-entered">Clinician-entered value</option>
                    {palmOptions.map((o) => (
                      <option key={o.id} value={o.id} disabled={!palmUsability?.usable}>
                        {o.label} ({formatCompact(o.percent, 2)}%){palmUsability?.usable ? '' : ' — not configured'}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="%TBSA of ONE palm-equivalent for this patient"
                  htmlFor="palmPercent"
                  required
                  error={draft.palmPercent !== null && !(draft.palmPercent > 0 && draft.palmPercent <= 100) ? 'Must be greater than 0 and at most 100.' : undefined}
                >
                  <PalmPercentInput
                    value={draft.palmPercent}
                    onChange={(n) => void update({ palmPercent: n, palmReference: 'clinician-entered' })}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">Assumed reference: {palmReferenceText(draft, palmUsability?.usable ? palmDataset : null)}</p>
            </div>
          )}

          <StepNav step={draft.step} canNext={methodReady} onBack={() => go(1)} onNext={() => go(3)} />
        </CardContent>
        <ConfirmDialog
          open={pendingMethod !== null}
          onOpenChange={(o) => !o && setPendingMethod(null)}
          title="Change assessment method?"
          description={`Changing the method clears the ${entryCount} region entr${entryCount === 1 ? 'y' : 'ies'} recorded in this draft, because regions differ between methods.`}
          confirmLabel="Change method"
          destructive
          onConfirm={() => {
            if (pendingMethod) setMethod(pendingMethod);
          }}
        />
      </Card>
    );
  }

  /* ---------------- Steps 4–6: regions ---------------- */
  if (draft.step === 3) {
    return (
      <>
        {!methodReady && (
          <Alert variant="danger" className="mb-4" title="Method not ready">
            Return to step 3: the reference dataset or palm value is not configured.
          </Alert>
        )}
        <RegionMappingPanel draft={draft} dataset={dataset} result={result} />
        <StepNav step={draft.step} canNext={methodReady} onBack={() => go(2)} onNext={() => go(4)} nextLabel="Review" />
      </>
    );
  }

  /* ---------------- Steps 7–8: review ---------------- */
  const previousCurrent = (previous ?? []).filter((a) => !a.supersededById && a.id !== draft.amendsAssessmentId)[0];
  const depthMap = draftDepthMap(draft, draft.method === 'palm' ? null : ((dataset?.data as RegionalReferenceData) ?? null));

  const review = (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Calculated TBSA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result ? (
              <Alert variant="danger">No reference dataset selected.</Alert>
            ) : result.ok ? (
              <>
                <TbsaTotalsPanel totals={result.totals} />
                {previousCurrent && (
                  <p className="text-sm text-muted-foreground" data-testid="previous-comparison">
                    Previous assessment ({f.dateTime(previousCurrent.assessmentDate)}, {METHOD_LABEL[previousCurrent.method]}): {formatCompact(previousCurrent.tbsaTotal, 1)}% → change{' '}
                    <strong className="text-foreground">
                      {result.totals.eligible - previousCurrent.tbsaTotal >= 0 ? '+' : ''}
                      {formatCompact(result.totals.eligible - previousCurrent.tbsaTotal, 1)}%
                    </strong>
                  </p>
                )}
              </>
            ) : null}
            <IssuesPanel issues={result?.issues ?? []} />
          </CardContent>
        </Card>
        {result?.ok && (
          <Card>
            <CardHeader>
              <CardTitle>Regional breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <BreakdownTable items={result.items} method={draft.method === 'palm' ? 'palm' : 'regional'} />
              <CalculationSteps steps={result.steps} />
            </CardContent>
          </Card>
        )}
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Body map</CardTitle>
          </CardHeader>
          <CardContent>
            <BodyMap2D depthBySegment={depthMap} readOnly />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Method &amp; reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Method:</span> {METHOD_LABEL[draft.method]}
            </p>
            {dataset && (
              <p>
                <span className="text-muted-foreground">Dataset:</span> {dataset.name} v{dataset.version}
              </p>
            )}
            {result?.ok && result.columnLabel && (
              <p>
                <span className="text-muted-foreground">Age column:</span> {result.columnLabel}
              </p>
            )}
            {draft.method === 'palm' && (
              <p>
                <span className="text-muted-foreground">Palm reference:</span> {palmReferenceText(draft, palmUsability?.usable ? palmDataset : null)}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Assessment time:</span> {f.dateTime(draft.assessmentDate)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  if (draft.step === 4) {
    return (
      <>
        {review}
        {limitations.length > 0 && (
          <Card className="mt-5">
            <CardContent className="space-y-2 pt-5">
              {limitations.map((l, i) => (
                <Alert key={i} variant="warning">
                  {l.message}
                </Alert>
              ))}
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={draft.limitationAcknowledged} onChange={(e) => void update({ limitationAcknowledged: e.target.checked })} className="mt-0.5" />
                I acknowledge these limitations and have considered them in my clinical assessment.
              </label>
            </CardContent>
          </Card>
        )}
        <StepNav step={draft.step} canNext={resultOk && (limitations.length === 0 || draft.limitationAcknowledged)} onBack={() => go(3)} onNext={() => go(5)} />
      </>
    );
  }

  /* ---------------- Steps 9–10: save ---------------- */
  return (
    <Card>
      <CardHeader>
        <CardTitle>Save assessment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {result?.ok && <TbsaTotalsPanel totals={result.totals} compact />}
        <Field label="Assessment notes" htmlFor="assessmentNotes">
          <Textarea id="assessmentNotes" value={draft.notes} onChange={(e) => void update({ notes: e.target.value })} />
        </Field>
        <p className="text-sm text-muted-foreground">
          Saving creates a new, permanent assessment record for {patient.name}
          {draft.amendsAssessmentId ? '. The earlier assessment is kept and marked as superseded.' : '. Previous assessments are not changed.'} The method, dataset version, age column,
          regional breakdown and timestamp are stored with the result.
        </p>
        {!canSave && !saving && (
          <Alert variant="warning">
            {!methodReady ? 'The method is not configured.' : !resultOk ? 'Resolve the validation errors first.' : 'Acknowledge the limitations in the review step.'}
          </Alert>
        )}
        <DisclaimerNote />
        <StepNav step={draft.step} canNext={canSave} onBack={() => go(4)} />
        <Button size="lg" className="w-full" disabled={!canSave} onClick={() => void save()} data-testid="save-assessment">
          <Save /> {saving ? 'Saving…' : 'Save assessment'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PalmPercentInput({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    const parsed = parseNumberInput(text);
    if ((Number.isFinite(parsed) ? parsed : null) !== value) setText(value === null ? '' : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Input
      id="palmPercent"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumberInput(e.target.value);
        onChange(Number.isFinite(n) ? n : null);
      }}
    />
  );
}

function SavedPanel({ assessment, onNew }: { assessment: Assessment; onNew: () => void }) {
  const navigate = useNavigate();
  return (
    <Card data-testid="assessment-saved">
      <CardContent className="space-y-4 pt-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <Check className="size-6" />
        </div>
        <div>
          <p className="text-lg font-semibold">Assessment saved</p>
          <p className="text-sm text-muted-foreground">
            {METHOD_LABEL[assessment.method]} · TBSA <strong className="text-foreground">{formatCompact(assessment.tbsaTotal, 1)}%</strong>
            {assessment.tbsaIndeterminate > 0 && ` · ${formatCompact(assessment.tbsaIndeterminate, 1)}% indeterminate (not included)`}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => void downloadAssessmentPdf(assessment.id)} data-testid="download-assessment-pdf">
            <FileDown /> Download assessment report (PDF)
          </Button>
          <Button variant="outline" onClick={() => navigate(`/assessment/${assessment.id}`)}>
            View assessment
          </Button>
          <Button variant="outline" onClick={() => navigate(`/fluids?patient=${assessment.patientId}`)}>
            <Droplets /> Fluid management
          </Button>
          <Button variant="ghost" onClick={onNew}>
            New assessment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
