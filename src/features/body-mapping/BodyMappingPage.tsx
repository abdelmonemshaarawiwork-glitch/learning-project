import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Camera, ClipboardList, Copy, PersonStanding } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { METHOD_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { depthBySegment } from '@/engines/tbsa';
import { regionsToItems } from '@/features/burn-assessment/AssessmentDetailPage';
import { defaultDraftFor } from '@/features/burn-assessment/AssessmentWorkflowPage';
import { RegionMappingPanel } from '@/features/burn-assessment/components/RegionMappingPanel';
import { BreakdownTable } from '@/features/burn-assessment/components/TbsaSummary';
import { draftFromAssessment } from '@/features/burn-assessment/draftFromAssessment';
import { usePatientAssessments } from '@/features/burn-assessment/queries';
import { computeDraftResult, useReferenceDatasets } from '@/features/burn-assessment/service';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import { useAssessmentDraft } from '@/stores/assessmentDraft';
import { formatCompact } from '@/utils/rounding';
import { BodyMapSwitcher } from './BodyMapSwitcher';

export default function BodyMappingPage() {
  const active = useActivePatient();
  const navigate = useNavigate();
  const f = useFormatters();
  const { settings } = useSettings();
  const datasets = useReferenceDatasets();
  const { draft, start, update } = useAssessmentDraft();
  const assessments = usePatientAssessments(active.patient?.id);
  const latest = assessments?.find((a) => !a.supersededById) ?? null;
  const latestRegions = useLiveQuery(() => (latest ? db.assessmentRegions.where('assessmentId').equals(latest.id).sortBy('order') : []), [latest?.id]);

  const draftForPatient = draft && active.patient && draft.patientId === active.patient.id ? draft : null;
  const dataset = draftForPatient && draftForPatient.method !== 'palm' ? (datasets?.find((d) => d.id === draftForPatient.datasetId) ?? null) : null;
  const result = useMemo(() => (draftForPatient ? computeDraftResult(draftForPatient, dataset) : null), [draftForPatient, dataset]);

  if (datasets === undefined) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="3D body mapping"
        description="Interactive anterior, posterior and lateral views. Select regions to record depth and involvement; saved assessments are shown as colour-coded overlays."
      />
      <PatientContextBar {...active} />
      {!active.patient ? null : draftForPatient ? (
        <>
          <Alert variant="info" className="mb-4" title={`Editing draft ${METHOD_LABEL[draftForPatient.method]} assessment`}>
            Selections here update the same draft as the Burn Assessment workflow.
          </Alert>
          <RegionMappingPanel draft={draftForPatient} dataset={dataset} result={result} defaultMode="3d" />
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => {
                void update({ step: 4 });
                navigate(`/assessment?patient=${active.patient!.id}`);
              }}
            >
              Review &amp; save in assessment workflow <ArrowRight />
            </Button>
          </div>
        </>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{latest ? `Latest saved assessment — ${f.dateTime(latest.assessmentDate)}` : 'Body map'}</CardTitle>
            </CardHeader>
            <CardContent>
              <BodyMapSwitcher depthBySegment={depthBySegment(regionsToItems(latestRegions ?? []))} readOnly defaultMode={settings.prefer2DMap ? '2d' : '3d'} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latest ? (
                <>
                  <p className="text-sm">
                    {METHOD_LABEL[latest.method]} · TBSA <strong>{formatCompact(latest.tbsaTotal, 1)}%</strong>
                    {latest.tbsaIndeterminate > 0 && <span className="text-warning"> · {formatCompact(latest.tbsaIndeterminate, 1)}% indeterminate</span>}
                  </p>
                  <BreakdownTable items={regionsToItems(latestRegions ?? [])} method={latest.method === 'palm' ? 'palm' : 'regional'} />
                </>
              ) : (
                <EmptyState icon={<PersonStanding />} title="No saved assessment yet" description="Start an assessment to map burned regions." />
              )}
              {draft && draft.patientId !== active.patient.id && (
                <Alert variant="warning">A draft is in progress for another patient. Save or discard it in the Burn Assessment workflow first.</Alert>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!!draft}
                  onClick={() => void start({ ...defaultDraftFor(active.patient!, settings.defaultAssessmentMethod, datasets), step: 3 })}
                  data-testid="start-mapping"
                >
                  <ClipboardList /> Start new assessment
                </Button>
                {latest && latestRegions && (
                  <Button variant="outline" disabled={!!draft} onClick={() => void start({ ...draftFromAssessment(latest, latestRegions, 'copy'), step: 3 })}>
                    <Copy /> New from latest
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <Link to={`/assessment?patient=${active.patient.id}`}>Open workflow</Link>
                </Button>
                <Button variant="ghost" asChild>
                  <Link to={`/assessment/photos?patient=${active.patient.id}`}>
                    <Camera /> Estimate from photos
                  </Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A new assessment needs a verified method configuration (step 3). Starting here opens region mapping directly; method and date can be changed in the workflow.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
