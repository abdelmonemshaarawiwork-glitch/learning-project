import { useLiveQuery } from 'dexie-react-hooks';
import { Droplets, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { ConfigStatusBadge, ConfigureLink, DisclaimerNote } from '@/components/common/ClinicalNotices';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { INTAKE_CATEGORIES, INTAKE_LABEL, METHOD_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { deleteFluidCalculation, intakeRepo, listFluidCalculations, saveFluidCalculation } from '@/database/repositories/records';
import { calculateFluidEstimate, type FluidCalculationInput } from '@/engines/fluids';
import { filterByInterval } from '@/engines/fluid-balance';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { usePatientAssessments } from '@/features/burn-assessment/queries';
import { useFluidProtocols, useProtocolUsability } from '@/features/burn-assessment/service';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import type { FluidProtocol, IntakeCategory, Patient } from '@/types/domain';
import { addHoursIso, formatDuration, hoursBetween, nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { formatCompact, formatNumber, preciseSum, roundHalfAwayFromZero } from '@/utils/rounding';
import { weightFromDisplay, weightToDisplay } from '@/utils/units';

export default function FluidManagementPage() {
  const active = useActivePatient();
  return (
    <>
      <PageHeader
        title="Fluid management"
        description="Protocol-based resuscitation volume estimates for clinician review. The application never prescribes, orders or adjusts fluids."
      />
      <PatientContextBar {...active} />
      {active.patient && <FluidWorkspace key={active.patient.id} patient={active.patient} />}
    </>
  );
}

function FluidWorkspace({ patient }: { patient: Patient }) {
  const f = useFormatters();
  const { settings } = useSettings();
  const protocols = useFluidProtocols();
  const assessments = usePatientAssessments(patient.id);
  const intake = useLiveQuery(() => db.intakeRecords.where('patientId').equals(patient.id).toArray(), [patient.id]);
  const saved = useLiveQuery(() => listFluidCalculations(patient.id), [patient.id]);

  const available = (protocols ?? []).filter((p) => p.status !== 'retired').sort((a, b) => (a.status === 'verified' ? -1 : 1) - (b.status === 'verified' ? -1 : 1));
  const [protocolId, setProtocolId] = useState<string>('');
  const protocol: FluidProtocol | null = available.find((p) => p.id === protocolId) ?? available[0] ?? null;
  const usability = useProtocolUsability(protocol);

  const currentAssessments = (assessments ?? []).filter((a) => !a.supersededById);
  const [assessmentId, setAssessmentId] = useState<string>('');
  const linked = currentAssessments.find((a) => a.id === assessmentId) ?? currentAssessments[0] ?? null;

  const wu = settings.weightUnit;
  const [weightText, setWeightText] = useState(patient.weightKg ? String(roundHalfAwayFromZero(weightToDisplay(patient.weightKg, wu), 2)) : '');
  const [tbsaText, setTbsaText] = useState('');
  const [injuryTime, setInjuryTime] = useState<string | null>(patient.injuryDate);
  const [resusStart, setResusStart] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>(nowIso());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (linked) setTbsaText(String(linked.tbsaTotal));
  }, [linked?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const weightKg = (() => {
    const n = parseNumberInput(weightText);
    return Number.isFinite(n) ? weightFromDisplay(n, wu) : Number.NaN;
  })();
  const tbsa = parseNumberInput(tbsaText);
  const params = protocol?.parameters;
  const referenceTime = params?.timeReference === 'resuscitation-start' ? resusStart : injuryTime;

  const counted = useMemo(() => {
    if (!intake || !params || !referenceTime) return [];
    const cats = new Set(params.countedIntakeCategories);
    return filterByInterval(intake, referenceTime, addHoursIso(asOf, 1 / 3600)).filter((r) => cats.has(r.category));
  }, [intake, params, referenceTime, asOf]);
  const administeredMl = preciseSum(counted.map((r) => r.amountMl));

  const input: FluidCalculationInput | null = protocol
    ? {
        weightKg,
        tbsaPercent: tbsa,
        injuryTime: injuryTime ?? '',
        resuscitationStartTime: resusStart,
        asOfTime: asOf,
        administeredMl,
        protocol: { id: protocol.id, name: protocol.name, version: protocol.version, parameters: protocol.parameters },
      }
    : null;
  const outcome = usability?.usable && input ? calculateFluidEstimate(input) : null;
  const result = outcome?.ok ? outcome.result : null;

  const chartData = useMemo(() => {
    if (!result || !intake || !params) return [];
    const end = result.periodElapsed ? result.periodEnd : asOf;
    const span = Math.max(0, hoursBetween(result.referenceTime, end));
    const steps = Math.min(96, Math.max(2, Math.ceil(span)));
    const cats = new Set(params.countedIntakeCategories);
    const records = intake.filter((r) => cats.has(r.category));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const h = (span * i) / steps;
      const t = addHoursIso(result.referenceTime, h);
      const scheduled = preciseSum(
        result.phases.map((ph) => {
          const startH = hoursBetween(result.referenceTime, ph.start);
          return ph.volumeMl * Math.min(1, Math.max(0, (h - startH) / ph.durationHours));
        }),
      );
      const administered = preciseSum(filterByInterval(records, result.referenceTime, addHoursIso(t, 1 / 3600)).map((r) => r.amountMl));
      return { hour: roundHalfAwayFromZero(h, 1), scheduled: Math.round(scheduled), administered: Math.round(administered) };
    });
  }, [result, intake, params, asOf]);

  async function saveCalc() {
    if (!result || !input || !protocol) return;
    try {
      await saveFluidCalculation({
        patientId: patient.id,
        assessmentId: linked && Number(tbsaText) === linked.tbsaTotal ? linked.id : null,
        protocolId: protocol.id,
        protocolName: protocol.name,
        protocolVersion: protocol.version,
        inputData: input,
        resultData: result,
        calculationDate: nowIso(),
        notes: '',
      });
      toast.success('Calculation snapshot saved.');
    } catch (e) {
      toast.error('Could not save the calculation.', { description: describeError(e) });
    }
  }

  if (protocols === undefined || assessments === undefined) return <LoadingState />;

  return (
    <div className="space-y-5">
      <Alert variant="warning" title="Calculation support only">
        Estimates require clinical assessment and ongoing monitoring. They are not prescriptions, medication orders or infusion-pump settings, and the application never adjusts fluid
        administration automatically.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Protocol" htmlFor="protocol">
              <Select id="protocol" value={protocol?.id ?? ''} onChange={(e) => setProtocolId(e.target.value)}>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} v{p.version} — {p.status === 'verified' ? 'verified' : 'NOT CONFIGURED'}
                  </option>
                ))}
              </Select>
            </Field>
            {protocol && (
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <ConfigStatusBadge status={protocol.status} />
                  <span className="font-medium">{protocol.name}</span>
                </div>
                <p className="text-muted-foreground">{protocol.description}</p>
                <p className="text-xs text-muted-foreground">Source: {protocol.source}</p>
                <p className="text-xs text-muted-foreground">Population: {protocol.population}</p>
                {protocol.parameters.mlPerKgPerPercentTbsa !== null && (
                  <p className="font-mono text-xs" data-testid="formula-template">
                    Formula: {formatCompact(protocol.parameters.mlPerKgPerPercentTbsa, 3)} mL × weight (kg) × %TBSA over {protocol.parameters.periodHours ?? '?'} h from{' '}
                    {protocol.parameters.timeReference === 'injury' ? 'injury' : 'resuscitation start'}
                  </p>
                )}
              </div>
            )}
            {usability && !usability.usable && (
              <Alert variant="danger" title="Protocol NOT CONFIGURED — calculation disabled" data-testid="protocol-not-configured">
                <ul className="list-disc pl-4">
                  {usability.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-1">
                  <ConfigureLink to="/settings?tab=protocols">Verify the protocol in Settings → Fluid protocols</ConfigureLink>
                </p>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Weight (${wu})`} htmlFor="fl-weight" required error={weightText && !(weightKg > 0) ? 'Weight must be greater than 0.' : undefined}>
                <Input id="fl-weight" inputMode="decimal" value={weightText} onChange={(e) => setWeightText(e.target.value)} />
              </Field>
              <Field
                label="TBSA (%)"
                htmlFor="fl-tbsa"
                required
                error={tbsaText && !(tbsa > 0 && tbsa <= 100) ? 'TBSA must be > 0 and ≤ 100.' : undefined}
                hint={linked ? `From ${METHOD_LABEL[linked.method]} assessment ${f.dateTime(linked.assessmentDate)}` : 'No saved assessment — enter manually.'}
              >
                <Input id="fl-tbsa" inputMode="decimal" value={tbsaText} onChange={(e) => setTbsaText(e.target.value)} />
              </Field>
            </div>
            {currentAssessments.length > 1 && (
              <Field label="Use TBSA from assessment" htmlFor="fl-assessment">
                <Select id="fl-assessment" value={linked?.id ?? ''} onChange={(e) => setAssessmentId(e.target.value)}>
                  {currentAssessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {f.dateTime(a.assessmentDate)} · {formatCompact(a.tbsaTotal, 1)}%
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {linked && linked.tbsaIndeterminate > 0 && (
              <Alert variant="warning">
                The linked assessment has {formatCompact(linked.tbsaIndeterminate, 1)}% TBSA of indeterminate depth that is NOT included in {formatCompact(linked.tbsaTotal, 1)}%. Reassess depth
                and decide which TBSA to use.
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Time of injury" htmlFor="fl-injury" required error={!injuryTime ? 'Required' : undefined}>
                <DateTimeInput id="fl-injury" value={injuryTime} onValueChange={setInjuryTime} />
              </Field>
              <Field label="Resuscitation started" htmlFor="fl-resus">
                <DateTimeInput id="fl-resus" value={resusStart} onValueChange={setResusStart} />
              </Field>
              <Field label="Calculate as of" htmlFor="fl-asof">
                <div className="flex gap-2">
                  <DateTimeInput id="fl-asof" value={asOf} onValueChange={(v) => setAsOf(v ?? nowIso())} />
                  <Button variant="outline" onClick={() => setAsOf(nowIso())}>
                    Now
                  </Button>
                </div>
              </Field>
            </div>
            {outcome && !outcome.ok && (
              <Alert variant="danger" title="Check the inputs" data-testid="fluid-errors">
                <ul className="list-disc pl-4">
                  {outcome.issues.map((i, k) => (
                    <li key={k}>{i.message}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>Estimate</CardTitle>
              <Button size="sm" variant="outline" disabled={!result} onClick={() => void saveCalc()} data-testid="save-fluid-calc">
                <Save /> Save snapshot
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result ? (
                <EmptyState icon={<Droplets />} title="No estimate" description={usability?.usable ? 'Complete the inputs to calculate.' : 'The selected protocol must be verified before use.'} />
              ) : (
                <div data-testid="fluid-result" className="space-y-4">
                  <p className="rounded-lg bg-muted px-3 py-2 font-mono text-sm" data-testid="fluid-formula">
                    {result.formulaText}
                  </p>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    <StatCard label="Estimated volume" value={`${formatNumber(result.totalVolumeMl)} mL`} hint={`over ${protocol?.parameters.periodHours} h`} />
                    <StatCard label="Administered" value={`${formatNumber(result.administeredMl)} mL`} hint={`${counted.length} counted record(s)`} />
                    <StatCard label="Remaining estimate" value={`${formatNumber(result.remainingMl)} mL`} tone={result.remainingMl < 0 ? 'warning' : 'default'} />
                    <StatCard label="Schedule cumulative" value={`${formatNumber(result.scheduledCumulativeMl)} mL`} hint="at calculation time" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">Time since injury</p>
                      <p className="tabular text-lg font-semibold" data-testid="time-since-injury">
                        {formatDuration(result.hoursSinceInjury)}
                      </p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">Time since resuscitation started</p>
                      <p className="tabular text-lg font-semibold" data-testid="time-since-resus">
                        {result.hoursSinceResuscitationStart === null ? 'Not entered' : formatDuration(result.hoursSinceResuscitationStart)}
                      </p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">Period ends</p>
                      <p className="tabular text-lg font-semibold">{f.dateTime(result.periodEnd)}</p>
                    </div>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Phase</TH>
                        <TH>Window</TH>
                        <TH className="text-right">Volume</TH>
                        <TH className="text-right">Arithmetic avg.*</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {result.phases.map((ph) => (
                        <TR key={ph.id}>
                          <TD className="font-medium">{ph.label}</TD>
                          <TD className="text-xs whitespace-nowrap">
                            {f.dateTime(ph.start)} → {f.time(ph.end)}
                          </TD>
                          <TD className="tabular text-right">{formatNumber(ph.volumeMl)} mL</TD>
                          <TD className="tabular text-right">{formatNumber(ph.averageMlPerHour)} mL/h</TD>
                          <TD>
                            <Badge variant={ph.status === 'current' ? 'primary' : 'neutral'}>{ph.status}</Badge>
                            {ph.status === 'current' && <p className="mt-0.5 text-xs text-muted-foreground">{formatDuration(ph.hoursRemaining)} left</p>}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <p className="text-xs text-muted-foreground">* Volume ÷ window length. Descriptive only — not an infusion rate or pump setting.</p>
                  {result.warnings.map((w, i) => (
                    <Alert key={i} variant="warning">
                      {w}
                    </Alert>
                  ))}
                  <details className="rounded-xl border bg-muted/40 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Assumptions &amp; calculation details</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {result.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </details>
                  {chartData.length > 1 && (
                    <div className="h-64" aria-label="Cumulative administered volume versus protocol schedule">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} label={{ value: `hours since ${result.referenceLabel}`, position: 'insideBottom', offset: -2, fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={56} />
                          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line type="linear" dataKey="scheduled" name="Protocol schedule (mL)" stroke="var(--chart-4)" strokeDasharray="5 4" dot={false} strokeWidth={2} />
                          <Line type="stepAfter" dataKey="administered" name="Administered (mL)" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
              <DisclaimerNote />
            </CardContent>
          </Card>

          <AdministeredFluidForm patientId={patient.id} defaultCategory={(params?.countedIntakeCategories[0] ?? 'iv-crystalloid') as IntakeCategory} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved calculation snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          {!saved?.length ? (
            <p className="text-sm text-muted-foreground">No saved snapshots.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Calculated</TH>
                  <TH>Protocol</TH>
                  <TH>Inputs</TH>
                  <TH className="text-right">Estimate</TH>
                  <TH className="text-right">Administered</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {saved.map((c) => (
                  <TR key={c.id}>
                    <TD className="whitespace-nowrap">{f.dateTime(c.calculationDate)}</TD>
                    <TD>
                      {c.protocolName} v{c.protocolVersion}
                    </TD>
                    <TD className="text-xs">
                      {formatCompact(c.inputData.weightKg, 1)} kg · {formatCompact(c.inputData.tbsaPercent, 1)}%
                    </TD>
                    <TD className="tabular text-right">{formatNumber(c.resultData.totalVolumeMl)} mL</TD>
                    <TD className="tabular text-right">{formatNumber(c.resultData.administeredMl)} mL</TD>
                    <TD className="text-right">
                      <Button size="icon-sm" variant="ghost" aria-label="Delete snapshot" onClick={() => setConfirmDelete(c.id)}>
                        <Trash2 />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete this calculation snapshot?"
        destructive
        confirmLabel="Delete"
        description="The saved snapshot is removed. Intake records are not affected."
        onConfirm={async () => {
          if (confirmDelete) await deleteFluidCalculation(confirmDelete);
        }}
      />
    </div>
  );
}

function AdministeredFluidForm({ patientId, defaultCategory }: { patientId: string; defaultCategory: IntakeCategory }) {
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState<string | null>(nowIso());
  const [category, setCategory] = useState<IntakeCategory>(defaultCategory);
  const [source, setSource] = useState('');
  const n = parseNumberInput(amount);
  const valid = Number.isFinite(n) && n > 0 && !!time;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record administered fluid</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Creates an intake record (visible in Intake &amp; Output). Include pre-hospital fluids with their actual time.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Amount (mL)" htmlFor="adm-amount">
            <Input id="adm-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Time" htmlFor="adm-time">
            <DateTimeInput id="adm-time" value={time} onValueChange={setTime} />
          </Field>
          <Field label="Category" htmlFor="adm-cat">
            <Select id="adm-cat" value={category} onChange={(e) => setCategory(e.target.value as IntakeCategory)}>
              {INTAKE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fluid / details" htmlFor="adm-src">
            <Input id="adm-src" value={source} onChange={(e) => setSource(e.target.value)} placeholder={INTAKE_LABEL[category]} />
          </Field>
        </div>
        <Button
          className="mt-3"
          disabled={!valid}
          onClick={async () => {
            try {
              await intakeRepo.add({ patientId, dateTime: time!, category, amountMl: n, source, notes: '' });
              setAmount('');
              toast.success('Administered fluid recorded.');
            } catch (e) {
              toast.error('Could not record fluid.', { description: describeError(e) });
            }
          }}
          data-testid="add-administered"
        >
          <Plus /> Add record
        </Button>
      </CardContent>
    </Card>
  );
}
