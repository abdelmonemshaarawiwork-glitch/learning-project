"use client";

import { BookOpen, Brain, CalendarDays, Dumbbell, Layers, ListChecks, NotebookPen, PenLine, RotateCcw, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import type { ActivityType, Mission } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  read: BookOpen,
  watch: Video,
  notes: NotebookPen,
  recall: Brain,
  practice: Dumbbell,
  quiz: ListChecks,
  review: RotateCcw,
  diagram: PenLine,
  flashcards: Layers,
  project: CalendarDays,
};

export function MissionMeta({ mission, className }: { mission: Pick<Mission, "activity" | "estimatedMinutes" | "difficulty" | "required">; className?: string }) {
  const { t, formatMinutes } = useI18n();
  const Icon = ACTIVITY_ICON[mission.activity] ?? BookOpen;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3", className)}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" />
        {t(`mission.activity.${mission.activity}`)}
      </span>
      <span aria-hidden>·</span>
      <span className="tabular">{formatMinutes(mission.estimatedMinutes)}</span>
      <span aria-hidden>·</span>
      <span>{t(`mission.difficulty.${mission.difficulty}`)}</span>
      {!mission.required ? (
        <>
          <span aria-hidden>·</span>
          <span className="text-lavender-strong">{t("map.optionalMission")}</span>
        </>
      ) : null}
    </div>
  );
}
