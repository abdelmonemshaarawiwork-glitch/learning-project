import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { toast } from 'sonner';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ObservationParameterDef } from '@/constants/clinical';
import { db } from '@/database/db';
import { observationRepo } from '@/database/repositories/records';
import { filterByInterval } from '@/engines/fluid-balance';
import { evaluateThresholds, type ObservationThreshold } from '@/engines/thresholds';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useFormatters } from '@/hooks/useFormatters';
import { useObservationParameters, useSettings } from '@/hooks/useSettings';
import type { ClinicalObservation, Patient } from '@/types/domain';
import { addHoursIso, nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { formatCompact, preciseSum } from '@/utils/rounding';
import { temperatureFromDisplay, temperatureToDisplay } from '@/utils/units';

export default function MonitoringPage() {
  const active = useActivePatient();
  return (
    <>
      <PageHeader
        title="Clinical monitoring"
        description="Record observations and laboratory values, review trends and compare time intervals. Warnings only indicate values outside user-configured thresholds; they are not diagnoses."
        actions={
          <Button variant="outline" asChild>
            <Link to="/settings?tab=thresholds">Warning thresholds</Link>
          </Button>
        }
      />
      <PatientContextBar {...active} />
      {active.patient && <MonitoringWorkspace key={active.patient.id} patient={active.patient} />}
    </>
  );
}

function displayValue(o: ClinicalObservation, def: ObservationParameterDef | undefined, tempUnit: 'C' | 'F'): string {
  const d = def?.decimals ?? 2;
  if (o.parameter === 'temperature' && o.unit === '°C') return `${formatCompact(temperatureToDisplay(o.value, tempUnit), 1)} °${tempUnit}`;
  if (o.value2 !== null) return `${formatCompact(o.value, d)}/${formatCompact(o.value2, d)} ${o.unit}`;
  return `${formatCompact(o.value, d)} ${o.unit}`;
}

function stats(values: number[]) {
  if (!values.length) return null;
  return { n: values.length, mean: preciseSum(values) / values.length, min: Math.min(...values), max: Math.max(...values) };
}

function MonitoringWorkspace({ patient }: { patient: Patient }) {
  const f = useFormatters();
  const { settings } = useSettings();
  const params = useObservationParameters();
  const observations = useLiveQuery(() => db.clinicalObservations.where('patientId').equals(patient.id).toArray(), [patient.id]);
  const [paramFilter, setParamFilter] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClinicalObservation | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ClinicalObservation | null>(null);
  const [trendParam, setTrendParam] = useState('heart-rate');
  const [cmp, setCmp] = useState({ aStart: addHoursIso(nowIso(), -48), aEnd: addHoursIso(nowIso(), -24), bStart: addHoursIso(nowIso(), -24), bEnd: nowIso() });

  const thresholds = settings.observationThresholds;
  const paramDef = (id: string) => params.find((p) => p.id === id);

  const filtered = useMemo(
    () =>
      filterByInterval(
        (observations ?? []).map((o) => ({ ...o, amountMl: 0, category: o.parameter })),
        from,
        to ? addHoursIso(to, 1 / 3600) : null,
      )
        .filter((o) => !paramFilter || o.parameter === paramFilter)
        .sort((a, b) => b.dateTime.localeCompare(a.dateTime)) as unknown as ClinicalObservation[],
    [observations, from, to, paramFilter],
  );

  if (!observations) return <LoadingState />;

  const trendDef = paramDef(trendParam);
  const trendData = [...filtered]
    .filter((o) => o.parameter === trendParam)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    .map((o) => ({
      t: f.dateTime(o.dateTime),
      value: o.parameter === 'temperature' ? temperatureToDisplay(o.value, settings.temperatureUnit) : o.value,
      value2: o.value2,
    }));
  const trendThresholds = thresholds.filter((t) => t.enabled && t.parameterId === trendParam);
  const intervalStats = (start: string, end: string) =>
    params
      .map((p) => {
        const list = filterByInterval(observations.map((o) => ({ ...o, amountMl: 0, category: o.parameter })), start, end).filter((o) => o.parameter === p.id);
        return { p, s: stats(list.map((o) => o.value)) };
      })
      .filter((x) => x.s);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_1fr_1fr_auto] lg:items-end">
          <Field label="Parameter" htmlFor="obs-filter">
            <Select id="obs-filter" value={paramFilter} onChange={(e) => setParamFilter(e.target.value)}>
              <option value="">All parameters</option>
              {params.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" htmlFor="obs-from">
            <DateTimeInput id="obs-from" value={from} onValueChange={setFrom} />
          </Field>
          <Field label="To" htmlFor="obs-to">
            <DateTimeInput id="obs-to" value={to} onValueChange={setTo} />
          </Field>
          <Button onClick={() => setEditing('new')} data-testid="add-observation">
            <Plus /> Add observation
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="compare">Compare intervals</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card className="p-2">
            {filtered.length === 0 ? (
              <EmptyState icon={<Activity />} title="No observations" description="Add an observation or adjust the filters." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date / time</TH>
                    <TH>Parameter</TH>
                    <TH className="text-right">Value</TH>
                    <TH>Threshold check</TH>
                    <TH>Notes</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((o) => {
                    const evals = evaluateThresholds(o, thresholds).filter((e) => e.status !== 'within');
                    return (
                      <TR key={o.id} data-testid="obs-row">
                        <TD className="whitespace-nowrap">{f.dateTime(o.dateTime)}</TD>
                        <TD>{paramDef(o.parameter)?.label ?? o.parameter}</TD>
                        <TD className="tabular text-right font-medium">{displayValue(o, paramDef(o.parameter), settings.temperatureUnit)}</TD>
                        <TD>
                          {evals.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{thresholds.some((t) => t.enabled && t.parameterId === o.parameter) ? 'Within configured threshold' : 'No threshold configured'}</span>
                          ) : (
                            evals.map((e) => (
                              <div key={e.thresholdId} className="text-xs" data-testid="threshold-warning">
                                <Badge variant="warning">{e.status === 'above' ? 'Above threshold' : 'Below threshold'}</Badge>
                                <p className="mt-0.5 text-muted-foreground">{e.thresholdText}</p>
                              </div>
                            ))
                          )}
                        </TD>
                        <TD className="max-w-xs truncate text-xs text-muted-foreground">{o.notes}</TD>
                        <TD className="text-right whitespace-nowrap">
                          <Button size="icon-sm" variant="ghost" aria-label="Edit observation" onClick={() => setEditing(o)}>
                            <Pencil />
                          </Button>
                          <Button size="icon-sm" variant="ghost" aria-label="Delete observation" onClick={() => setDeleting(o)}>
                            <Trash2 />
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card className="p-4">
            <Field label="Parameter" htmlFor="trend-param" className="mb-3 max-w-xs">
              <Select id="trend-param" value={trendParam} onChange={(e) => setTrendParam(e.target.value)}>
                {params.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            {trendData.length === 0 ? (
              <EmptyState title="No data for this parameter in the selected range" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={48} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="value" name={trendDef?.kind === 'bp' ? 'Systolic' : (trendDef?.label ?? 'Value')} stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                    {trendDef?.kind === 'bp' && <Line type="monotone" dataKey="value2" name="Diastolic" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} />}
                    {trendParam !== 'temperature' &&
                      trendThresholds.flatMap((t) =>
                        [t.low, t.high]
                          .filter((v): v is number => v !== null)
                          .map((v, i) => (
                            <ReferenceLine key={`${t.id}-${i}`} y={v} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: `configured ${v}`, fontSize: 10, fill: 'var(--warning)', position: 'insideTopRight' }} />
                          )),
                      )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Dashed lines show user-configured thresholds for transparency. They do not indicate a diagnosis.</p>
          </Card>
        </TabsContent>

        <TabsContent value="compare">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Interval A from" htmlFor="ca-s">
                <DateTimeInput id="ca-s" value={cmp.aStart} onValueChange={(v) => v && setCmp({ ...cmp, aStart: v })} />
              </Field>
              <Field label="Interval A to" htmlFor="ca-e">
                <DateTimeInput id="ca-e" value={cmp.aEnd} onValueChange={(v) => v && setCmp({ ...cmp, aEnd: v })} />
              </Field>
              <Field label="Interval B from" htmlFor="cb-s">
                <DateTimeInput id="cb-s" value={cmp.bStart} onValueChange={(v) => v && setCmp({ ...cmp, bStart: v })} />
              </Field>
              <Field label="Interval B to" htmlFor="cb-e">
                <DateTimeInput id="cb-e" value={cmp.bEnd} onValueChange={(v) => v && setCmp({ ...cmp, bEnd: v })} />
              </Field>
            </div>
            <CompareTable a={intervalStats(cmp.aStart, cmp.aEnd)} b={intervalStats(cmp.bStart, cmp.bEnd)} />
          </Card>
        </TabsContent>
      </Tabs>

      {editing && <ObservationDialog patientId={patient.id} target={editing} params={params} thresholds={thresholds} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this observation?"
        destructive
        confirmLabel="Delete"
        description={deleting ? `${paramDef(deleting.parameter)?.label ?? deleting.parameter} at ${f.dateTime(deleting.dateTime)} will be permanently deleted.` : ''}
        onConfirm={async () => {
          if (deleting) await observationRepo.remove(deleting.id);
          toast.success('Observation deleted.');
        }}
      />
    </div>
  );
}

type StatRow = { p: ObservationParameterDef; s: ReturnType<typeof stats> };

function CompareTable({ a, b }: { a: StatRow[]; b: StatRow[] }) {
  const ids = [...new Set([...a, ...b].map((x) => x.p.id))];
  if (!ids.length) return <EmptyState className="mt-4" title="No observations in either interval" />;
  const fmt = (s: StatRow['s'], d: number) => (s ? `${formatCompact(s.mean, d)} (${formatCompact(s.min, d)}–${formatCompact(s.max, d)}), n=${s.n}` : '—');
  return (
    <div className="mt-4">
      <Table>
        <THead>
          <TR>
            <TH>Parameter</TH>
            <TH>Interval A: mean (min–max)</TH>
            <TH>Interval B: mean (min–max)</TH>
            <TH className="text-right">Δ mean</TH>
          </TR>
        </THead>
        <TBody>
          {ids.map((id) => {
            const ra = a.find((x) => x.p.id === id);
            const rb = b.find((x) => x.p.id === id);
            const p = (ra ?? rb)!.p;
            const delta = ra?.s && rb?.s ? rb.s.mean - ra.s.mean : null;
            return (
              <TR key={id}>
                <TD>
                  {p.label} <span className="text-xs text-muted-foreground">({p.unit})</span>
                </TD>
                <TD className="tabular text-xs">{fmt(ra?.s ?? null, p.decimals)}</TD>
                <TD className="tabular text-xs">{fmt(rb?.s ?? null, p.decimals)}</TD>
                <TD className="tabular text-right">{delta === null ? '—' : `${delta > 0 ? '+' : ''}${formatCompact(delta, p.decimals)}`}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Primary values only (systolic for blood pressure; temperature in °C).</p>
    </div>
  );
}

function ObservationDialog({
  patientId,
  target,
  params,
  thresholds,
  onClose,
}: {
  patientId: string;
  target: ClinicalObservation | 'new';
  params: ObservationParameterDef[];
  thresholds: ObservationThreshold[];
  onClose: () => void;
}) {
  const { settings } = useSettings();
  const isNew = target === 'new';
  const [parameter, setParameter] = useState(isNew ? 'heart-rate' : target.parameter);
  const def = params.find((p) => p.id === parameter);
  const isTemp = parameter === 'temperature';
  const initialValue = isNew ? '' : isTemp && target.unit === '°C' ? String(formatCompact(temperatureToDisplay(target.value, settings.temperatureUnit), 2)) : String(target.value);
  const [value, setValue] = useState(initialValue);
  const [value2, setValue2] = useState(isNew || target.value2 === null ? '' : String(target.value2));
  const [dateTime, setDateTime] = useState<string | null>(isNew ? nowIso() : target.dateTime);
  const [notes, setNotes] = useState(isNew ? '' : target.notes);
  const [submitted, setSubmitted] = useState(false);

  const v = parseNumberInput(value);
  const v2 = parseNumberInput(value2);
  const errors: Record<string, string> = {};
  if (!Number.isFinite(v)) errors.value = 'Enter a numeric value.';
  if (def?.kind === 'bp' && !Number.isFinite(v2)) errors.value2 = 'Enter the diastolic value.';
  if (def?.kind === 'bp' && Number.isFinite(v) && Number.isFinite(v2) && v2 > v) errors.value2 = 'Diastolic is higher than systolic — check the values.';
  if (!dateTime) errors.dateTime = 'Enter the date and time.';
  const storedValue = isTemp ? temperatureFromDisplay(v, settings.temperatureUnit) : v;
  const unit = def?.unit ?? '';
  const preview = Number.isFinite(storedValue) ? evaluateThresholds({ parameter, value: storedValue, value2: def?.kind === 'bp' ? v2 : null, unit }, thresholds).filter((e) => e.status !== 'within') : [];
  const mapEstimate = def?.kind === 'bp' && Number.isFinite(v) && Number.isFinite(v2) ? v2 + (v - v2) / 3 : null;

  async function save() {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    try {
      const payload = { dateTime: dateTime!, parameter, value: storedValue, value2: def?.kind === 'bp' ? v2 : null, unit, notes, meta: isNew ? null : target.meta };
      if (isNew) await observationRepo.add({ patientId, ...payload });
      else await observationRepo.update(target.id, payload);
      toast.success(isNew ? 'Observation recorded.' : 'Observation updated.');
      onClose();
    } catch (e) {
      toast.error('Could not save the observation.', { description: describeError(e) });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={isNew ? 'Add observation' : 'Edit observation'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parameter" htmlFor="ob-param" className="sm:col-span-2">
            <Select id="ob-param" value={parameter} onChange={(e) => setParameter(e.target.value)} disabled={!isNew}>
              {params.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.id === 'temperature' ? `°${settings.temperatureUnit}` : p.unit})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={def?.kind === 'bp' ? 'Systolic (mmHg)' : `Value (${isTemp ? `°${settings.temperatureUnit}` : unit})`} htmlFor="ob-value" required error={submitted ? errors.value : undefined}>
            <Input id="ob-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          {def?.kind === 'bp' && (
            <Field label="Diastolic (mmHg)" htmlFor="ob-value2" required error={submitted ? errors.value2 : undefined}>
              <Input id="ob-value2" inputMode="decimal" value={value2} onChange={(e) => setValue2(e.target.value)} />
            </Field>
          )}
          <Field label="Date and time" htmlFor="ob-time" required error={submitted ? errors.dateTime : undefined} className="sm:col-span-2">
            <DateTimeInput id="ob-time" value={dateTime} onValueChange={setDateTime} />
          </Field>
          <Field label="Notes" htmlFor="ob-notes" className="sm:col-span-2">
            <Textarea id="ob-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {mapEstimate !== null && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Calculated MAP estimate (DBP + ⅓ × pulse pressure): {formatCompact(mapEstimate, 0)} mmHg — informational; record a measured MAP separately if available.
            </p>
          )}
          {preview.map((p) => (
            <Alert key={p.thresholdId} variant="warning" className="sm:col-span-2">
              {p.message} ({p.thresholdText})
            </Alert>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} data-testid="save-observation">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
