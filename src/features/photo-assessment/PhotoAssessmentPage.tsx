import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Camera, CheckCircle2, ClipboardList, ImagePlus, PenLine, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DisclaimerNote } from '@/components/common/ClinicalNotices';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { BODY_SEGMENT_MAP, BURN_DEPTHS, BURN_DEPTH_MAP, segmentKeyLabel } from '@/constants/clinical';
import { db } from '@/database/db';
import { photoRepo } from '@/database/repositories/records';
import {
  combineMeasurements,
  EMPTY_ANNOTATION,
  estimatesToEntries,
  isSideView,
  measurePhoto,
  type PhotoAnnotation,
  type PhotoMeasurement,
  type PhotoView,
  type SurfaceEstimate,
} from '@/engines/photo-planimetry';
import { findRegionRow, type RegionalReferenceData } from '@/engines/tbsa';
import { defaultDraftFor } from '@/features/burn-assessment/AssessmentWorkflowPage';
import { useReferenceDatasets } from '@/features/burn-assessment/service';
import { useFormatters } from '@/hooks/useFormatters';
import { useAssessmentDraft } from '@/stores/assessmentDraft';
import type { ClinicalPhoto, Patient, PhotoAreaId } from '@/types/domain';
import { cn } from '@/utils/cn';
import { nowIso } from '@/utils/dates';
import { newId } from '@/utils/ids';
import { describeError } from '@/utils/logger';
import { formatCompact } from '@/utils/rounding';
import { processImageFile } from './imageProcessing';
import { PhotoAnnotator } from './PhotoAnnotator';
import { AREA_MAP, CAPTURE_TIPS, PHOTO_AREAS, VIEW_LABEL } from './photoAreas';
import { usePhotoUrl } from './usePhotoUrl';

export const PHOTO_LIMITATIONS = [
  'The application does not detect burns or burn depth from images. Every outline, burn area and depth is traced and chosen by the clinician.',
  'Photographs are 2D projections of curved surfaces: areas near the edges of a view are foreshortened and views overlap. Results are approximate.',
  'Lighting, skin tone, dressings, blood and blisters affect what is visible. Assess the patient directly.',
  'Proposed percentages are applied to a Lund and Browder draft only after the clinician reviews and confirms them.',
  'This photo-assisted method has not been clinically validated.',
];

