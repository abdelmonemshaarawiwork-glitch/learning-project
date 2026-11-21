"use client";

import { Check, Lock } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import {
  computeLevelStates,
  flattenLevels,
  levelEstimatedMinutes,
  levelProgress,
  stageProgress,
  isStageComplete,
} from "@/lib/domain/progression";
import type { Level, LevelState, Quest } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function Node({ n, state, current, percent }: { n: number; state: LevelState; current: boolean; percent: number }) {
  const halo = current ? "ring-[5px] ring-sage-soft" : "";
  if (state === "completed") {
    return (
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-sage text-white shadow-soft dark:text-sage-ink", halo)}>
        <Check className="h-5 w-5" strokeWidth={2.5} />
      </span>
    );
  }
  if (state === "locked") {
    return (
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-3">
        <Lock className="h-4 w-4" />
      </span>
    );
  }
  if (state === "in_progress") {
    return (
      <span className={cn("flex rounded-full bg-surface shadow-soft", halo)}>
        <ProgressRing value={percent} size={44} stroke={3}>
          <span className="tabular text-sm font-semibold text-sage-strong">{n}</span>
        </ProgressRing>
      </span>
    );
  }
  return (
    <span className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2 border-sage bg-surface shadow-soft", halo)}>
      <span className="tabular text-sm font-semibold text-sage-strong">{n}</span>
    </span>
  );
}

function LevelCard({
  level,
  n,
  state,
  current,
  onOpen,
  align,
}: {
  level: Level;
  n: number;
  state: LevelState;
  current: boolean;
  onOpen: () => void;
  align: "start" | "end";
}) {
  const { t, formatMinutes } = useI18n();
  const p = levelProgress(level);
  const locked = state === "locked";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group w-full rounded-[var(--radius-card)] border p-4 text-start transition-[box-shadow,border-color,background-color] duration-200",
        locked ? "border-line/70 bg-surface-2/60 hover:bg-surface-2" : "border-line/70 bg-surface shadow-soft hover:shadow-card",
        current && "border-sage/50",
        align === "end" && "md:text-end",
      )}
      aria-label={`${t("map.level", { n })}: ${level.title} — ${t(`map.state.${state}`)}`}
    >
      <div className={cn("flex items-center gap-2 text-[12px]", align === "end" && "md:justify-end")}>
        <span className="font-medium text-ink-3">{t("map.level", { n })}</span>
        <span aria-hidden className="text-ink-3">·</span>
        <span
          className={cn(
            "font-medium",
            state === "completed" && "text-sage-strong",
            state === "in_progress" && "text-sage-strong",
            state === "available" && "text-ink-2",
            state === "locked" && "text-ink-3",
          )}
        >
          {level.skipped && state !== "completed" ? t("map.skipped") : t(`map.state.${state}`)}
        </span>
      </div>
      <div className={cn("mt-1 text-[15px] leading-snug font-medium", locked ? "text-ink-2" : "text-ink")}>{level.title}</div>
      {!locked && state !== "completed" ? (
        <div className="mt-3">
          <ProgressBar value={p.percent} size="sm" label={level.title} />
        </div>
      ) : null}
      <div className={cn("tabular mt-2 flex flex-wrap gap-x-3 text-[12px] text-ink-3", align === "end" && "md:justify-end")}>
        <span>{t("quest.missionsProgress", { done: p.done, total: p.total })}</span>
        <span>{t("map.estimated", { time: formatMinutes(levelEstimatedMinutes(level)) })}</span>
      </div>
    </button>
  );
}

export function LevelMap({ quest, onOpenLevel }: { quest: Quest; onOpenLevel: (levelId: string) => void }) {
  const { t } = useI18n();
  const states = computeLevelStates(quest.stages);
  const flat = flattenLevels(quest.stages);
  const currentId = quest.status === "completed" ? null : quest.summary.currentLevelId;

  return (
    <ol className="relative" aria-label={t("map.journey")}>
      {quest.stages.map((stage, si) => {
        const sp = stageProgress(stage);
        const done = isStageComplete(stage);
        return (
          <li key={stage.id} className="relative">
            {/* Stage header */}
            <div className={cn("relative z-10 flex items-center gap-3 pb-5", si > 0 && "pt-4", "md:justify-center")}>
              {si > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 bottom-0 start-[21px] w-0 border-s-2 md:start-1/2 md:-ms-px",
                    isStageComplete(quest.stages[si - 1]) ? "border-sage/70" : "border-dashed border-line",
                  )}
                />
              ) : null}
              <div className="relative flex min-w-0 items-center gap-3 rounded-2xl bg-canvas py-1 pe-3 md:px-4 md:text-center">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[13px] font-semibold md:hidden",
                    done ? "bg-sage-soft text-sage-strong" : "bg-beige text-ink-2",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="h-4 w-4" /> : si + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">
                    {t("map.stage", { n: si + 1 })}
                    {done ? <span className="ms-2 text-sage-strong normal-case">· {t("map.stageComplete")}</span> : null}
                  </div>
                  <h3 className="font-display text-lg leading-snug font-medium text-ink">{stage.title}</h3>
                  <div className="tabular text-[12px] text-ink-3">{t("quest.levelsProgress", { done: sp.done, total: sp.total })}</div>
                </div>
              </div>
            </div>
            <ol>
              {stage.levels.map((level) => {
                const ref = flat.find((r) => r.level.id === level.id)!;
                const n = ref.index + 1;
                const state = states.get(level.id)!;
                const isLast = ref.index === flat.length - 1;
                const nextState = !isLast ? states.get(flat[ref.index + 1].level.id) : undefined;
                const align = ref.index % 2 === 0 ? "end" : "start";
                const lineSolid = state === "completed" && nextState !== "locked";
                return (
                  <li
                    key={level.id}
                    className="relative grid grid-cols-[44px_1fr] gap-x-4 pb-5 md:grid-cols-[1fr_56px_1fr] md:gap-x-5"
                  >
                    {/* connector to the next milestone */}
                    {!isLast ? (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-11 bottom-0 start-[21px] w-0 border-s-2 md:start-1/2 md:-ms-px",
                          lineSolid ? "border-sage/70" : "border-dashed border-line",
                        )}
                      />
                    ) : null}
                    <div className={cn("hidden md:block", align === "end" ? "md:col-start-1" : "md:col-start-3", "md:row-start-1")}>
                      <LevelCard level={level} n={n} state={state} current={level.id === currentId} onOpen={() => onOpenLevel(level.id)} align={align} />
                    </div>
                    <div className="relative z-10 col-start-1 row-start-1 flex justify-center md:col-start-2">
                      <button type="button" onClick={() => onOpenLevel(level.id)} className="rounded-full" aria-label={level.title} tabIndex={-1}>
                        <Node n={n} state={state} current={level.id === currentId} percent={levelProgress(level).percent} />
                      </button>
                    </div>
                    <div className="col-start-2 row-start-1 md:hidden">
                      <LevelCard level={level} n={n} state={state} current={level.id === currentId} onOpen={() => onOpenLevel(level.id)} align="start" />
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
