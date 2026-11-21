"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { PartialPlan } from "@/lib/hooks/usePlanGeneration";
import { cn } from "@/lib/utils";

const STEPS = ["s0", "s1", "s2", "s3", "s4"] as const;

/** Calm progress view while a plan is generated: steps + the plan taking shape. */
export function PlanForming({ partial, onCancel }: { partial: PartialPlan | null; onCancel: () => void }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 500);
    return () => clearInterval(id);
  }, []);

  const stages = (partial?.stages ?? []).filter((s) => s && s.title);
  const missions = stages.reduce((n, s) => n + (s.levels ?? []).reduce((m, l) => m + (l?.missions?.length ?? 0), 0), 0);
  // Step progress follows what has actually been produced, with time as a gentle fallback.
  const step = Math.min(
    STEPS.length - 1,
    Math.max(Math.floor(elapsed / 6), stages.length > 0 ? 2 : 0, missions > 0 ? 3 : 0, missions > 8 ? 4 : 0),
  );

  return (
    <Card className="overflow-hidden p-6 sm:p-8" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5 text-sage" />
          <h2 className="font-display text-xl font-medium">{t("planner.generating")}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("planner.cancelGeneration")}
        </Button>
      </div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 text-[13px] transition-colors sm:flex-col sm:items-start", i <= step ? "text-ink" : "text-ink-3")}>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                i < step ? "bg-sage text-white dark:text-sage-ink" : i === step ? "breathe bg-sage-soft text-sage-strong" : "bg-muted",
              )}
            >
              {i < step ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            {t(`planner.generatingSteps.${s}`)}
          </li>
        ))}
      </ol>
      {partial?.title || stages.length > 0 ? (
        <div className="mt-8 border-t border-line pt-6">
          {partial?.title ? <div className="font-display text-lg font-medium text-ink animate-fade-in">{partial.title}</div> : null}
          <ol className="mt-4 space-y-4">
            {stages.map((s, si) => (
              <li key={si} className="animate-rise">
                <div className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">{t("map.stage", { n: si + 1 })}</div>
                <div className="text-[15px] font-medium text-ink">{s.title}</div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {(s.levels ?? [])
                    .filter((l) => l && l.title)
                    .map((l, li) => (
                      <li key={li} className="animate-fade-in rounded-full bg-surface-2 px-3 py-1 text-[12.5px] text-ink-2">
                        {l.title}
                        {l.missions?.length ? <span className="tabular ms-1.5 text-ink-3">· {l.missions.length}</span> : null}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
}
