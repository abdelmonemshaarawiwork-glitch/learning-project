import { useState } from 'react';
import { BURN_DEPTH_MAP, segmentKey, segmentKeyLabel } from '@/constants/clinical';
import type { BurnDepth } from '@/types/domain';
import { cn } from '@/utils/cn';
import {
  ANTERIOR_SHAPES,
  FIGURE_WIDTH,
  MAP_VIEWBOX,
  POSTERIOR_OFFSET_X,
  POSTERIOR_SHAPES,
  SIDE_LABELS,
  shapePath,
  type MapShape,
} from './geometry2d';

export interface BodyMapProps {
  depthBySegment: Map<string, BurnDepth>;
  /** Segment keys highlighted as the current selection. */
  selectedKeys?: string[];
  onSelectSegment?: (segmentKey: string) => void;
  readOnly?: boolean;
  className?: string;
}

/** Accessible 2D anatomical region selector (works without WebGL). */
export function BodyMap2D({ depthBySegment, selectedKeys = [], onSelectSegment, readOnly, className }: BodyMapProps) {
  const [hover, setHover] = useState<string | null>(null);
  const selected = new Set(selectedKeys);

  const renderShape = (s: MapShape, offsetX: number) => {
    const key = segmentKey(s.segment, s.surface);
    const depth = depthBySegment.get(key);
    const isSel = selected.has(key);
    const isHover = hover === key;
    const label = `${segmentKeyLabel(key)}${depth ? ` — ${BURN_DEPTH_MAP[depth].label}` : ''}`;
    const interactive = !readOnly && !!onSelectSegment;
    return (
      <path
        key={key}
        d={shapePath(s.points, offsetX)}
        data-segment={key}
        data-depth={depth ?? 'none'}
        role={interactive ? 'button' : 'img'}
        tabIndex={interactive ? 0 : undefined}
        aria-label={label}
        aria-pressed={interactive ? isSel : undefined}
        onClick={interactive ? () => onSelectSegment?.(key) : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSegment?.(key);
                }
              }
            : undefined
        }
        onPointerEnter={() => setHover(key)}
        onPointerLeave={() => setHover((h) => (h === key ? null : h))}
        fill={depth ? BURN_DEPTH_MAP[depth].color : 'var(--muted)'}
        fillOpacity={depth ? (isHover ? 0.8 : 0.95) : isHover ? 0.55 : 1}
        stroke={isSel ? 'var(--primary)' : 'var(--muted-foreground)'}
        strokeOpacity={isSel ? 1 : 0.55}
        strokeWidth={isSel ? 2.4 : 0.9}
        strokeLinejoin="round"
        className={cn(interactive && 'cursor-pointer outline-none focus-visible:stroke-[var(--ring)]')}
        style={depth === 'indeterminate' ? { fill: 'url(#hatch-indeterminate)' } : undefined}
      >
        <title>{label}</title>
      </path>
    );
  };

  const sideLabel = (text: string, x: number) => (
    <text x={x} y={20} fontSize={11} fontWeight={700} fill="var(--muted-foreground)" textAnchor="middle">
      {text}
    </text>
  );

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        className="mx-auto block h-auto w-full max-w-[520px] touch-manipulation select-none"
        role="group"
        aria-label="2D body map: anterior and posterior views"
      >
        <defs>
          <pattern id="hatch-indeterminate" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={BURN_DEPTH_MAP.indeterminate.color} fillOpacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={BURN_DEPTH_MAP.indeterminate.color} strokeWidth="3" />
          </pattern>
        </defs>
        <g>
          {sideLabel(SIDE_LABELS.anterior.viewerLeft, 10)}
          {sideLabel(SIDE_LABELS.anterior.viewerRight, FIGURE_WIDTH - 10)}
          {ANTERIOR_SHAPES.map((s) => renderShape(s, 0))}
          <text x={FIGURE_WIDTH / 2} y={402} fontSize={12} fontWeight={600} fill="var(--foreground)" textAnchor="middle">
            Anterior
          </text>
        </g>
        <g>
          {sideLabel(SIDE_LABELS.posterior.viewerLeft, POSTERIOR_OFFSET_X + 10)}
          {sideLabel(SIDE_LABELS.posterior.viewerRight, POSTERIOR_OFFSET_X + FIGURE_WIDTH - 10)}
          {POSTERIOR_SHAPES.map((s) => renderShape(s, POSTERIOR_OFFSET_X))}
          <text x={POSTERIOR_OFFSET_X + FIGURE_WIDTH / 2} y={402} fontSize={12} fontWeight={600} fill="var(--foreground)" textAnchor="middle">
            Posterior
          </text>
        </g>
      </svg>
      <p className="mt-1 text-center text-xs text-muted-foreground" aria-live="polite">
        {hover ? segmentKeyLabel(hover) : 'R / L = patient’s right / left. Tap a region to select it.'}
      </p>
    </div>
  );
}

export function DepthLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs', className)} aria-label="Burn depth colour legend">
      {Object.values(BURN_DEPTH_MAP).map((d) => (
        <li key={d.id} className="flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded-sm border border-black/10"
            style={{ background: d.id === 'indeterminate' ? `repeating-linear-gradient(45deg, ${d.color}, ${d.color} 2px, transparent 2px, transparent 4px)` : d.color }}
          />
          <span>
            {d.label}
            {!d.tbsaEligible && <span className="text-muted-foreground"> (not in TBSA)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
