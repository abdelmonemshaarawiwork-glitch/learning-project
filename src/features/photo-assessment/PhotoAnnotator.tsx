import { Hand, Minus, Plus, Redo2, SplitSquareHorizontal, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { BODY_SEGMENT_MAP, BURN_DEPTHS, BURN_DEPTH_MAP, type BodySegmentId } from '@/constants/clinical';
import {
  isSideView,
  measurePhoto,
  polygonArea,
  simplifyPath,
  type NormPoint,
  type PhotoAnnotation,
  type PhotoView,
} from '@/engines/photo-planimetry';
import type { BurnDepth } from '@/types/domain';
import { cn } from '@/utils/cn';
import { newId } from '@/utils/ids';
import { formatCompact } from '@/utils/rounding';
import { SEGMENT_COLORS, VIEW_LABEL, type PhotoArea } from './photoAreas';

type Tool = 'outline' | 'burn' | 'divider' | 'anterior' | 'pan';

export interface PhotoAnnotatorProps {
  imageUrl: string;
  width: number;
  height: number;
  view: PhotoView;
  area: PhotoArea;
  annotation: PhotoAnnotation;
  onChange: (a: PhotoAnnotation) => void;
}

const pts = (points: NormPoint[]) => points.map((p) => `${p.x},${p.y}`).join(' ');
const centroid = (points: NormPoint[]) => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
});
const MIN_AREA = 0.0002;

