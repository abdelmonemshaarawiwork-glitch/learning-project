import * as React from 'react';
import { cn } from '@/utils/cn';

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  className?: string;
}) {
  const toneCls = {
    default: 'bg-accent text-accent-foreground',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
  }[tone];
  return (
    <div className={cn('flex min-w-0 items-start gap-3 rounded-[var(--radius-card)] border bg-card p-4 shadow-[var(--shadow-card)]', className)}>
      {icon && <div className={cn('rounded-lg p-2 [&_svg]:size-5', toneCls)}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Key-value list used on detail pages. */
export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-sm break-words whitespace-pre-wrap">{it.value === '' || it.value === null || it.value === undefined ? '—' : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
