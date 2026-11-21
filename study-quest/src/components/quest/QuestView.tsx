"use client";

import { ArrowLeft, ArrowRight, Pause, Pencil, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/Misc";
import { ProgressRing } from "@/components/ui/Progress";
import { actions, studyHref } from "@/lib/client/actions";
import { apiErrorMessage } from "@/lib/client/errors";
import { findMission, suggestedDailyMinutes } from "@/lib/domain/progression";
import { useQuest, useToday } from "@/lib/hooks/data";
import { DeadlineChip } from "./QuestCard";
import { LevelMap } from "./LevelMap";
import { LevelSheet } from "./LevelSheet";
import { QuestMenu } from "./QuestMenu";

export function QuestView({ questId }: { questId: string }) {
  const { t, formatMinutes, formatDate } = useI18n();
  const router = useRouter();
  const today = useToday();
  const { data: quest, loading } = useQuest(questId);
  const [openLevel, setOpenLevel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!quest) {
    return (
      <EmptyState
        title={t("errors.quest_not_found")}
        action={
          <Link href="/quests">
            <Button variant="secondary">{t("quests.title")}</Button>
          </Link>
        }
      />
    );
  }

  const s = quest.summary;
  const next = s.nextMissionId ? findMission(quest.stages, s.nextMissionId) : null;
  const pace = suggestedDailyMinutes(quest, today);

  async function setStatus(action: "pause" | "resume" | "unarchive") {
    setBusy(true);
    try {
      await actions.setStatus(questId, action);
      toast(t(action === "pause" ? "quests.paused" : action === "resume" ? "quests.resumed" : "quests.unarchived"));
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <Link href="/quests" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        {t("quests.title")}
      </Link>

      <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={quest.status === "completed" ? "sage" : quest.status === "paused" ? "honey" : quest.status === "archived" ? "neutral" : "olive"}>
              {t(`quest.status.${quest.status}`)}
            </Badge>
            <Badge tone="beige">{t(`quest.complexity.${quest.complexity}`)}</Badge>
            <span className="text-[12px] text-ink-3">{t(`quest.source.${quest.source}`)}</span>
            <DeadlineChip quest={quest} />
          </div>
          <h1 className="font-display text-[28px] leading-tight font-medium text-ink sm:text-[34px]">{quest.title}</h1>
          {quest.description ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{quest.description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {quest.status !== "archived" ? (
            <Link
              href={`/quests/${quest.id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-line bg-surface px-4 text-sm font-medium text-ink shadow-soft hover:bg-surface-2"
            >
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Link>
          ) : null}
          <QuestMenu quest={quest} onRegenerate={() => router.push(`/quests/${quest.id}/edit?regenerate=1`)} />
        </div>
      </header>

      {quest.status === "paused" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-honey px-4 py-3 text-sm text-honey-strong">
          {t("quests.pausedBanner")}
          <Button size="sm" variant="secondary" loading={busy} onClick={() => setStatus("resume")}>
            <Play className="h-3.5 w-3.5" />
            {t("quests.actions.resume")}
          </Button>
        </div>
      ) : null}
      {quest.status === "archived" ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {t("quests.archivedBanner")}
          <Button size="sm" variant="secondary" loading={busy} onClick={() => setStatus("unarchive")}>
            {t("quests.actions.unarchive")}
          </Button>
        </div>
      ) : null}

      <Card className="mb-8 grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
        <ProgressRing value={s.percent} size={84} stroke={7} label={t("quest.progress", { percent: s.percent })}>
          <span className="tabular text-lg font-semibold text-ink">{s.percent}%</span>
        </ProgressRing>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[12px] text-ink-3">{t("map.missions")}</div>
            <div className="tabular text-lg font-semibold">{s.completedMissions}/{s.totalMissions}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">{t("quest.levelsLabel")}</div>
            <div className="tabular text-lg font-semibold">{s.completedLevels}/{s.totalLevels}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-3">{quest.status === "completed" ? t("quest.complete") : t("quest.remainingLabel")}</div>
            <div className="tabular text-lg font-semibold">
              {quest.status === "completed" && quest.completedAt
                ? formatDate(quest.completedAt, { dateStyle: "medium" })
                : formatMinutes(s.remainingMinutes)}
            </div>
            {pace ? <div className="text-[12px] text-ink-3">{t("quest.pace", { min: pace })}</div> : null}
          </div>
        </div>
        {next && quest.status === "active" ? (
          <Link
            href={studyHref(quest.id, next.mission.id)}
            className="flex items-center justify-between gap-4 rounded-2xl bg-sage-soft p-4 transition-colors hover:bg-[color-mix(in_oklab,var(--sage-soft),var(--sage)_12%)] sm:max-w-xs"
          >
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-sage-strong">{t("quest.nextMission")}</span>
              <span className="mt-0.5 line-clamp-2 block text-sm font-medium text-ink">{next.mission.title}</span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-strong text-white dark:text-sage-ink">
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </span>
          </Link>
        ) : quest.status === "active" ? (
          <Button variant="secondary" onClick={() => setStatus("pause")} loading={busy}>
            <Pause className="h-4 w-4" />
            {t("quests.actions.pause")}
          </Button>
        ) : null}
      </Card>

      {quest.prerequisites.length || quest.pacingNote ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {quest.prerequisites.length ? (
            <Card className="p-5">
              <h2 className="text-[13px] font-semibold">{t("quest.prerequisites")}</h2>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-[14px] text-ink-2">
                {quest.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          {quest.pacingNote ? (
            <Card className="p-5">
              <h2 className="text-[13px] font-semibold">{t("quest.pacing")}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{quest.pacingNote}</p>
            </Card>
          ) : null}
        </div>
      ) : null}

      <h2 className="mb-5 font-display text-2xl font-medium">{t("map.journey")}</h2>
      <LevelMap quest={quest} onOpenLevel={setOpenLevel} />
      <LevelSheet quest={quest} levelId={openLevel} onClose={() => setOpenLevel(null)} />
    </div>
  );
}