export default function PhotoAssessmentPage() {
  const active = useActivePatient();
  return (
    <>
      <PageHeader
        title="Photo-assisted estimate"
        description="Photograph each body area from the front, back and both sides, trace the segment outlines and burned areas, and get proposed % involvement for each region surface."
        actions={
          <Button variant="outline" asChild>
            <Link to={`/assessment${active.patient ? `?patient=${active.patient.id}` : ''}`}>
              <ClipboardList /> Assessment workflow
            </Link>
          </Button>
        }
      />
      <Alert variant="warning" className="mb-5" title="Clinician-traced planimetry — not automatic detection">
        <ul className="list-disc space-y-0.5 pl-4">
          {PHOTO_LIMITATIONS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Alert>
      <PatientContextBar {...active} />
      {active.patient && <PhotoWorkspace key={active.patient.id} patient={active.patient} />}
    </>
  );
}

function photoStatus(p: ClinicalPhoto): { ok: boolean; label: string } {
  const m = measurePhoto({ id: p.id, view: p.view, aspect: p.width / p.height, annotation: p.annotation }, 120);
  const error = m.issues.find((i) => i.severity === 'error');
  if (error) return { ok: false, label: p.annotation.outlines.length === 0 ? 'Not traced' : isSideView(p.view) ? 'Divider needed' : 'Incomplete' };
  return { ok: true, label: `${p.annotation.outlines.length} outline(s), ${p.annotation.burns.length} burn(s)` };
}

function PhotoWorkspace({ patient }: { patient: Patient }) {
  const photos = useLiveQuery(() => db.clinicalPhotos.where('patientId').equals(patient.id).toArray(), [patient.id]);
  const [areaId, setAreaId] = useState<PhotoAreaId>('upper-limb-left');
  const [consent, setConsent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ClinicalPhoto | null>(null);
  const area = AREA_MAP[areaId];

  const measurements = useMemo<PhotoMeasurement[]>(
    () =>
      (photos ?? [])
        .map((p) => measurePhoto({ id: p.id, view: p.view, aspect: p.width / p.height, annotation: p.annotation }))
        .filter((m) => !m.issues.some((i) => i.severity === 'error')),
    [photos],
  );
  const estimates = useMemo(() => combineMeasurements(measurements), [measurements]);

  if (!photos) return <LoadingState />;
  const editing = photos.find((p) => p.id === editingId) ?? null;
  const areaPhotos = photos.filter((p) => p.areaId === areaId);

  async function addPhoto(view: PhotoView, file: File) {
    try {
      const img = await processImageFile(file);
      const existing = photos!.find((p) => p.areaId === areaId && p.view === view);
      const rec = await photoRepo.add({
        patientId: patient.id,
        areaId,
        view,
        dateTime: nowIso(),
        imageData: img.data,
        mimeType: img.mimeType,
        width: img.width,
        height: img.height,
        annotation: EMPTY_ANNOTATION,
        consentConfirmed: true,
        notes: '',
      });
      if (existing) await photoRepo.remove(existing.id);
      toast.success(`${VIEW_LABEL[view]} photo saved on this device.`);
      setEditingId(rec.id);
    } catch (e) {
      toast.error('The photo could not be added.', { description: describeError(e) });
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" data-testid="photo-consent" />
            <span>
              Consent for clinical photography has been obtained (or the photographs are permitted by local policy), and the patient’s dignity is protected. Photos are stored only on this
              device and are removed with the patient record.
            </span>
          </label>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">How to take the photos</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {CAPTURE_TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Body area">
        {PHOTO_AREAS.map((a) => {
          const n = photos.filter((p) => p.areaId === a.id).length;
          return (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={a.id === areaId}
              onClick={() => setAreaId(a.id)}
              className={cn('inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-muted', a.id === areaId && 'border-primary bg-accent text-accent-foreground')}
            >
              {a.label}
              <Badge variant={n === a.views.length ? 'success' : n > 0 ? 'primary' : 'neutral'}>
                {n}/{a.views.length}
              </Badge>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{area.label}</CardTitle>
          <p className="text-sm text-muted-foreground">{area.tips} Segments: {area.segments.map((s) => BODY_SEGMENT_MAP[s].label).join(', ')}.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {area.views.map((view) => (
              <ViewSlot
                key={view}
                view={view}
                photo={areaPhotos.find((p) => p.view === view) ?? null}
                consent={consent}
                onFile={(f) => void addPhoto(view, f)}
                onAnnotate={(id) => setEditingId(id)}
                onDelete={(p) => setDeleting(p)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <ResultsCard patient={patient} estimates={estimates} photoCount={photos.length} usableCount={measurements.length} />

      {editing && <AnnotateDialog photo={editing} onClose={() => setEditingId(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this photo?"
        destructive
        confirmLabel="Delete photo"
        description={deleting ? `The ${VIEW_LABEL[deleting.view].toLowerCase()} photo of the ${AREA_MAP[deleting.areaId].label.toLowerCase()} and its tracing will be permanently deleted from this device. Assessments already saved are not changed.` : ''}
        onConfirm={async () => {
          if (deleting) await photoRepo.remove(deleting.id);
          toast.success('Photo deleted.');
        }}
      />
    </div>
  );
}

function ViewSlot({
  view,
  photo,
  consent,
  onFile,
  onAnnotate,
  onDelete,
}: {
  view: PhotoView;
  photo: ClinicalPhoto | null;
  consent: boolean;
  onFile: (f: File) => void;
  onAnnotate: (id: string) => void;
  onDelete: (p: ClinicalPhoto) => void;
}) {
  const url = usePhotoUrl(photo?.imageData, photo?.mimeType);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const status = photo ? photoStatus(photo) : null;
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border" data-testid={`view-slot-${view}`}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-sm font-semibold">{VIEW_LABEL[view]}</p>
        {status && (
          <Badge variant={status.ok ? 'success' : 'warning'} data-testid="view-status">
            {status.ok ? <CheckCircle2 /> : <TriangleAlert />} {status.label}
          </Badge>
        )}
      </div>
      <div className="grid aspect-[4/3] place-items-center bg-muted">
        {url ? <img src={url} alt={VIEW_LABEL[view]} className="h-full w-full object-contain" /> : <Camera className="size-8 text-muted-foreground" aria-hidden />}
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} data-testid={`camera-input-${view}`} />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={pick} data-testid={`gallery-input-${view}`} />
      <div className="flex flex-wrap gap-1.5 p-2">
        <Button size="sm" disabled={!consent} onClick={() => cameraRef.current?.click()} title={consent ? undefined : 'Confirm consent first'}>
          <Camera /> {photo ? 'Retake' : 'Take photo'}
        </Button>
        <Button size="sm" variant="outline" disabled={!consent} onClick={() => galleryRef.current?.click()}>
          <ImagePlus /> Choose
        </Button>
        {photo && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onAnnotate(photo.id)} data-testid={`annotate-${view}`}>
              <PenLine /> Trace
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete photo" onClick={() => onDelete(photo)}>
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AnnotateDialog({ photo, onClose }: { photo: ClinicalPhoto; onClose: () => void }) {
  const url = usePhotoUrl(photo.imageData, photo.mimeType);
  const [annotation, setAnnotation] = useState<PhotoAnnotation>(photo.annotation);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(annotation);
  const save = async (a: PhotoAnnotation) => {
    try {
      await photoRepo.update(photo.id, { annotation: a });
    } catch (e) {
      toast.error('Tracing could not be saved.', { description: describeError(e) });
    }
  };
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void save(latest.current);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const area = AREA_MAP[photo.areaId];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Trace — ${area.label}, ${VIEW_LABEL[photo.view].toLowerCase()}`} description="Tracing is saved automatically on this device." size="xl">
        {url ? (
          <PhotoAnnotator
            imageUrl={url}
            width={photo.width}
            height={photo.height}
            view={photo.view}
            area={area}
            annotation={annotation}
            onChange={(a) => {
              setAnnotation(a);
              latest.current = a;
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => {
                timer.current = null;
                void save(a);
              }, 300);
            }}
          />
        ) : (
          <LoadingState />
        )}
        <DialogFooter>
          <Button onClick={onClose} data-testid="annotation-done">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsCard({ patient, estimates, photoCount, usableCount }: { patient: Patient; estimates: SurfaceEstimate[]; photoCount: number; usableCount: number }) {
  const navigate = useNavigate();
  const f = useFormatters();
  const datasets = useReferenceDatasets();
  const { draft, start, update } = useAssessmentDraft();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const draftForPatient = draft && draft.patientId === patient.id ? draft : null;
  const lbDataset = draftForPatient?.method === 'lund-browder' ? (datasets?.find((d) => d.id === draftForPatient.datasetId) ?? null) : null;
  const selected = estimates.filter((e) => !excluded.has(e.key));
  const applicable = lbDataset ? selected.filter((e) => findRegionRow(lbDataset.data as RegionalReferenceData, e.segment, e.surface)) : [];

  async function apply() {
    if (!draftForPatient || !lbDataset) return;
    const keys = new Set(applicable.map((e) => e.key));
    const kept = draftForPatient.regionalEntries.filter((e) => !keys.has(`${e.regionId}:${e.surface}`));
    const added = estimatesToEntries(applicable, newId, ` — reviewed ${f.dateTime(nowIso())}`);
    await update({ regionalEntries: [...kept, ...added], step: 4 });
    toast.success(`Applied photo estimates to ${keys.size} region surface(s) of the draft.`);
    navigate(`/assessment?patient=${patient.id}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proposed involvement from photos</CardTitle>
        <p className="text-sm text-muted-foreground">
          {usableCount} of {photoCount} photo(s) fully traced. Percentages are of each region surface (anterior or posterior), pooled across views — see the method in the documentation.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {estimates.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">Take and trace at least one photo to see proposed values.</p>
        ) : (
          <Table data-testid="photo-estimates">
            <THead>
              <TR>
                <TH>Use</TH>
                <TH>Region surface</TH>
                {BURN_DEPTHS.map((d) => (
                  <TH key={d.id} className="text-right" title={d.label}>
                    {d.short}
                  </TH>
                ))}
                <TH className="text-right">Total</TH>
                <TH>Views</TH>
              </TR>
            </THead>
            <TBody>
              {estimates.map((e) => (
                <TR key={e.key} data-testid="estimate-row">
                  <TD>
                    <Checkbox
                      aria-label={`Use ${segmentKeyLabel(e.key)}`}
                      checked={!excluded.has(e.key)}
                      onChange={(ev) => {
                        const next = new Set(excluded);
                        if (ev.target.checked) next.delete(e.key);
                        else next.add(e.key);
                        setExcluded(next);
                      }}
                    />
                  </TD>
                  <TD className="font-medium">
                    {segmentKeyLabel(e.key)}
                    {!e.hasDirectView && <p className="text-xs font-normal text-warning">No direct {e.surface} view — estimated from side views only</p>}
                  </TD>
                  {BURN_DEPTHS.map((d) => (
                    <TD key={d.id} className="tabular text-right">
                      {e.percentByDepth[d.id] > 0 ? `${formatCompact(e.percentByDepth[d.id], 1)}%` : '—'}
                    </TD>
                  ))}
                  <TD className="tabular text-right font-semibold" data-testid="estimate-total">
                    {formatCompact(e.totalPercent, 1)}%
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {e.contributions.map((c) => `${VIEW_LABEL[c.view].split(' (')[0]} ${formatCompact(c.totalFraction * 100, 0)}%`).join(' · ')}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Superficial ({BURN_DEPTH_MAP.superficial.short}) and indeterminate ({BURN_DEPTH_MAP.indeterminate.short}) areas are carried over as such: the assessment excludes superficial burns from TBSA and reports indeterminate areas separately.
        </p>

        {estimates.length > 0 && (
          <div className="rounded-xl border p-3">
            {!draftForPatient ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">To use these values, start a Lund and Browder assessment draft for this patient.</p>
                <Button
                  disabled={!!draft || !datasets}
                  onClick={() => datasets && void start({ ...defaultDraftFor(patient, 'lund-browder', datasets), step: 2 })}
                  data-testid="start-lb-draft"
                >
                  <ClipboardList /> Start Lund and Browder draft
                </Button>
              </div>
            ) : draftForPatient.method !== 'lund-browder' || !lbDataset ? (
              <Alert variant="warning">Photo estimates are segment-level and can only be applied to a Lund and Browder draft. The current draft uses another method.</Alert>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  Apply {applicable.length} selected region surface(s) to the Lund and Browder draft. Existing entries for those region surfaces will be replaced; other entries are kept.
                </p>
                <Button disabled={applicable.length === 0} onClick={() => setConfirmOpen(true)} data-testid="apply-photo-estimates">
                  Review &amp; apply <ArrowRight />
                </Button>
              </div>
            )}
            {draft && draft.patientId !== patient.id && <p className="mt-2 text-xs text-warning">A draft for another patient is in progress.</p>}
          </div>
        )}
        <DisclaimerNote />
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Apply photo estimates to the draft?"
        confirmLabel="I have reviewed these values — apply"
        description="Check each value against your clinical examination. You can edit any entry afterwards in the assessment workflow before saving."
        consequences={applicable.map(
          (e) =>
            `${segmentKeyLabel(e.key)}: ${BURN_DEPTHS.filter((d) => e.percentByDepth[d.id] > 0).map((d) => `${d.short} ${formatCompact(e.percentByDepth[d.id], 1)}%`).join(', ') || 'no burn (existing entries removed)'}`,
        )}
        onConfirm={apply}
      />
    </Card>
  );
}
