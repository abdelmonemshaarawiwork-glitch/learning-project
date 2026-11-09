import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, Download, FileText, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { patientAgeYears } from '@/components/common/PatientContextBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { DefinitionList, StatCard } from '@/components/ui/stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { INTAKE_LABEL, MECHANISM_OPTIONS, OUTPUT_LABEL, SEX_OPTIONS, TIMELINE_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { buildBackup } from '@/database/backup';
import { countRelatedRecords, deletePatient, type RelatedCounts } from '@/database/repositories/patients';
import { AssessmentList } from '@/features/burn-assessment/components/AssessmentList';
import { usePatientAssessments } from '@/features/burn-assessment/queries';
import { computeTotals } from '@/engines/fluid-balance';
import { useFormatters } from '@/hooks/useFormatters';
import { useObservationParameters } from '@/hooks/useSettings';
import { useUiStore } from '@/stores/ui';
import { downloadBlob, safeFilename } from '@/utils/download';
import { describeError } from '@/utils/logger';
import { formatCompact } from '@/utils/rounding';

export default function PatientProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const f = useFormatters();
  const params = useObservationParameters();
  const setActive = useUiStore((s) => s.setActivePatientId);
  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  const assessments = usePatientAssessments(id);
  const data = useLiveQuery(async () => {
    const [intake, output, obs, events, calcs] = await Promise.all([
      db.intakeRecords.where('patientId').equals(id).toArray(),
      db.outputRecords.where('patientId').equals(id).toArray(),
      db.clinicalObservations.where('patientId').equals(id).toArray(),
      db.timelineEvents.where('patientId').equals(id).toArray(),
      db.fluidCalculations.where('patientId').equals(id).toArray(),
    ]);
    return { intake, output, obs, events, calcs };
  }, [id]);
  const [deleteCounts, setDeleteCounts] = useState<RelatedCounts | null>(null);

  if (patient === undefined) return <LoadingState />;
  if (patient === null || !patient) return <EmptyState title="Patient not found" action={<Link to="/patients" className="text-primary underline">Back to patients</Link>} />;

  const age = patientAgeYears(patient);
  const totals = data ? computeTotals(patient.id, data.intake, data.output) : null;
  const latest = assessments?.find((a) => !a.supersededById);
  const paramLabel = (pid: string) => params.find((p) => p.id === pid)?.label ?? pid;

  async function exportData() {
    try {
      const backup = await buildBackup({ scope: 'patients', patientIds: [patient!.id] });
      await downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `burnmatrix-patient-${safeFilename(patient!.code)}-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('Patient data exported.', { description: 'The file contains identifiable data. Store it securely.' });
    } catch (e) {
      toast.error('Export failed.', { description: describeError(e) });
    }
  }

  return (
    <>
      <PageHeader
        title={patient.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {patient.code}
            </Badge>
            <Badge variant={patient.status === 'admitted' ? 'primary' : 'neutral'}>{patient.status}</Badge>
            <span>Admitted {f.dateTime(patient.admissionDate)}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/patients/${patient.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button asChild onClick={() => setActive(patient.id)}>
              <Link to={`/assessment?patient=${patient.id}`}>
                <ClipboardList /> New assessment
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/reports?patient=${patient.id}`}>
                <FileText /> Report
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void exportData()}>
              <Download /> Export data
            </Button>
            <Button variant="destructive-outline" onClick={async () => setDeleteCounts(await countRelatedRecords(patient.id))}>
              <Trash2 /> Delete
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Age" value={age.age ?? '—'} hint={age.source === 'date-of-birth' ? 'From date of birth' : age.source === 'recorded-age' ? 'Recorded age' : 'Unknown'} />
        <StatCard label="Weight" value={f.weight(patient.weightKg)} hint={patient.heightCm ? `Height ${f.height(patient.heightCm)}` : undefined} />
        <StatCard label="Latest TBSA" value={latest ? f.tbsa(latest.tbsaTotal) : '—'} hint={latest ? f.dateTime(latest.assessmentDate) : 'No assessment'} tone={latest?.tbsaIndeterminate ? 'warning' : 'default'} />
        <StatCard label="Net fluid balance" value={totals ? `${formatCompact(totals.netMl, 0)} mL` : '—'} hint="All recorded intake − output" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assessments">Assessments ({assessments?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="fluids">Fluid calculations ({data?.calcs.length ?? 0})</TabsTrigger>
          <TabsTrigger value="io">Intake/Output</TabsTrigger>
          <TabsTrigger value="observations">Observations ({data?.obs.length ?? 0})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({data?.events.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Demographics &amp; injury</CardTitle>
              </CardHeader>
              <CardContent>
                <DefinitionList
                  items={[
                    { label: 'Date of birth', value: patient.dateOfBirth ? f.date(patient.dateOfBirth) : '' },
                    { label: 'Sex', value: SEX_OPTIONS.find((s) => s.id === patient.sex)?.label },
                    { label: 'Injury date/time', value: patient.injuryDate ? f.dateTime(patient.injuryDate) : '' },
                    { label: 'Mechanism', value: [MECHANISM_OPTIONS.find((m) => m.id === patient.mechanism)?.label, patient.mechanismDetails].filter(Boolean).join(' — ') },
                    { label: 'Admission diagnosis', value: patient.diagnosis },
                    { label: 'Record created', value: f.dateTime(patient.createdAt) },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                <DefinitionList
                  className="sm:grid-cols-1"
                  items={[
                    { label: 'Drug allergies', value: patient.allergies },
                    { label: 'Current medications', value: patient.medications },
                    { label: 'Medical history', value: patient.medicalHistory },
                    { label: 'Surgical history', value: patient.surgicalHistory },
                    { label: 'Clinical notes', value: patient.notes },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assessments">
          <Card className="p-2">{assessments && <AssessmentList assessments={assessments} patientId={patient.id} />}</Card>
        </TabsContent>

        <TabsContent value="fluids">
          <Card className="p-2">
            {!data?.calcs.length ? (
              <EmptyState title="No saved fluid calculations" action={<Link className="text-sm text-primary underline" to={`/fluids?patient=${patient.id}`}>Open fluid management</Link>} />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Calculated</TH>
                    <TH>Protocol</TH>
                    <TH>Weight</TH>
                    <TH>TBSA</TH>
                    <TH>Estimated volume</TH>
                    <TH>Administered</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...data.calcs]
                    .sort((a, b) => b.calculationDate.localeCompare(a.calculationDate))
                    .map((c) => (
                      <TR key={c.id}>
                        <TD className="whitespace-nowrap">{f.dateTime(c.calculationDate)}</TD>
                        <TD>
                          {c.protocolName} v{c.protocolVersion}
                        </TD>
                        <TD className="tabular">{formatCompact(c.inputData.weightKg, 1)} kg</TD>
                        <TD className="tabular">{formatCompact(c.inputData.tbsaPercent, 1)}%</TD>
                        <TD className="tabular font-medium">{f.ml(c.resultData.totalVolumeMl)}</TD>
                        <TD className="tabular">{f.ml(c.resultData.administeredMl)}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="io">
          <div className="mb-3 grid grid-cols-3 gap-3">
            <StatCard label="Total intake" value={f.ml(totals?.intakeMl)} />
            <StatCard label="Total output" value={f.ml(totals?.outputMl)} />
            <StatCard label="Net balance" value={f.ml(totals?.netMl)} />
          </div>
          <Card className="p-2">
            {!data || data.intake.length + data.output.length === 0 ? (
              <EmptyState title="No intake or output recorded" action={<Link className="text-sm text-primary underline" to={`/intake-output?patient=${patient.id}`}>Open intake &amp; output</Link>} />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Time</TH>
                    <TH>Type</TH>
                    <TH>Category</TH>
                    <TH>Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...data.intake.map((r) => ({ ...r, kind: 'Intake', label: INTAKE_LABEL[r.category] })), ...data.output.map((r) => ({ ...r, kind: 'Output', label: OUTPUT_LABEL[r.category] }))]
                    .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
                    .slice(0, 25)
                    .map((r) => (
                      <TR key={r.id}>
                        <TD className="whitespace-nowrap">{f.dateTime(r.dateTime)}</TD>
                        <TD>{r.kind}</TD>
                        <TD>{r.label}</TD>
                        <TD className="tabular">{f.ml(r.amountMl)}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="observations">
          <Card className="p-2">
            {!data?.obs.length ? (
              <EmptyState title="No observations recorded" action={<Link className="text-sm text-primary underline" to={`/monitoring?patient=${patient.id}`}>Open clinical monitoring</Link>} />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Time</TH>
                    <TH>Parameter</TH>
                    <TH>Value</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...data.obs]
                    .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
                    .slice(0, 30)
                    .map((o) => (
                      <TR key={o.id}>
                        <TD className="whitespace-nowrap">{f.dateTime(o.dateTime)}</TD>
                        <TD>{paramLabel(o.parameter)}</TD>
                        <TD className="tabular">
                          {formatCompact(o.value, 2)}
                          {o.value2 !== null ? `/${formatCompact(o.value2, 2)}` : ''} {o.unit}
                        </TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="p-4">
            {!data?.events.length ? (
              <EmptyState title="No timeline events" />
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {[...data.events]
                  .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
                  .map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary ring-4 ring-card" />
                      <p className="text-xs text-muted-foreground">{f.dateTime(e.dateTime)}</p>
                      <p className="text-sm font-medium">{TIMELINE_LABEL[e.eventType]}</p>
                      <p className="text-sm text-muted-foreground">{e.description}</p>
                    </li>
                  ))}
              </ol>
            )}
            <Link to={`/timeline?patient=${patient.id}`} className="mt-4 inline-block text-sm text-primary underline">
              Open full timeline
            </Link>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteCounts !== null}
        onOpenChange={(o) => !o && setDeleteCounts(null)}
        title={`Delete patient ${patient.code}?`}
        destructive
        requireText={patient.code}
        confirmLabel="Delete permanently"
        description="This permanently deletes the patient and ALL linked records from this device. It cannot be undone. Export the patient's data first if you may need it."
        consequences={
          deleteCounts
            ? [
                `${deleteCounts.assessments} assessment(s) and ${deleteCounts.assessmentRegions} regional entries`,
                `${deleteCounts.fluidCalculations} fluid calculation(s)`,
                `${deleteCounts.intakeRecords} intake and ${deleteCounts.outputRecords} output record(s)`,
                `${deleteCounts.clinicalObservations} observation(s)`,
                `${deleteCounts.timelineEvents} timeline event(s)`,
                `${deleteCounts.clinicalPhotos} clinical photo(s)`,
              ]
            : []
        }
        onConfirm={async () => {
          try {
            await deletePatient(patient.id);
            setActive(null);
            toast.success('Patient deleted.');
            navigate('/patients');
          } catch (e) {
            toast.error('Delete failed.', { description: describeError(e) });
          }
        }}
      />
    </>
  );
}
