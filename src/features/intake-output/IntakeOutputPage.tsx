import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, Beaker, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { z } from 'zod';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { INTAKE_CATEGORIES, INTAKE_LABEL, OUTPUT_CATEGORIES, OUTPUT_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { intakeRepo, outputRepo } from '@/database/repositories/records';
import { bucketByDay, bucketByHour, computeTotals, filterByInterval, totalsByCategory } from '@/engines/fluid-balance';
import { useFormatters } from '@/hooks/useFormatters';
import type { IntakeRecord, OutputRecord, Patient } from '@/types/domain';
import { addHoursIso, isValidIso, nowIso } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { formatNumber } from '@/utils/rounding';
import { startOfDay } from 'date-fns';

type Kind = 'intake' | 'output';
type AnyRecord = (IntakeRecord & { kind: 'intake' }) | (OutputRecord & { kind: 'output' });

const recordFormSchema = z.object({
  kind: z.enum(['intake', 'output']),
  category: z.string().min(1, 'Choose a category.'),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter the amount in mL.')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Amount must be 0 mL or more.'),
  dateTime: z.string().nullable().refine((v) => isValidIso(v), 'Enter the date and time.'),
  source: z.string().max(500),
  notes: z.string().max(5000),
});
type RecordFormValues = z.infer<typeof recordFormSchema>;

export type IntervalPreset = 'last-24h' | 'last-72h' | 'today' | 'since-admission' | 'all' | 'custom';

export function presetInterval(preset: IntervalPreset, patient: Patient, now = nowIso()): { start: string | null; end: string | null } {
  switch (preset) {
    case 'last-24h':
      return { start: addHoursIso(now, -24), end: addHoursIso(now, 1 / 60) };
    case 'last-72h':
      return { start: addHoursIso(now, -72), end: addHoursIso(now, 1 / 60) };
    case 'today':
      return { start: startOfDay(new Date()).toISOString(), end: addHoursIso(now, 1 / 60) };
    case 'since-admission':
      return { start: patient.admissionDate, end: addHoursIso(now, 1 / 60) };
    default:
      return { start: null, end: null };
  }
}

export function IntervalPicker({
  patient,
  preset,
  setPreset,
  custom,
  setCustom,
}: {
  patient: Patient;
  preset: IntervalPreset;
  setPreset: (p: IntervalPreset) => void;
  custom: { start: string | null; end: string | null };
  setCustom: (c: { start: string | null; end: string | null }) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Interval" htmlFor="interval">
        <Select id="interval" value={preset} onChange={(e) => setPreset(e.target.value as IntervalPreset)} className="sm:w-52">
          <option value="last-24h">Last 24 hours</option>
          <option value="last-72h">Last 72 hours</option>
          <option value="today">Today (since midnight)</option>
          <option value="since-admission">Since admission</option>
          <option value="all">All records</option>
          <option value="custom">Custom…</option>
        </Select>
      </Field>
      {preset === 'custom' && (
        <>
          <Field label="From" htmlFor="int-start">
            <DateTimeInput id="int-start" value={custom.start ?? patient.admissionDate} onValueChange={(v) => setCustom({ ...custom, start: v })} />
          </Field>
          <Field label="To (exclusive)" htmlFor="int-end">
            <DateTimeInput id="int-end" value={custom.end ?? nowIso()} onValueChange={(v) => setCustom({ ...custom, end: v })} />
          </Field>
        </>
      )}
    </div>
  );
}

export default function IntakeOutputPage() {
  const active = useActivePatient();
  return (
    <>
      <PageHeader
        title="Intake & output"
        description="Hourly fluid intake and output with daily totals and cumulative balance. Net balance = total intake − total output."
        actions={
          <Button variant="outline" asChild>
            <Link to={`/intake-output/urine-output${active.patient ? `?patient=${active.patient.id}` : ''}`}>
              <Beaker /> Urine output calculator
            </Link>
          </Button>
        }
      />
      <PatientContextBar {...active} />
      {active.patient && <IOWorkspace key={active.patient.id} patient={active.patient} />}
    </>
  );
}

