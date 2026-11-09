import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { PatientContextBar, useActivePatient } from '@/components/common/PatientContextBar';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { BURN_DEPTH_MAP, METHOD_LABEL } from '@/constants/clinical';
import { db } from '@/database/db';
import { depthBySegment } from '@/engines/tbsa';
import { BodyMap2D } from '@/features/body-mapping/BodyMap2D';
import { useFormatters } from '@/hooks/useFormatters';
import type { AssessmentRegion } from '@/types/domain';
import { formatCompact, preciseSum } from '@/utils/rounding';
import { AssessmentList } from './components/AssessmentList';
import { regionsToItems } from './AssessmentDetailPage';
import { usePatientAssessments } from './queries';

export interface RegionDiff {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
  beforeDepths: string;
  afterDepths: string;
}

/** Per-region comparison of two assessments (by region id + surface, all depths summed). */
export function compareRegions(before: AssessmentRegion[], after: AssessmentRegion[]): RegionDiff[] {
  const keyOf = (r: AssessmentRegion) => `${r.regionId}:${r.surface ?? '-'}`;
  const keys = new Map<string, string>();
  for (const r of [...before, ...after]) keys.set(keyOf(r), r.label);
  return [...keys.entries()].map(([key, label]) => {
    const b = before.filter((r) => keyOf(r) === key && r.eligible);
    const a = after.filter((r) => keyOf(r) === key && r.eligible);
    const bv = preciseSum(b.map((r) => r.tbsaContribution));
    const av = preciseSum(a.map((r) => r.tbsaContribution));
    const dep = (list: AssessmentRegion[]) => [...new Set(list.filter((r) => keyOf(r) === key).map((r) => BURN_DEPTH_MAP[r.depth].short))].join(', ');
    return { key, label, before: bv, after: av, delta: av - bv, beforeDepths: dep(before), afterDepths: dep(after) };
  });
}

export default function AssessmentHistoryPage() {
  const active = useActivePatient();
  const f = useFormatters();
  const assessments = usePatientAssessments(active.patient?.id);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const list = assessments ?? [];
  const chronological = [...list].sort((x, y) => x.assessmentDate.localeCompare(y.assessmentDate));
  const A = list.find((x) => x.id === aId) ?? chronological.filter((x) => !x.supersededById).at(-2) ?? null;
  const B = list.find((x) => x.id === bId) ?? chronological.filter((x) => !x.supersededById).at(-1) ?? null;
  const regions = useLiveQuery(async () => {
    if (!A || !B) return null;
    const [ra, rb] = await Promise.all([
      db.assessmentRegions.where('assessmentId').equals(A.id).toArray(),
      db.assessmentRegions.where('assessmentId').equals(B.id).toArray(),
    ]);
    return { ra, rb };
  }, [A?.id, B?.id]);
  const diff = useMemo(() => (regions ? compareRegions(regions.ra, regions.rb) : []), [regions]);

  return (
    <>
      <PageHeader title="Assessment history" description="All assessments for the selected patient, with comparison between records." />
      <PatientContextBar {...active} />
      {active.patient && (
        <div className="space-y-5">
          <Card className="p-2">
            <AssessmentList assessments={list} patientId={active.patient.id} />
          </Card>
          {list.length >= 2 && A && B && (
            <Card>
              <CardHeader>
                <CardTitle>Compare assessments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'Earlier / baseline', value: A.id, set: setAId },
                    { label: 'Later / current', value: B.id, set: setBId },
                  ].map((s) => (
                    <label key={s.label} className="space-y-1 text-sm">
                      <span className="font-medium">{s.label}</span>
                      <Select value={s.value} onChange={(e) => s.set(e.target.value)} aria-label={s.label}>
                        {list.map((x) => (
                          <option key={x.id} value={x.id}>
                            {f.dateTime(x.assessmentDate)} · {METHOD_LABEL[x.method]} · {formatCompact(x.tbsaTotal, 1)}%{x.supersededById ? ' (superseded)' : ''}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center" data-testid="comparison-summary">
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Earlier</p>
                    <p className="tabular text-xl font-semibold">{formatCompact(A.tbsaTotal, 1)}%</p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground">Later</p>
                    <p className="tabular text-xl font-semibold">{formatCompact(B.tbsaTotal, 1)}%</p>
                  </div>
                  <div className="rounded-xl bg-accent p-3 text-accent-foreground">
                    <p className="text-xs">Change</p>
                    <p className="tabular text-xl font-semibold">
                      {B.tbsaTotal - A.tbsaTotal >= 0 ? '+' : ''}
                      {formatCompact(B.tbsaTotal - A.tbsaTotal, 1)}%
                    </p>
                  </div>
                </div>
                {(A.method !== B.method || A.referenceVersion !== B.referenceVersion || A.ageColumnId !== B.ageColumnId) && (
                  <Alert variant="warning">
                    The two assessments use different methods, dataset versions or age columns. Regional values are not directly comparable; compare totals with caution.
                  </Alert>
                )}
                {regions && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-center text-xs font-medium text-muted-foreground">Earlier</p>
                      <BodyMap2D depthBySegment={depthBySegment(regionsToItems(regions.ra))} readOnly />
                    </div>
                    <div>
                      <p className="mb-1 text-center text-xs font-medium text-muted-foreground">Later</p>
                      <BodyMap2D depthBySegment={depthBySegment(regionsToItems(regions.rb))} readOnly />
                    </div>
                  </div>
                )}
                <Table>
                  <THead>
                    <TR>
                      <TH>Region</TH>
                      <TH className="text-right">Earlier</TH>
                      <TH className="text-right">Later</TH>
                      <TH className="text-right">Change</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {diff.map((d) => (
                      <TR key={d.key}>
                        <TD>
                          {d.label}
                          <p className="text-xs text-muted-foreground">
                            {d.beforeDepths || '—'} → {d.afterDepths || '—'}
                          </p>
                        </TD>
                        <TD className="tabular text-right">{formatCompact(d.before, 2)}%</TD>
                        <TD className="tabular text-right">{formatCompact(d.after, 2)}%</TD>
                        <TD className={`tabular text-right font-medium ${d.delta > 0 ? 'text-danger' : d.delta < 0 ? 'text-success' : ''}`}>
                          {d.delta > 0 ? '+' : ''}
                          {formatCompact(d.delta, 2)}%
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
