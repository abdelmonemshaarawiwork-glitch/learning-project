"use client";

import { ArrowRight, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Progress";
import { questHref, studyHref } from "@/lib/client/actions";
import { daysUntil, findLevel, findMission, suggestedDailyMinutes } from "@/lib/domain/progression";
import type { Quest } from "@/lib/domain/types";
import { useToday } from "@/lib/hooks/data";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function DeadlineChip({ quest }: { quest: Quest }) {
  const { t, tp, formatDate } = useI18n();
  const today = useToday();
  const d = daysUntil(quest.deadline, today);
  if (d === null || quest.status === "completed") return null;
  const label = d < 0 ? t("quest.overdue") : tp("quest.daysLeft", d);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[12.5px]", d <= 3 ? "text-honey-strong" : "text-ink-3")}
      title={t("quest.deadline", { date: formatDate(new Date(quest.deadline + "T12:00:00Z"), { dateStyle: "medium" }, "UTC") })}
    >
      <CalendarClock className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function QuestCard({ quest, menu }: { quest: Quest; menu?: ReactNode }) {
  const { t, formatMinutes } = useI18n();
  const today = useToday();
  const s = quest.summary;
  const level = s.currentLevelId ? findLevel(quest.stages, s.currentLevelId) : null;
  const next = s.nextMissionId ? findMission(quest.stages, s.nextMissionId) : null;
  const pace = suggestedDailyMinutes(quest, today);
  const canContinue = quest.status === "active" && next;

  return (
    <Card className="group relative flex flex-col p-5 transition-shadow duration-200 hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {quest.status !== "active" ? (
              <Badge tone={quest.status === "completed" ? "sage" : quest.status === "paused" ? "honey" : "neutral"}>
                {t(`quest.status.${quest.status}`)}
              </Badge>
            ) : null}
            <DeadlineChip quest={quest} />
          </div>
          <h3 className="font-display text-[19px] leading-snug font-medium text-ink">
            <Link href={questHref(quest.id)} className="outline-none after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:underline">
              {quest.title}
            </Link>
          </h3>
          {quest.description ? <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{quest.description}</p> : null}
        </div>
        {menu ? <div className="relative z-10 -me-2 -mt-1">{menu}</div> : null}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
          <span className="font-medium text-ink-2">{t("quest.progress", { percent: s.percent })}</span>
          <span className="tabular text-ink-3">{t("quest.missionsProgress", { done: s.completedMissions, total: s.totalMissions })}</span>
        </div>
        <ProgressBar value={s.percent} label={quest.title} />
      </div>

      {level && quest.status !== "completed" ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div className="min-w-0">
            <dt className="text-ink-3">{t("quest.currentStage")}</dt>
            <dd className="truncate font-medium text-ink">{level.stage.title}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-ink-3">{t("quest.currentLevel")}</dt>
            <dd className="truncate font-medium text-ink">
              {level.index + 1}. {level.level.title}
            </dd>
          </div>
        </dl>
      ) : null}

      {next && quest.status !== "completed" ? (
        <div className="mt-4 rounded-xl bg-surface-2 px-3.5 py-3">
          <div className="text-[12px] text-ink-3">{t("quest.nextMission")}</div>
          <div className="mt-0.5 line-clamp-2 text-sm font-medium text-ink">{next.mission.title}</div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <div className="text-[12.5px] text-ink-3">
          {quest.status === "completed" ? (
            t("quest.complete")
          ) : (
            <>
              <span className="tabular">{t("quest.remaining", { time: formatMinutes(s.remainingMinutes) })}</span>
              {pace ? <span className="block">{t("quest.pace", { min: pace })}</span> : null}
            </>
          )}
        </div>
        {canContinue ? (
          <Link
            href={studyHref(quest.id, next!.mission.id)}
            className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-[11px] bg-sage-strong px-3.5 text-[13px] font-medium text-white shadow-soft transition-colors hover:bg-[color-mix(in_oklab,var(--sage-strong),black_8%)] dark:text-sage-ink"
          >
            {t("quest.continue")}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        ) : (
          <Link href={questHref(quest.id)} className="relative z-10 text-[13px] font-medium text-sage-strong hover:underline">
            {t("quest.viewMap")}
          </Link>
        )}
      </div>
    </Card>
  );
}
