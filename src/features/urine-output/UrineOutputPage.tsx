import { useLiveQuery } from 'dexie-react-hooks';
import { Beaker, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfigStatusBadge, ConfigureLink, DisclaimerNote } from '@/components/common/ClinicalNotices';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, patientAgeYears, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { db } from '@/database/db';
import { observationRepo } from '@/database/repositories/records';
import { filterByInterval } from '@/engines/fluid-balance';
import type { UrineOutputTargetData } from '@/engines/tbsa/types';
import { calculateUrineOutput, classifyUrineOutput, describeTarget, selectUrineTarget } from '@/engines/urine-output';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useDatasetUsability, useReferenceDatasets } from '@/features/burn-assessment/service';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import type { Patient } from '@/types/domain';
import { addHoursIso, formatDuration, nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { formatCompact, preciseSum, roundHalfAwayFromZero } from '@/utils/rounding';
import { weightFromDisplay, weightToDisplay } from '@/utils/units';

export default function UrineOutputPage() {
  const active = useActivePatient();
  return (
    <>
      <PageHeader
        title="Urine output calculator"
        description="Urine output rate (mL/kg/h) = urine volume (mL) ÷ weight (kg) ÷ measurement duration (h)."
        actions={
          <Button variant="outline" asChild>
            <Link to="/intake-output">Back to intake &amp; output</Link>
          </Button>
        }
      />
      <PatientContextBar {...active} />
      {active.patient && <UrineCalculator key={active.patient.id} patient={active.patient} />}
    </>
  );
}

function UrineCalculator({ patient }: { patient: Patient }) {
  const f = useFormatters();
  const { settings } = useSettings();
  const datasets = useReferenceDatasets();
  const targetsDataset = (datasets ?? []).filter((d) => d.kind === 'urine-output-targets' && d.status !== 'retired').sort((a, b) => (a.status === 'verified' ? 0 : 1) - (b.status === 'verified' ? 0 : 1))[0] ?? null;
  const usability = useDatasetUsability(targetsDataset);
  const verifiedTargets = usability?.usable ? (targetsDataset!.data as UrineOutputTargetData).targets : [];

  const wu = settings.weightUnit;
  const [weightText, setWeightText] = useState(patient.weightKg ? String(roundHalfAwayFromZero(weightToDisplay(patient.weightKg, wu), 2)) : '');
  const [volumeText, setVolumeText] = useState('');
  const [start, setStart] = useState<string | null>(addHoursIso(nowIso(), -1));
  const [end, setEnd] = useState<string | null>(nowIso());
  const age = patientAgeYears(patient, end ?? nowIso()).age;
  const autoTarget = selectUrineTarget(verifiedTargets, age, patient.weightKg);
  const [targetChoice, setTargetChoice] = useState<string>('auto');
  const target = targetChoice === 'auto' ? autoTarget : targetChoice === 'none' ? null : (verifiedTargets.find((t) => t.id === targetChoice) ?? null);

  const urineRecords = useLiveQuery(() => db.outputRecords.where('patientId').equals(patient.id).filter((r) => r.category === 'urine').toArray(), [patient.id]);
  const recordedInPeriod = useMemo(() => (urineRecords && start && end ? filterByInterval(urineRecords, start, end) : []), [urineRecords, start, end]);

  const weightKg = (() => {
    const n = parseNumberInput(weightText);
    return Number.isFinite(n) ? weightFromDisplay(n, wu) : Number.NaN;
  })();
  const volume = parseNumberInput(volumeText);
  const touched = weightText !== '' || volumeText !== '';
  const outcome = calculateUrineOutput({ volumeMl: volume, weightKg, start: start ?? '', end: end ?? '' });
  const classification = outcome.ok ? classifyUrineOutput(outcome.result.mlPerKgPerHour, target) : null;

  async function saveObservation() {
    if (!outcome.ok) return;
    try {
      const r = outcome.result;
      await observationRepo.add({
        patientId: patient.id,
        dateTime: r.end,
        parameter: 'urine-output',
        value: r.mlPerKgPerHourRounded,
        value2: null,
        unit: 'mL/kg/h',
        notes: `${formatCompact(r.volumeMl, 1)} mL over ${formatDuration(r.durationHours)} at ${formatCompact(r.weightKg, 2)} kg${classification && classification.status !== 'not-classified' ? ` — ${classification.message}` : ''}`,
        meta: { volumeMl: r.volumeMl, weightKg: r.weightKg, start: r.start, end: r.end, durationHours: r.durationHours, mlPerKgPerHourExact: r.mlPerKgPerHour, targetId: target?.id ?? null },
      });
      toast.success('Saved as a urine-output observation.');
    } catch (e) {
      toast.error('Could not save.', { description: describeError(e) });
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Measurement</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={`Patient weight (${wu})`} htmlFor="uo-weight" required error={touched && !outcome.ok ? outcome.issues.find((i) => i.field === 'weightKg')?.message : undefined}>
            <Input id="uo-weight" inputMode="decimal" value={weightText} onChange={(e) => setWeightText(e.target.value)} />
          </Field>
          <Field label="Urine volume (mL)" htmlFor="uo-volume" required error={touched && !outcome.ok ? outcome.issues.find((i) => i.field === 'volumeMl')?.message : undefined}>
            <Input id="uo-volume" inputMode="decimal" value={volumeText} onChange={(e) => setVolumeText(e.target.value)} />
          </Field>
          <Field label="Measurement start" htmlFor="uo-start" required error={!outcome.ok ? outcome.issues.find((i) => i.field === 'start')?.message : undefined}>
            <DateTimeInput id="uo-start" value={start} onValueChange={setStart} />
          </Field>
          <Field label="Measurement end" htmlFor="uo-end" required error={!outcome.ok ? outcome.issues.find((i) => i.field === 'end')?.message : undefined}>
            <DateTimeInput id="uo-end" value={end} onValueChange={setEnd} />
          </Field>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm sm:col-span-2">
            <p>
              Urine output records in this period: <strong>{recordedInPeriod.length}</strong> totalling{' '}
              <strong className="tabular">{formatCompact(preciseSum(recordedInPeriod.map((r) => r.amountMl)), 1)} mL</strong>
            </p>
            <Button size="sm" variant="outline" className="mt-2" disabled={recordedInPeriod.length === 0} onClick={() => setVolumeText(String(preciseSum(recordedInPeriod.map((r) => r.amountMl))))}>
              Use recorded urine volume
            </Button>
          </div>
          <Field
            label="Patient age category / target"
            htmlFor="uo-target"
            className="sm:col-span-2"
            hint={`Patient age: ${age ?? 'unknown'}${autoTarget ? ` → ${autoTarget.label}` : ''}`}
          >
            <Select id="uo-target" value={targetChoice} onChange={(e) => setTargetChoice(e.target.value)} disabled={verifiedTargets.length === 0}>
              <option value="auto">Automatic from age{autoTarget ? ` (${autoTarget.label})` : ' (no matching target)'}</option>
              <option value="none">Do not classify</option>
              {verifiedTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          {targetsDataset && (
            <div className="flex flex-wrap items-center gap-2 text-xs sm:col-span-2">
              <ConfigStatusBadge status={targetsDataset.status} />
              <span className="text-muted-foreground">{targetsDataset.name}</span>
              {!usability?.usable && <ConfigureLink to="/settings?tab=urine">Configure targets</ConfigureLink>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!outcome.ok ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl bg-muted p-4 text-muted-foreground">
                <Beaker className="size-5" /> Enter weight, volume and a valid measurement period.
              </div>
              {touched && (
                <Alert variant="danger">
                  <ul className="list-disc pl-4" data-testid="uo-errors">
                    {outcome.issues.map((i) => (
                      <li key={i.field + i.message}>{i.message}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </div>
          ) : (
            <div className="space-y-4" data-testid="uo-result">
              <div className="rounded-xl bg-accent p-4 text-accent-foreground">
                <p className="text-xs font-semibold tracking-wide uppercase">Urine output rate</p>
                <p className="tabular text-3xl font-bold" data-testid="uo-rate">
                  {formatCompact(outcome.result.mlPerKgPerHourRounded, 2)} mL/kg/h
                </p>
                <p className="text-xs opacity-80">{formatCompact(outcome.result.mlPerHour, 1)} mL/h</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Total urine volume</dt>
                  <dd className="tabular font-medium">{formatCompact(outcome.result.volumeMl, 1)} mL</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Duration</dt>
                  <dd className="tabular font-medium">
                    {formatDuration(outcome.result.durationHours)} ({formatCompact(outcome.result.durationHours, 3)} h)
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Weight</dt>
                  <dd className="tabular font-medium">{formatCompact(outcome.result.weightKg, 2)} kg</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Measurement period</dt>
                  <dd className="text-xs font-medium">
                    {f.dateTime(outcome.result.start)} → {f.dateTime(outcome.result.end)}
                  </dd>
                </div>
              </dl>
              <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">{outcome.result.formulaText}</p>
              {classification && (
                <Alert
                  variant={classification.status === 'not-classified' ? 'neutral' : classification.status === 'within' ? 'success' : 'warning'}
                  data-testid="uo-classification"
                >
                  {classification.message}
                  {classification.status !== 'not-classified' && (
                    <span className="mt-1 block text-xs">
                      Target from {targetsDataset?.name} v{targetsDataset?.version} ({targetsDataset?.source}). {describeTarget(classification.target)}
                    </span>
                  )}
                </Alert>
              )}
              <Button onClick={() => void saveObservation()} data-testid="uo-save">
                <Save /> Save as observation
              </Button>
            </div>
          )}
          <DisclaimerNote />
        </CardContent>
      </Card>
    </div>
  );
}