function IOWorkspace({ patient }: { patient: Patient }) {
  const f = useFormatters();
  const intake = useLiveQuery(() => db.intakeRecords.where('patientId').equals(patient.id).toArray(), [patient.id]);
  const output = useLiveQuery(() => db.outputRecords.where('patientId').equals(patient.id).toArray(), [patient.id]);
  const [preset, setPreset] = useState<IntervalPreset>('last-24h');
  const [custom, setCustom] = useState<{ start: string | null; end: string | null }>({ start: patient.admissionDate, end: nowIso() });
  const [editing, setEditing] = useState<AnyRecord | 'new-intake' | 'new-output' | null>(null);
  const [deleting, setDeleting] = useState<AnyRecord | null>(null);

  const interval = preset === 'custom' ? custom : preset === 'all' ? { start: null, end: null } : presetInterval(preset, patient);

  const data = useMemo(() => {
    if (!intake || !output) return null;
    const fi = filterByInterval(intake, interval.start, interval.end);
    const fo = filterByInterval(output, interval.start, interval.end);
    const all = [...intake, ...output].map((r) => r.dateTime).sort();
    const start = interval.start ?? all[0] ?? patient.admissionDate;
    const end = interval.end ?? addHoursIso(all.at(-1) ?? nowIso(), 1);
    return {
      fi,
      fo,
      totals: computeTotals(patient.id, fi, fo),
      hourly: bucketByHour(patient.id, fi, fo, start, end),
      daily: bucketByDay(patient.id, fi, fo, start, end),
      byIntake: totalsByCategory(fi),
      byOutput: totalsByCategory(fo),
      records: [...fi.map((r) => ({ ...r, kind: 'intake' as const })), ...fo.map((r) => ({ ...r, kind: 'output' as const }))].sort((a, b) => b.dateTime.localeCompare(a.dateTime)) as AnyRecord[],
    };
  }, [intake, output, interval.start, interval.end, patient.id, patient.admissionDate]);

  if (!data) return <LoadingState />;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <IntervalPicker patient={patient} preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} />
          <div className="flex gap-2">
            <Button onClick={() => setEditing('new-intake')} data-testid="add-intake">
              <Plus /> Add intake
            </Button>
            <Button variant="outline" onClick={() => setEditing('new-output')} data-testid="add-output">
              <Plus /> Add output
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="io-totals">
        <StatCard label="Total intake" value={<span data-testid="total-intake">{formatNumber(data.totals.intakeMl)} mL</span>} hint={`${data.fi.length} record(s)`} />
        <StatCard label="Total output" value={<span data-testid="total-output">{formatNumber(data.totals.outputMl)} mL</span>} hint={`${data.fo.length} record(s)`} />
        <StatCard
          label="Net balance"
          value={<span data-testid="net-balance">{data.totals.netMl > 0 ? '+' : ''}{formatNumber(data.totals.netMl)} mL</span>}
          hint="Intake − output for the interval"
          tone={data.totals.netMl < 0 ? 'warning' : 'default'}
        />
      </div>

      <Tabs defaultValue="records">
        <TabsList>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="hourly">Hourly</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="categories">By category</TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          <Card className="p-2">
            {data.records.length === 0 ? (
              <EmptyState icon={<ArrowLeftRight />} title="No records in this interval" description="Add intake or output, or widen the interval." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date / time</TH>
                    <TH>Type</TH>
                    <TH>Category</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Details</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {data.records.map((r) => (
                    <TR key={r.id} data-testid="io-row">
                      <TD className="whitespace-nowrap">{f.dateTime(r.dateTime)}</TD>
                      <TD>
                        <Badge variant={r.kind === 'intake' ? 'primary' : 'warning'}>{r.kind === 'intake' ? 'Intake' : 'Output'}</Badge>
                      </TD>
                      <TD>{r.kind === 'intake' ? INTAKE_LABEL[r.category] : OUTPUT_LABEL[r.category]}</TD>
                      <TD className="tabular text-right font-medium">{formatNumber(r.amountMl)} mL</TD>
                      <TD className="max-w-xs text-xs text-muted-foreground">
                        {r.source}
                        {r.notes && <p className="truncate">{r.notes}</p>}
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        <Button size="icon-sm" variant="ghost" aria-label="Edit record" onClick={() => setEditing(r)}>
                          <Pencil />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Delete record" onClick={() => setDeleting(r)}>
                          <Trash2 />
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="hourly">
          <BucketTable buckets={data.hourly} label="Hour" fmt={(b) => `${f.date(b.start)} ${f.time(b.start)}`} />
        </TabsContent>
        <TabsContent value="daily">
          <BucketTable buckets={data.daily} label="Day" fmt={(b) => f.date(b.start)} />
        </TabsContent>
        <TabsContent value="charts">
          <Card className="p-4">
            <p className="mb-2 text-sm font-medium">Hourly intake and output with cumulative net balance</p>
            {data.hourly.length === 0 ? (
              <EmptyState title="No data to chart" />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.hourly.map((b) => ({ label: f.time(b.start), intake: b.intakeMl, output: -b.outputMl, net: b.cumulativeNetMl }))}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} minTickGap={16} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={60} />
                    <Tooltip
                      formatter={(v, name) => [`${formatNumber(Math.abs(Number(v)))} mL`, String(name)]}
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="intake" name="Intake" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="output" name="Output (shown below 0)" fill="var(--chart-2)" radius={[0, 0, 3, 3]} />
                    <Line dataKey="net" name="Cumulative net" stroke="var(--chart-3)" strokeWidth={2} dot={false} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="categories">
          <div className="grid gap-4 md:grid-cols-2">
            <CategoryCard title="Intake by category" totals={data.byIntake} labels={INTAKE_LABEL} />
            <CategoryCard title="Output by category" totals={data.byOutput} labels={OUTPUT_LABEL} />
          </div>
        </TabsContent>
      </Tabs>

      {editing && <RecordDialog patientId={patient.id} target={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this record?"
        destructive
        confirmLabel="Delete record"
        description={deleting ? `${deleting.kind === 'intake' ? 'Intake' : 'Output'} of ${formatNumber(deleting.amountMl)} mL at ${f.dateTime(deleting.dateTime)} will be permanently deleted. Totals and balances will be recalculated.` : ''}
        onConfirm={async () => {
          if (!deleting) return;
          await (deleting.kind === 'intake' ? intakeRepo.remove(deleting.id) : outputRepo.remove(deleting.id));
          toast.success('Record deleted.');
        }}
      />
    </div>
  );
}

function CategoryCard({ title, totals, labels }: { title: string; totals: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(totals);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y text-sm">
            {entries.map(([k, v]) => (
              <li key={k} className="flex justify-between py-2">
                <span>{labels[k] ?? k}</span>
                <span className="tabular font-medium">{formatNumber(v)} mL</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function BucketTable({ buckets, label, fmt }: { buckets: ReturnType<typeof bucketByHour>; label: string; fmt: (b: ReturnType<typeof bucketByHour>[number]) => string }) {
  const [onlyNonEmpty, setOnlyNonEmpty] = useState(true);
  const rows = onlyNonEmpty ? buckets.filter((b) => b.intakeMl !== 0 || b.outputMl !== 0) : buckets;
  return (
    <Card className="p-2">
      <label className="flex items-center gap-2 px-2 py-2 text-sm">
        <input type="checkbox" checked={onlyNonEmpty} onChange={(e) => setOnlyNonEmpty(e.target.checked)} className="accent-[var(--primary)]" />
        Hide periods without records
      </label>
      {rows.length === 0 ? (
        <EmptyState title="No records in this interval" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{label}</TH>
              <TH className="text-right">Intake</TH>
              <TH className="text-right">Output</TH>
              <TH className="text-right">Balance</TH>
              <TH className="text-right">Cumulative intake</TH>
              <TH className="text-right">Cumulative output</TH>
              <TH className="text-right">Cumulative balance</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((b) => (
              <TR key={b.start}>
                <TD className="whitespace-nowrap">{fmt(b)}</TD>
                <TD className="tabular text-right">{formatNumber(b.intakeMl)}</TD>
                <TD className="tabular text-right">{formatNumber(b.outputMl)}</TD>
                <TD className="tabular text-right font-medium">{formatNumber(b.netMl)}</TD>
                <TD className="tabular text-right">{formatNumber(b.cumulativeIntakeMl)}</TD>
                <TD className="tabular text-right">{formatNumber(b.cumulativeOutputMl)}</TD>
                <TD className="tabular text-right font-medium">{formatNumber(b.cumulativeNetMl)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <p className="px-2 py-2 text-xs text-muted-foreground">All values in mL. Periods use the device’s local time zone; cumulative values start at the beginning of the selected interval.</p>
    </Card>
  );
}

function RecordDialog({ patientId, target, onClose }: { patientId: string; target: AnyRecord | 'new-intake' | 'new-output'; onClose: () => void }) {
  const isNew = typeof target === 'string';
  const kind: Kind = isNew ? (target === 'new-intake' ? 'intake' : 'output') : target.kind;
  const form = useForm<RecordFormValues>({
    resolver: zodResolver(recordFormSchema),
    defaultValues: isNew
      ? { kind, category: kind === 'intake' ? 'iv-crystalloid' : 'urine', amount: '', dateTime: nowIso(), source: '', notes: '' }
      : { kind, category: target.category, amount: String(target.amountMl), dateTime: target.dateTime, source: target.source, notes: target.notes },
  });
  const e = form.formState.errors;
  const categories = kind === 'intake' ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES;

  const submit = form.handleSubmit(async (v) => {
    try {
      const payload = { dateTime: v.dateTime!, amountMl: Number(v.amount), source: v.source, notes: v.notes };
      if (kind === 'intake') {
        const category = v.category as IntakeRecord['category'];
        if (isNew) await intakeRepo.add({ patientId, category, ...payload });
        else await intakeRepo.update(target.id, { category, ...payload });
      } else {
        const category = v.category as OutputRecord['category'];
        if (isNew) await outputRepo.add({ patientId, category, ...payload });
        else await outputRepo.update(target.id, { category, ...payload });
      }
      toast.success(isNew ? 'Record added.' : 'Record updated.');
      onClose();
    } catch (err) {
      toast.error('Could not save the record.', { description: describeError(err) });
    }
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${isNew ? 'Add' : 'Edit'} ${kind}`} description="Volumes are recorded in millilitres (mL).">
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="rec-cat" error={e.category?.message}>
            <Select id="rec-cat" {...form.register('category')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (mL)" htmlFor="rec-amount" required error={e.amount?.message}>
            <Input id="rec-amount" inputMode="decimal" aria-invalid={!!e.amount} {...form.register('amount')} />
          </Field>
          <Field label="Date and time" htmlFor="rec-time" required error={e.dateTime?.message} className="sm:col-span-2">
            <Controller control={form.control} name="dateTime" render={({ field }) => <DateTimeInput id="rec-time" value={field.value} onValueChange={field.onChange} />} />
          </Field>
          <Field label="Source / details (optional)" htmlFor="rec-src" className="sm:col-span-2">
            <Input id="rec-src" placeholder={kind === 'intake' ? "e.g. Lactated Ringer's, route" : 'e.g. catheter, drain site'} {...form.register('source')} />
          </Field>
          <Field label="Notes" htmlFor="rec-notes" className="sm:col-span-2">
            <Textarea id="rec-notes" rows={2} {...form.register('notes')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting} data-testid="save-record">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
