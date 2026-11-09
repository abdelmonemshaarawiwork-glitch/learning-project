import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BURN_DEPTH_MAP, parseSegmentKey, segmentKey, segmentKeyLabel } from '@/constants/clinical';
import { BodyMapSwitcher } from '@/features/body-mapping/BodyMapSwitcher';
import { findRegionRow, findRowForSegment, type RegionalReferenceData, type TbsaResult } from '@/engines/tbsa';
import { useAssessmentDraft, type AssessmentDraft } from '@/stores/assessmentDraft';
import type { BurnDepth, ReferenceDataset, Surface } from '@/types/domain';
import { formatCompact } from '@/utils/rounding';
import { PalmEntriesEditor, RegionalEditor, RegionOverviewTable } from './RegionEditors';

/** Depth colouring straight from draft entries (works even while the draft has validation errors). */
export function draftDepthMap(draft: AssessmentDraft, data: RegionalReferenceData | null): Map<string, BurnDepth> {
  const out = new Map<string, BurnDepth>();
  const put = (k: string, d: BurnDepth) => {
    const cur = out.get(k);
    if (!cur || BURN_DEPTH_MAP[d].severity > BURN_DEPTH_MAP[cur].severity) out.set(k, d);
  };
  if (draft.method === 'palm') {
    for (const e of draft.palmEntries) if (e.segmentKey) put(e.segmentKey, e.depth);
  } else if (data) {
    for (const e of draft.regionalEntries) {
      const row = findRegionRow(data, e.regionId, e.surface);
      row?.segments.forEach((s) => put(segmentKey(s, e.surface), e.depth));
    }
  }
  return out;
}

export function RegionMappingPanel({ draft, dataset, result, defaultMode }: { draft: AssessmentDraft; dataset: ReferenceDataset | null; result: TbsaResult | null; defaultMode?: '2d' | '3d' }) {
  const { upsertRegional, removeRegional, upsertPalm, removePalm } = useAssessmentDraft();
  const data = draft.method === 'palm' ? null : ((dataset?.data as RegionalReferenceData | undefined) ?? null);
  const [selectedRow, setSelectedRow] = useState<{ regionId: string; surface: Surface } | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [notMapped, setNotMapped] = useState<string | null>(null);

  const depthMap = useMemo(() => draftDepthMap(draft, data), [draft, data]);
  const issues = result?.issues ?? [];

  const selectedKeys = useMemo(() => {
    if (draft.method === 'palm') return selectedSegment ? [selectedSegment] : [];
    if (!selectedRow || !data) return [];
    const row = findRegionRow(data, selectedRow.regionId, selectedRow.surface);
    return row ? row.segments.map((s) => segmentKey(s, selectedRow.surface)) : [];
  }, [draft.method, selectedRow, selectedSegment, data]);

  const onSelectSegment = (key: string) => {
    setNotMapped(null);
    if (draft.method === 'palm') {
      setSelectedSegment(key);
      return;
    }
    const parsed = parseSegmentKey(key);
    if (!parsed || !data) return;
    const row = findRowForSegment(data, parsed.segment, parsed.surface);
    if (row) setSelectedRow({ regionId: row.id, surface: row.surface });
    else setNotMapped(key);
  };

  const live = result?.ok ? result.totals : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Select anatomical regions</CardTitle>
        </CardHeader>
        <CardContent>
          <BodyMapSwitcher depthBySegment={depthMap} selectedKeys={selectedKeys} onSelectSegment={onSelectSegment} defaultMode={defaultMode} />
          {notMapped && <p className="mt-2 text-sm text-warning">{segmentKeyLabel(notMapped)} is not mapped in this reference dataset.</p>}
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>{draft.method === 'palm' ? 'Palm estimates' : 'Region details'}</CardTitle>
            <span className="tabular rounded-lg bg-accent px-2.5 py-1 text-sm font-semibold text-accent-foreground" data-testid="live-tbsa">
              TBSA {live ? `${formatCompact(live.eligible, 1)}%` : '—'}
              {live && live.indeterminate > 0 ? ` (+${formatCompact(live.indeterminate, 1)}% IND)` : ''}
            </span>
          </CardHeader>
          <CardContent>
            {draft.method === 'palm' ? (
              <PalmEntriesEditor
                entries={draft.palmEntries}
                issues={issues}
                palmPercent={draft.palmPercent}
                selectedSegmentKey={selectedSegment}
                onUpsert={(e) => void upsertPalm(e)}
                onRemove={(id) => void removePalm(id)}
              />
            ) : !data ? (
              <p className="text-sm text-muted-foreground">Select a reference dataset first.</p>
            ) : selectedRow ? (
              <RegionalEditor
                data={data}
                columnId={draft.columnId}
                regionId={selectedRow.regionId}
                surface={selectedRow.surface}
                entries={draft.regionalEntries}
                issues={issues}
                onUpsert={(e) => void upsertRegional(e)}
                onRemove={(id) => void removeRegional(id)}
              />
            ) : (
              <p className="rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">Select a region on the body map or in the list below.</p>
            )}
          </CardContent>
        </Card>
        {data && (
          <Card>
            <CardHeader>
              <CardTitle>All regions</CardTitle>
            </CardHeader>
            <CardContent>
              <RegionOverviewTable data={data} columnId={draft.columnId} entries={draft.regionalEntries} selected={selectedRow} onSelect={setSelectedRow} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
