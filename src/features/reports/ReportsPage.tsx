import { Download, FileDown, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DisclaimerNote } from '@/components/common/ClinicalNotices';
import { DateTimeInput } from '@/components/common/DateTimeInput';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Checkbox, Select } from '@/components/ui/input';
import { METHOD_LABEL } from '@/constants/clinical';
import { buildBackup } from '@/database/backup';
import { usePatientAssessments } from '@/features/burn-assessment/queries';
import { useFormatters } from '@/hooks/useFormatters';
import { cn } from '@/utils/cn';
import { downloadBlob } from '@/utils/download';
import { describeError } from '@/utils/logger';
import { formatCompact } from '@/utils/rounding';
import { REPORT_TYPES, type ReportType } from './reportTypes';

export default function ReportsPage() {
  const active = useActivePatient();
  const f = useFormatters();
  const [type, setType] = useState<ReportType>('complete');
  const [assessmentId, setAssessmentId] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const assessments = usePatientAssessments(active.patient?.id);
  const meta = REPORT_TYPES.find((t) => t.id === type)!;

  async function run(mode: 'download' | 'print') {
    if (!active.patient) return;
    setBusy(true);
    try {
      const { runReport } = await import('./pdf/runReport');
      await runReport(
        {
          type,
          patientId: active.patient.id,
          assessmentId: meta.needsAssessment && assessmentId ? assessmentId : undefined,
          range: { start, end },
        },
        mode,
      );
      toast.success(mode === 'print' ? 'Report opened for printing.' : 'Report downloaded.', { description: 'The PDF contains patient data. Store and share it securely.' });
    } catch (e) {
      toast.error('Report generation failed.', { description: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Reports" description="Professional PDF reports for one patient at a time. Reports never include other patients' data." />
      <PatientContextBar {...active} />
      {active.patient && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Report type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Report type">
                {REPORT_TYPES.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={type === t.id}
                    onClick={() => setType(t.id)}
                    className={cn('flex gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted', type === t.id && 'border-primary bg-accent ring-1 ring-primary')}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">{i + 1}</span>
                    <span>
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {meta.needsAssessment && (
                  <Field label="Assessment" htmlFor="rep-assessment">
                    <Select id="rep-assessment" value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
                      <option value="">Latest current assessment</option>
                      {(assessments ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {f.dateTime(a.assessmentDate)} · {METHOD_LABEL[a.method]} · {formatCompact(a.tbsaTotal, 1)}%{a.supersededById ? ' (superseded)' : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="From (optional)" htmlFor="rep-start">
                    <DateTimeInput id="rep-start" value={start} onValueChange={setStart} />
                  </Field>
                  <Field label="To (optional)" htmlFor="rep-end">
                    <DateTimeInput id="rep-end" value={end} onValueChange={setEnd} />
                  </Field>
                </div>
                {start && end && start >= end && <Alert variant="warning">The start must be before the end.</Alert>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void run('download')} disabled={busy || (!!start && !!end && start >= end)} data-testid="download-report">
                    <FileDown /> {busy ? 'Generating…' : 'Download PDF'}
                  </Button>
                  <Button variant="outline" onClick={() => void run('print')} disabled={busy}>
                    <Printer /> Print
                  </Button>
                </div>
                <DisclaimerNote />
              </CardContent>
            </Card>
            <ExportRecordsCard />
          </div>
        </div>
      )}
    </>
  );
}

function ExportRecordsCard() {
  const { patients } = useActivePatient();
  const [selected, setSelected] = useState<string[]>([]);
  if (!patients?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" /> Export selected patient records
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Structured JSON (backup format) containing only the selected patients and their linked records. It can be restored in Settings → Backup &amp; restore.</p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2">
          {patients.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{p.code}</span>
            </label>
          ))}
        </div>
        <Button
          variant="outline"
          disabled={selected.length === 0}
          onClick={async () => {
            try {
              const backup = await buildBackup({ scope: 'patients', patientIds: selected });
              downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `burn-tool-patients-${selected.length}-${new Date().toISOString().slice(0, 10)}.json`);
              toast.success(`Exported ${selected.length} patient(s).`, { description: 'The file contains identifiable data. Store it securely.' });
            } catch (e) {
              toast.error('Export failed.', { description: describeError(e) });
            }
          }}
        >
          <Download /> Export {selected.length || ''} patient{selected.length === 1 ? '' : 's'}
        </Button>
      </CardContent>
    </Card>
  );
}
