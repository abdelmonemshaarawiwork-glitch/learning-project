import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-soft text-sage-strong [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg font-medium text-ink">{title}</h3>
      {body ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-[13px] text-ink-3">{eyebrow}</div> : null}
        <h1 className="font-display text-[28px] leading-tight font-medium text-ink sm:text-[32px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[15px] text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto rounded-[12px] bg-surface-2 p-1 scrollbar-thin", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined ? (
            <span className={cn("tabular text-[12px]", value === o.value ? "text-ink-3" : "text-ink-3/80")}>{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        {icon ? <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular mt-1 text-xl font-semibold text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div> : null}
    </div>
  );
}