export function PhotoAnnotator({ imageUrl, width, height, view, area, annotation, onChange }: PhotoAnnotatorProps) {
  const side = isSideView(view);
  const [tool, setTool] = useState<Tool>(annotation.outlines.length === 0 ? 'outline' : 'burn');
  const [segment, setSegment] = useState<BodySegmentId>(area.segments[0]!);
  const [depth, setDepth] = useState<BurnDepth | ''>('');
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<NormPoint[] | null>(null);
  const [history, setHistory] = useState<PhotoAnnotation[]>([]);
  const [future, setFuture] = useState<PhotoAnnotation[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const aspect = width / height;

  const commit = (next: PhotoAnnotation) => {
    setHistory((h) => [...h.slice(-49), annotation]);
    setFuture([]);
    onChange(next);
  };

  const toPoint = (e: React.PointerEvent): NormPoint => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'pan') return;
    if (tool === 'burn' && !depth) return;
    e.preventDefault();
    const p = toPoint(e);
    if (tool === 'anterior') {
      if (annotation.divider) commit({ ...annotation, divider: { ...annotation.divider, anteriorPoint: p } });
      setTool('burn');
      return;
    }
    svgRef.current?.setPointerCapture?.(e.pointerId);
    setDraft([p]);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const p = toPoint(e);
    if (tool === 'divider') {
      setDraft([draft[0]!, p]);
      return;
    }
    const last = draft[draft.length - 1]!;
    if (Math.hypot((p.x - last.x) * aspect, p.y - last.y) > 0.004) setDraft([...draft, p]);
  };
  const onUp = () => {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    if (tool === 'divider') {
      if (d.length === 2 && Math.hypot(d[1]!.x - d[0]!.x, d[1]!.y - d[0]!.y) > 0.05) {
        commit({ ...annotation, divider: { a: d[0]!, b: d[1]!, anteriorPoint: null } });
        setTool('anterior');
      }
      return;
    }
    const simplified = simplifyPath(d, 0.0015);
    if (simplified.length < 3 || polygonArea(simplified) < MIN_AREA) return;
    if (tool === 'outline') commit({ ...annotation, outlines: [...annotation.outlines, { id: newId(), segment, points: simplified }] });
    if (tool === 'burn' && depth) commit({ ...annotation, burns: [...annotation.burns, { id: newId(), depth, points: simplified }] });
  };

  const measurement = useMemo(() => measurePhoto({ id: 'live', view, aspect, annotation }, 240), [view, aspect, annotation]);

  const toolButton = (t: Tool, label: React.ReactNode, testId: string, disabled = false) => (
    <Button size="sm" variant={tool === t ? 'default' : 'outline'} onClick={() => setTool(t)} disabled={disabled} aria-pressed={tool === t} data-testid={testId}>
      {label}
    </Button>
  );

  const instruction =
    tool === 'outline'
      ? `Trace the whole visible outline of the ${BODY_SEGMENT_MAP[segment].label.toLowerCase()} with your finger or mouse.`
      : tool === 'burn'
        ? depth
          ? `Trace each burned area of ${BURN_DEPTH_MAP[depth].label.toLowerCase()} depth.`
          : 'Choose the burn depth first — depth is never assumed.'
        : tool === 'divider'
          ? 'Drag a line along the side of the limb/body separating the front (anterior) half from the back (posterior) half.'
          : tool === 'anterior'
            ? 'Tap anywhere on the ANTERIOR (front) side of the divider line.'
            : 'Pan mode: scroll/drag to move around the zoomed photo.';

  return (
    <div className="space-y-3" data-testid="photo-annotator">
      <div className="flex flex-wrap items-center gap-2">
        {toolButton('outline', 'Outline segment', 'tool-outline')}
        <Select aria-label="Segment to outline" value={segment} onChange={(e) => { setSegment(e.target.value as BodySegmentId); setTool('outline'); }} className="h-8 w-auto text-xs">
          {area.segments.map((s) => (
            <option key={s} value={s}>
              {BODY_SEGMENT_MAP[s].label}
            </option>
          ))}
        </Select>
        {toolButton('burn', 'Trace burn', 'tool-burn')}
        <Select aria-label="Burn depth" value={depth} onChange={(e) => { setDepth(e.target.value as BurnDepth); setTool('burn'); }} className="h-8 w-auto text-xs" data-testid="burn-depth">
          <option value="">Choose depth…</option>
          {BURN_DEPTHS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
        {side && toolButton('divider', <><SplitSquareHorizontal /> Divider</>, 'tool-divider')}
        {toolButton('pan', <><Hand /> Pan</>, 'tool-pan')}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="outline" aria-label="Undo" disabled={!history.length} onClick={() => { const prev = history.at(-1)!; setHistory(history.slice(0, -1)); setFuture([annotation, ...future]); onChange(prev); }}>
            <Undo2 />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Redo" disabled={!future.length} onClick={() => { const next = future[0]!; setFuture(future.slice(1)); setHistory([...history, annotation]); onChange(next); }}>
            <Redo2 />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <Minus />
          </Button>
          <span className="w-10 text-center text-xs tabular">{zoom}×</span>
          <Button size="icon-sm" variant="outline" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
            <Plus />
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        <strong className="text-foreground">{VIEW_LABEL[view]}.</strong> {instruction}
      </p>

      <div className="max-h-[62vh] overflow-auto rounded-xl border bg-black/90">
        <div className="relative mx-auto" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? `min(100%, calc(62vh * ${aspect}))` : undefined }}>
          <img src={imageUrl} alt={`${area.label} — ${VIEW_LABEL[view]}`} className="block h-auto w-full select-none" draggable={false} />
          <svg
            ref={svgRef}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className={cn('absolute inset-0 h-full w-full', tool === 'pan' ? 'pointer-events-none' : 'cursor-crosshair touch-none')}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDraft(null)}
            data-testid="annotation-surface"
          >
            <defs>
              <pattern id="photo-hatch" width="0.02" height="0.02" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="0.02" height="0.02" fill={BURN_DEPTH_MAP.indeterminate.color} fillOpacity="0.25" />
                <line x1="0" y1="0" x2="0" y2="0.02" stroke={BURN_DEPTH_MAP.indeterminate.color} strokeWidth="0.008" />
              </pattern>
            </defs>
            {annotation.outlines.map((o) => (
              <polygon key={o.id} points={pts(o.points)} fill="none" stroke={SEGMENT_COLORS[o.segment] ?? '#38bdf8'} strokeWidth={2.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            ))}
            {annotation.burns.map((b) => (
              <polygon
                key={b.id}
                points={pts(b.points)}
                fill={b.depth === 'indeterminate' ? 'url(#photo-hatch)' : BURN_DEPTH_MAP[b.depth].color}
                fillOpacity={b.depth === 'indeterminate' ? 1 : 0.45}
                stroke={BURN_DEPTH_MAP[b.depth].color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {annotation.divider && (
              <line x1={annotation.divider.a.x} y1={annotation.divider.a.y} x2={annotation.divider.b.x} y2={annotation.divider.b.y} stroke="#fde047" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            )}
            {draft && draft.length > 1 && (tool === 'divider' ? (
              <line x1={draft[0]!.x} y1={draft[0]!.y} x2={draft[1]!.x} y2={draft[1]!.y} stroke="#fde047" strokeWidth={3} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            ) : (
              <polyline points={pts(draft)} fill="none" stroke={tool === 'burn' && depth ? BURN_DEPTH_MAP[depth].color : '#ffffff'} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {annotation.outlines.map((o) => {
            const c = centroid(o.points);
            return (
              <span key={`l-${o.id}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
                {BODY_SEGMENT_MAP[o.segment].label}
              </span>
            );
          })}
          {annotation.divider?.anteriorPoint && (
            <span className="pointer-events-none absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-yellow-300 text-xs font-bold text-black" style={{ left: `${annotation.divider.anteriorPoint.x * 100}%`, top: `${annotation.divider.anteriorPoint.y * 100}%` }}>
              A
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Traced shapes</p>
          {annotation.outlines.length + annotation.burns.length === 0 && !annotation.divider && <p className="text-sm text-muted-foreground">Nothing traced yet.</p>}
          <ul className="space-y-1 text-sm" data-testid="shape-list">
            {annotation.outlines.map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <span className="size-3 rounded-sm border-2 border-dashed" style={{ borderColor: SEGMENT_COLORS[o.segment] }} />
                Outline: {BODY_SEGMENT_MAP[o.segment].label}
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete outline ${BODY_SEGMENT_MAP[o.segment].label}`} onClick={() => commit({ ...annotation, outlines: annotation.outlines.filter((x) => x.id !== o.id) })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
            {annotation.burns.map((b, i) => (
              <li key={b.id} className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: BURN_DEPTH_MAP[b.depth].color }} />
                Burn {i + 1}: {BURN_DEPTH_MAP[b.depth].label}
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete burn ${i + 1}`} onClick={() => commit({ ...annotation, burns: annotation.burns.filter((x) => x.id !== b.id) })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
            {annotation.divider && (
              <li className="flex items-center gap-2">
                <span className="h-0.5 w-3 bg-yellow-300" />
                Divider {annotation.divider.anteriorPoint ? '(anterior side marked)' : '— anterior side not marked'}
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Delete divider" onClick={() => commit({ ...annotation, divider: null })}>
                  <Trash2 />
                </Button>
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border p-3" data-testid="photo-measurement">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">This photo</p>
          {measurement.segments.length === 0 && <p className="text-sm text-muted-foreground">Trace a segment outline to measure.</p>}
          <ul className="space-y-1 text-sm">
            {measurement.segments.flatMap((s) =>
              s.parts.map((p) => {
                const burned = BURN_DEPTHS.filter((d) => p.burnedPx[d.id] > 0);
                return (
                  <li key={`${s.segment}-${p.surface}`}>
                    <span className="font-medium">{BODY_SEGMENT_MAP[s.segment].label}</span> <span className="text-muted-foreground">({p.surface}{side ? `, ${formatCompact((p.px / s.totalPx) * 100, 0)}% of visible segment` : ''})</span>:{' '}
                    {burned.length === 0
                      ? 'no burn traced'
                      : burned.map((d) => `${BURN_DEPTH_MAP[d.id].short} ${formatCompact((p.burnedPx[d.id] / p.px) * 100, 1)}%`).join(' · ')}
                  </li>
                );
              }),
            )}
          </ul>
          <div className="mt-2 space-y-1">
            {measurement.issues.map((i, k) => (
              <Alert key={k} variant={i.severity === 'error' ? 'danger' : i.severity === 'warning' ? 'warning' : 'neutral'} className="p-2 text-xs">
                {i.message}
              </Alert>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
