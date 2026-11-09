import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { BODY_SEGMENTS, BURN_DEPTHS, BURN_DEPTH_MAP, segmentKey, segmentKeyLabel } from '@/constants/clinical';
import { findRegionRow, type CalculationIssue, type PalmEntryInput, type RegionalEntryInput, type RegionalReferenceData } from '@/engines/tbsa';
import type { BurnDepth, Surface } from '@/types/domain';
import { newId } from '@/utils/ids';
import { formatCompact, preciseSum } from '@/utils/rounding';

/** Parses a user-typed number. Empty/invalid → NaN so the engine reports it (never silently 0). */
export function parseNumberInput(v: string): number {
  const t = v.trim().replace(',', '.');
  if (t === '') return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

function NumberCell({ value, onCommit, label, id, suffix }: { value: number; onCommit: (n: number) => void; label: string; id: string; suffix?: string }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  useEffect(() => {
    const parsed = parseNumberInput(text);
    if (!(Number.isNaN(parsed) && Number.isNaN(value)) && parsed !== value) setText(Number.isFinite(value) ? String(value) : '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative">
      <Input
        id={id}
        aria-label={label}
        inputMode="decimal"
        value={text}
        placeholder="—"
        aria-invalid={!Number.isFinite(value)}
        onChange={(e) => {
          setText(e.target.value);
          onCommit(parseNumberInput(e.target.value));
        }}
        className={suffix ? 'pr-8' : undefined}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function DepthSelect({ value, onChange, id }: { value: BurnDepth; onChange: (d: BurnDepth) => void; id: string }) {
  return (
    <Select id={id} aria-label="Burn depth" value={value} onChange={(e) => onChange(e.target.value as BurnDepth)}>
      {BURN_DEPTHS.map((d) => (
        <option key={d.id} value={d.id}>
          {d.label}
        </option>
      ))}
    </Select>
  );
}

function IssueList({ issues }: { issues: CalculationIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, k) => (
        <li key={k} role={i.severity === 'error' ? 'alert' : undefined} className={i.severity === 'error' ? 'text-xs font-medium text-danger' : 'text-xs text-warning'}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

function AddDepthButtons({ used, onAdd }: { used: BurnDepth[]; onAdd: (d: BurnDepth) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add a burn depth for this region (depth must be chosen explicitly):</p>
      <div className="flex flex-wrap gap-1.5">
        {BURN_DEPTHS.map((d) => (
          <Button key={d.id} size="sm" variant="outline" disabled={used.includes(d.id)} onClick={() => onAdd(d.id)} aria-label={`Add ${d.label}`}>
            <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
            {d.short}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Regional methods                                                    */
/* ------------------------------------------------------------------ */

export interface RegionalEditorProps {
  data: RegionalReferenceData;
  columnId: string | null;
  regionId: string;
  surface: Surface;
  entries: RegionalEntryInput[];
  issues: CalculationIssue[];
  onUpsert: (e: RegionalEntryInput) => void;
  onRemove: (id: string) => void;
}

export function RegionalEditor({ data, columnId, regionId, surface, entries, issues, onUpsert, onRemove }: RegionalEditorProps) {
  const row = findRegionRow(data, regionId, surface);
  if (!row) return <p className="text-sm text-muted-foreground">This region is not part of the selected reference dataset.</p>;
  const ref = columnId ? row.percentByColumn[columnId] : undefined;
  const rowEntries = entries.filter((e) => e.regionId === regionId && e.surface === surface);
  const combined = preciseSum(rowEntries.map((e) => (Number.isFinite(e.involvementPercent) ? e.involvementPercent : 0)));
  const rowIssues = issues.filter((i) => i.severity === 'error' && !i.entryId && i.message.startsWith(`${row.label} (${surface})`));

  return (
    <div className="space-y-4" data-testid="region-editor">
      <div>
        <p className="text-base font-semibold">
          {row.label} <span className="font-normal text-muted-foreground">({surface})</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Whole region = <span className="tabular font-medium text-foreground">{ref !== undefined ? `${formatCompact(ref, 2)}% TBSA` : 'select an age column'}</span>
          {row.segments.length > 1 && ` · covers ${row.segments.length} body segments`}
        </p>
      </div>

      {rowEntries.length === 0 && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">No burn recorded for this region.</p>}

      {rowEntries.map((e) => {
        const contribution = ref !== undefined && Number.isFinite(e.involvementPercent) ? (ref * e.involvementPercent) / 100 : null;
        return (
          <div key={e.id} className="rounded-xl border p-3" data-testid="region-entry">
            <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
              <DepthSelect id={`depth-${e.id}`} value={e.depth} onChange={(depth) => onUpsert({ ...e, depth })} />
              <NumberCell id={`inv-${e.id}`} label="Percentage of region involved" value={e.involvementPercent} suffix="%" onCommit={(n) => onUpsert({ ...e, involvementPercent: n })} />
              <Button variant="ghost" size="icon" aria-label="Remove this entry" onClick={() => onRemove(e.id)}>
                <Trash2 />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[25, 50, 75, 100].map((v) => (
                <Button key={v} size="sm" variant="secondary" onClick={() => onUpsert({ ...e, involvementPercent: v })}>
                  {v}%
                </Button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground tabular">
                {contribution !== null ? `= ${formatCompact(contribution, 3)}% TBSA` : ''}
                {!BURN_DEPTH_MAP[e.depth].tbsaEligible && ' (not counted)'}
              </span>
            </div>
            <Input className="mt-2" aria-label="Notes" placeholder="Notes (optional)" value={e.notes ?? ''} onChange={(ev) => onUpsert({ ...e, notes: ev.target.value })} />
            <IssueList issues={issues.filter((i) => i.entryId === e.id)} />
          </div>
        );
      })}

      {rowEntries.length > 0 && (
        <p className={combined > 100 ? 'text-sm font-medium text-danger' : 'text-sm text-muted-foreground'}>
          Combined involvement: <span className="tabular">{formatCompact(combined, 2)}%</span> of this region (maximum 100%).
        </p>
      )}
      <IssueList issues={rowIssues} />

      <AddDepthButtons
        used={rowEntries.map((e) => e.depth)}
        onAdd={(depth) => onUpsert({ id: newId(), regionId, surface, depth, involvementPercent: Number.NaN, notes: '' })}
      />
    </div>
  );
}

/** Compact overview of every region row with recorded entries (accessible alternative to the map). */
export function RegionOverviewTable({
  data,
  columnId,
  entries,
  selected,
  onSelect,
}: {
  data: RegionalReferenceData;
  columnId: string | null;
  entries: RegionalEntryInput[];
  selected: { regionId: string; surface: Surface } | null;
  onSelect: (r: { regionId: string; surface: Surface }) => void;
}) {
  const [onlyAffected, setOnlyAffected] = useState(false);
  const rows = data.regions.filter((r) => !onlyAffected || entries.some((e) => e.regionId === r.id && e.surface === r.surface));
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyAffected} onChange={(e) => setOnlyAffected(e.target.checked)} className="accent-[var(--primary)]" />
        Show only affected regions
      </label>
      <div className="max-h-[420px] overflow-y-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Region</th>
              <th className="px-3 py-2 text-right font-semibold">Ref %</th>
              <th className="px-3 py-2 text-left font-semibold">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowEntries = entries.filter((e) => e.regionId === r.id && e.surface === r.surface);
              const isSel = selected?.regionId === r.id && selected.surface === r.surface;
              return (
                <tr
                  key={`${r.id}:${r.surface}`}
                  className={`cursor-pointer border-t hover:bg-muted/60 ${isSel ? 'bg-accent' : ''}`}
                  onClick={() => onSelect({ regionId: r.id, surface: r.surface })}
                >
                  <td className="px-3 py-1.5">
                    <button type="button" className="text-left hover:underline" aria-label={`Select ${r.label} ${r.surface}`}>
                      {r.label} <span className="text-muted-foreground">({r.surface === 'anterior' ? 'ant' : 'post'})</span>
                    </button>
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">{columnId ? formatCompact(r.percentByColumn[columnId], 2) : '—'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {rowEntries.map((e) => (
                        <Badge key={e.id} style={{ background: BURN_DEPTH_MAP[e.depth].color, color: '#fff' }}>
                          {BURN_DEPTH_MAP[e.depth].short} {Number.isFinite(e.involvementPercent) ? `${formatCompact(e.involvementPercent, 1)}%` : '?'}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Palm method                                                         */
/* ------------------------------------------------------------------ */

export function PalmEntriesEditor({
  entries,
  issues,
  palmPercent,
  selectedSegmentKey,
  onUpsert,
  onRemove,
}: {
  entries: PalmEntryInput[];
  issues: CalculationIssue[];
  palmPercent: number | null;
  selectedSegmentKey: string | null;
  onUpsert: (e: PalmEntryInput) => void;
  onRemove: (id: string) => void;
}) {
  const [newDepth, setNewDepth] = useState<BurnDepth | ''>('');
  const locations = BODY_SEGMENTS.flatMap((s) => s.surfaces.map((surf) => segmentKey(s.id, surf)));
  return (
    <div className="space-y-3" data-testid="palm-editor">
      {entries.length === 0 && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">No palm estimates recorded.</p>}
      {entries.map((e, idx) => (
        <div key={e.id} className="rounded-xl border p-3" data-testid="palm-entry">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Estimate {idx + 1}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select aria-label="Location" value={e.segmentKey ?? ''} onChange={(ev) => onUpsert({ ...e, segmentKey: ev.target.value || null })}>
              <option value="">Location not specified</option>
              {locations.map((k) => (
                <option key={k} value={k}>
                  {segmentKeyLabel(k)}
                </option>
              ))}
            </Select>
            <DepthSelect id={`pdepth-${e.id}`} value={e.depth} onChange={(depth) => onUpsert({ ...e, depth })} />
            <NumberCell id={`palms-${e.id}`} label="Number of palm-equivalents" value={e.palmEquivalents} suffix="palms" onCommit={(n) => onUpsert({ ...e, palmEquivalents: n })} />
            <div className="flex items-center justify-between gap-2">
              <span className="tabular text-xs text-muted-foreground">
                {Number.isFinite(e.palmEquivalents) && palmPercent ? `= ${formatCompact(e.palmEquivalents * palmPercent, 3)}% TBSA` : ''}
              </span>
              <Button variant="ghost" size="icon" aria-label="Remove this estimate" onClick={() => onRemove(e.id)}>
                <Trash2 />
              </Button>
            </div>
          </div>
          <Input className="mt-2" aria-label="Notes" placeholder="Notes (optional)" value={e.notes ?? ''} onChange={(ev) => onUpsert({ ...e, notes: ev.target.value })} />
          <IssueList issues={issues.filter((i) => i.entryId === e.id)} />
        </div>
      ))}
      <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="new-palm-depth" className="text-xs font-medium text-muted-foreground">
            New estimate {selectedSegmentKey ? `at ${segmentKeyLabel(selectedSegmentKey)}` : '(select a location on the map, optional)'}
          </label>
          <Select id="new-palm-depth" value={newDepth} onChange={(e) => setNewDepth(e.target.value as BurnDepth)}>
            <option value="">Choose burn depth…</option>
            {BURN_DEPTHS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          disabled={!newDepth}
          onClick={() => {
            if (!newDepth) return;
            onUpsert({ id: newId(), palmEquivalents: Number.NaN, depth: newDepth, segmentKey: selectedSegmentKey, notes: '' });
            setNewDepth('');
          }}
        >
          <Plus /> Add palm estimate
        </Button>
      </div>
    </div>
  );
}
