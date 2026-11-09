import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, FileDown, Pencil, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { DisclaimerNote } from '@/components/common/ClinicalNotices';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { DefinitionList } from '@/components/ui/stat';
import { METHOD_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { deleteAssessment, getAssessmentWithRegions } from '@/database/repositories/assessments';
import { depthBySegment } from '@/engines/tbsa';
import { assessmentTotals, regionsToItems } from './assessmentView';

export { assessmentTotals, regionsToItems };
import { BodyMapSwitcher } from '@/features/body-mapping/BodyMapSwitcher';
import { useFormatters } from '@/hooks/useFormatters';
import { useAssessmentDraft } from '@/stores/assessmentDraft';
import { describeError } from '@/utils/logger';
import { downloadAssessmentPdf } from './AssessmentWorkflowPage';
import { BreakdownTable, TbsaTotalsPanel } from './components/TbsaSummary';
import { draftFromAssessment } from './draftFromAssessment';

export default function AssessmentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const f = useFormatters();
  const data = useLiveQuery(() => getAssessmentWithRegions(id), [id]);
  const patient = useLiveQuery(() => (data ? db.patients.get(data.assessment.patientId) : undefined), [data?.assessment.patientId]);
  const { draft, start } = useAssessmentDraft();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReplaceDraft, setConfirmReplaceDraft] = useState<null | 'amend' | 'copy'>(null);

  if (data === undefined) return <LoadingState />;
  if (data === null) return <EmptyState title="Assessment not found" action={<Link to="/assessment/history" className="text-primary underline">Assessment history</Link>} />;
  const { assessment: a, regions } = data;
  const items = regionsToItems(regions);

  const begin = async (mode: 'amend' | 'copy') => {
    await start(draftFromAssessment(a, regions, mode));
    navigate(`/assessment?patient=${a.patientId}`);
  };

  return (
    <>
      <PageHeader
        title={`${METHOD_LABEL[a.method]} assessment`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {patient && (
              <Link to={`/patients/${patient.id}`} className="font-medium text-foreground hover:underline">
                {patient.name} · {patient.code}
              </Link>
            )}
            <span>{f.dateTime(a.assessmentDate)}</span>
            <Badge variant={a.supersededById ? 'neutral' : 'primary'}>{a.supersededById ? 'Superseded' : a.kind === 'initial' ? 'Initial' : 'Repeat'}</Badge>
          </span>
        }
        actions={
          <>
            <Button onClick={() => void downloadAssessmentPdf(a.id)}>
              <FileDown /> PDF
            </Button>
            <Button variant="outline" onClick={() => void downloadAssessmentPdf(a.id, true)}>
              <Printer /> Print
            </Button>
            <Button variant="outline" onClick={() => (draft ? setConfirmReplaceDraft('copy') : void begin('copy'))}>
              <Copy /> New from this
            </Button>
            {!a.supersededById && (
              <Button variant="outline" onClick={() => (draft ? setConfirmReplaceDraft('amend') : void begin('amend'))}>
                <Pencil /> Amend
              </Button>
            )}
            <Button variant="destructive-outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          </>
        }
      />
      {a.supersededById && (
        <Alert variant="neutral" className="mb-4">
          This assessment was superseded by an amended version.{' '}
          <Link to={`/assessment/${a.supersededById}`} className="underline">
            Open the newer version
          </Link>
        </Alert>
      )}
      {a.supersedesId && (
        <Alert variant="info" className="mb-4">
          This assessment amends an earlier one.{' '}
          <Link to={`/assessment/${a.supersedesId}`} className="underline">
            Open the original
          </Link>
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <TbsaTotalsPanel totals={assessmentTotals(a, regions)} />
              {a.warnings.map((w, i) => (
                <Alert key={i} variant="warning">
                  {w}
                </Alert>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Regional breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <BreakdownTable items={items} method={a.method === 'palm' ? 'palm' : 'regional'} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: 'Method', value: METHOD_LABEL[a.method] },
                  { label: 'Reference', value: a.referenceName ? `${a.referenceName} v${a.referenceVersion}` : a.palmReference ?? '—' },
                  { label: 'Age at assessment', value: a.ageAtAssessment ?? 'Unknown' },
                  { label: 'Age column', value: a.ageColumnLabel ?? '—' },
                  { label: 'Palm-equivalent', value: a.palmPercent !== null ? `${a.palmPercent}% TBSA` : '—' },
                  { label: 'Assessor', value: a.assessor },
                  { label: 'Limitations acknowledged', value: a.limitationAcknowledged ? 'Yes' : '—' },
                  { label: 'Recorded', value: f.dateTime(a.createdAt) },
                  { label: 'Notes', value: a.notes },
                ]}
              />
              <DisclaimerNote className="mt-4" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Body map</CardTitle>
          </CardHeader>
          <CardContent>
            <BodyMapSwitcher depthBySegment={depthBySegment(items)} readOnly defaultMode="2d" />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this assessment?"
        destructive
        confirmLabel="Delete assessment"
        description="The assessment, its regional breakdown and its automatic timeline entry will be permanently deleted from this device."
        consequences={['Fluid calculations that referenced this assessment are kept but unlinked.', 'Other assessments are not changed.']}
        onConfirm={async () => {
          try {
            await deleteAssessment(a.id);
            toast.success('Assessment deleted.');
            navigate(`/assessment/history?patient=${a.patientId}`);
          } catch (e) {
            toast.error('Delete failed.', { description: describeError(e) });
          }
        }}
      />
      <ConfirmDialog
        open={confirmReplaceDraft !== null}
        onOpenChange={(o) => !o && setConfirmReplaceDraft(null)}
        title="Replace the current draft?"
        description="Another assessment draft is in progress. Starting a new one discards that draft."
        destructive
        confirmLabel="Discard draft and continue"
        onConfirm={() => void (confirmReplaceDraft && begin(confirmReplaceDraft))}
      />
    </>
  );
}
