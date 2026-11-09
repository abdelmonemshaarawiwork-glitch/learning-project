import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, ArrowRight, BedDouble, ClipboardList, Droplets, Flag, History, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { subDays, startOfDay, format } from 'date-fns';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { StatCard } from '@/components/ui/stat';
import { INTAKE_LABEL, METHOD_LABEL, OUTPUT_LABEL, TIMELINE_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { checkDatasetUsable } from '@/engines/integrity';
import type { UrineOutputTargetData } from '@/engines/tbsa/types';
import { latestAssessmentByPatient } from '@/features/burn-assessment/queries';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import { addHoursIso, nowIso } from '@/utils/dates';
import { formatCompact, formatNumber } from '@/utils/rounding';
import { computeAttentionFlags } from './attention';

const tooltipStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

export default function DashboardPage() {
  const f = useFormatters();
  const { settings } = useSettings();
  const data = useLiveQuery(async () => {
    const [patients, assessments, events, intake, output, observations, datasets, protocols] = await Promise.all([
      db.patients.toArray(),
      db.assessments.toArray(),
      db.timelineEvents.orderBy('dateTime').reverse().limit(200).toArray(),
      db.intakeRecords.toArray(),
      db.outputRecords.toArray(),
      db.clinicalObservations.toArray(),
      db.referenceDatasets.toArray(),
      db.fluidProtocols.toArray(),
    ]);
    const urine = datasets.find((d) => d.kind === 'urine-output-targets' && d.status === 'verified');
    const verifiedUrineTargets = urine && (await checkDatasetUsable(urine)).usable ? (urine.data as UrineOutputTargetData).targets : [];
    return { patients, assessments, events, intake, output, observations, datasets, protocols, verifiedUrineTargets };
  }, []);

  if (!data) return <LoadingState />;

  const now = nowIso();
  const patientById = new Map(data.patients.map((p) => [p.id, p]));
  const admitted = data.patients.filter((p) => p.status === 'admitted');
  const latest = latestAssessmentByPatient(data.assessments);
  const recentAssessments = [...data.assessments].sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate)).slice(0, 6);
  const recentEvents = data.events.slice(0, 6);
  const fluidRecords = [...data.intake.map((r) => ({ ...r, kind: 'Intake' as const, label: INTAKE_LABEL[r.category] })), ...data.output.map((r) => ({ ...r, kind: 'Output' as const, label: OUTPUT_LABEL[r.category] }))]
    .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
    .slice(0, 6);
  const last24 = addHoursIso(now, -24);
  const flags = computeAttentionFlags({
    config: settings.attentionFlags,
    patients: data.patients,
    latestAssessment: latest,
    intake: data.intake,
    output: data.output,
    observations: data.observations,
    thresholds: settings.observationThresholds,
    verifiedUrineTargets: data.verifiedUrineTargets,
    datasets: data.datasets,
    protocols: data.protocols,
    now,
  });

  // Charts use real database contents only.
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(subDays(new Date(), 13 - i)));
  const activity = days.map((d) => {
    const s = d.toISOString();
    const e = addHoursIso(s, 24);
    const count = (list: { dateTime?: string; assessmentDate?: string }[]) => list.filter((x) => { const t = x.dateTime ?? x.assessmentDate ?? ''; return t >= s && t < e; }).length;
    return {
      day: format(d, 'dd MMM'),
      assessments: count(data.assessments),
      fluid: count(data.intake) + count(data.output),
      observations: count(data.observations),
    };
  });
  const tbsaChart = admitted
    .filter((p) => latest.has(p.id))
    .map((p) => ({ patient: p.code, tbsa: latest.get(p.id)!.tbsaTotal, indeterminate: latest.get(p.id)!.tbsaIndeterminate }))
    .sort((a, b) => b.tbsa - a.tbsa)
    .slice(0, 12);
  const hasActivity = activity.some((a) => a.assessments || a.fluid || a.observations);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of patients and recent clinical records stored on this device."
        actions={
          <>
            <Button asChild>
              <Link to="/patients/new">
                <UserPlus /> Add patient
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/assessment">
                <ClipboardList /> New assessment
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/fluids">
                <Droplets /> Fluid management
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Registered patients" value={<span data-testid="stat-total">{data.patients.length}</span>} icon={<Users />} />
        <StatCard label="Currently admitted" value={<span data-testid="stat-admitted">{admitted.length}</span>} icon={<BedDouble />} />
        <StatCard label="Assessments (24 h)" value={data.assessments.filter((a) => a.assessmentDate >= last24).length} icon={<ClipboardList />} hint={`${data.assessments.length} total`} />
        <StatCard label="Attention flags" value={flags.length} icon={<Flag />} tone={flags.some((x) => x.tone === 'warning') ? 'warning' : 'default'} />
      </div>

      {data.patients.length > 0 &&
        settings.backupReminderDays !== null &&
        (!settings.lastBackupAt || settings.lastBackupAt < addHoursIso(now, -24 * settings.backupReminderDays)) && (
          <Alert variant="warning" className="mb-5" title={settings.lastBackupAt ? `No full backup in the last ${settings.backupReminderDays} day(s)` : 'No full backup has been made on this device'}>
            Data is stored only in this browser. <Link to="/settings?tab=backup">Export a backup</Link> to protect against data loss.
          </Alert>
        )}

      {data.patients.length === 0 && (
        <EmptyState
          className="mb-5"
          icon={<Users />}
          title="Welcome to BURN TOOL"
          description="No patients are registered on this device yet. Before calculating, review and verify the clinical reference datasets and fluid protocols in Settings."
          action={
            <>
              <Button asChild>
                <Link to="/patients/new">
                  <UserPlus /> Add the first patient
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/settings?tab=references">
                  <ShieldAlert /> Clinical references
                </Link>
              </Button>
            </>
          }
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Clinical activity — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasActivity ? (
              <EmptyState title="No records in the last 14 days" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={32} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="assessments" name="Assessments" stackId="a" fill="var(--chart-2)" />
                    <Bar dataKey="fluid" name="Intake/output records" stackId="a" fill="var(--chart-1)" />
                    <Bar dataKey="observations" name="Observations" stackId="a" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attention flags</CardTitle>
          </CardHeader>
          <CardContent>
            {flags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flags with the current configuration.</p>
            ) : (
              <ul className="space-y-2" data-testid="attention-flags">
                {flags.slice(0, 12).map((fl) => (
                  <li key={fl.id}>
                    <Link to={fl.link} className={`block rounded-xl border p-3 text-sm hover:bg-muted ${fl.tone === 'warning' ? 'border-warning/40' : ''}`}>
                      {fl.patientLabel && <p className="text-xs font-semibold">{fl.patientLabel}</p>}
                      <p>{fl.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{fl.rule}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/settings?tab=flags" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Configure attention flags
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest TBSA — admitted patients</CardTitle>
          </CardHeader>
          <CardContent>
            {tbsaChart.length === 0 ? (
              <EmptyState title="No assessed admitted patients" />
            ) : (
              <div style={{ height: Math.max(160, tbsaChart.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tbsaChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} unit="%" />
                    <YAxis type="category" dataKey="patient" width={92} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${formatCompact(Number(v), 1)}%`} />
                    <Bar dataKey="tbsa" name="TBSA" stackId="t" fill="var(--chart-2)" />
                    <Bar dataKey="indeterminate" name="Indeterminate (not in TBSA)" stackId="t" fill="var(--chart-4)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent assessments</CardTitle>
            <ClipboardList className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentAssessments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y">
                {recentAssessments.map((a) => (
                  <li key={a.id}>
                    <Link to={`/assessment/${a.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{patientById.get(a.patientId)?.name ?? '—'}</span>
                        <span className="text-xs text-muted-foreground">
                          {f.dateTime(a.assessmentDate)} · {METHOD_LABEL[a.method]}
                        </span>
                      </span>
                      <Badge variant={a.tbsaIndeterminate > 0 ? 'warning' : 'primary'}>{formatCompact(a.tbsaTotal, 1)}%</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent clinical events</CardTitle>
            <History className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y">
                {recentEvents.map((e) => (
                  <li key={e.id} className="py-2 text-sm">
                    <p className="font-medium">
                      {TIMELINE_LABEL[e.eventType]} <span className="font-normal text-muted-foreground">· {patientById.get(e.patientId)?.name ?? '—'}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.dateTime(e.dateTime)} — {e.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent fluid records</CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {fluidRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y">
                {fluidRecords.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {r.label} <span className="font-normal text-muted-foreground">· {patientById.get(r.patientId)?.name ?? '—'}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{f.dateTime(r.dateTime)}</span>
                    </span>
                    <Badge variant={r.kind === 'Intake' ? 'primary' : 'warning'}>
                      {r.kind === 'Output' ? '−' : '+'}
                      {formatNumber(r.amountMl)} mL
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/intake-output" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Intake &amp; output <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
