import { cn } from "@/lib/utils";

/** A quiet mark: a path rising through three milestones. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--sage-strong)" />
      <path d="M8 23c4.5 0 5-6 8.5-7.5S22 14 24 9" fill="none" stroke="#f8f7f2" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8.5" cy="22.5" r="2.2" fill="#f8f7f2" />
      <circle cx="16.3" cy="15.8" r="2.2" fill="#f8f7f2" />
      <circle cx="23.6" cy="9.4" r="2.2" fill="#f8f7f2" fillOpacity="0.55" />
    </svg>
  );
}

export function Logo({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[19px] font-medium tracking-tight text-ink">{label}</span>
    </span>
  );
}
