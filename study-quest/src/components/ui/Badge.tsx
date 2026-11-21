import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "sage" | "honey" | "lavender" | "olive" | "beige" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border border-line/80",
  sage: "bg-sage-soft text-sage-strong",
  honey: "bg-honey text-honey-strong",
  lavender: "bg-lavender text-lavender-strong",
  olive: "bg-olive text-olive-strong",
  beige: "bg-beige text-ink-2",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
