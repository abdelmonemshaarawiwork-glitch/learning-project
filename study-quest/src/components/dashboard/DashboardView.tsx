"use client";

import { ArrowRight, Clock, Flame, Map as MapIcon, Sparkles, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { MissionMeta } from "@/components/quest/MissionMeta";
import { QuestCard } from "@/components/quest/QuestCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Skeleton, StatTile } from "@/components/ui/Misc";
import { ProgressBar, ProgressRing } from "@/components/ui/Progress";
import { studyHref } from "@/lib/client/actions";
import { addDays, dateRange, keyToDisplayDate, minutesOfDayInTz } from "@/lib/domain/dates";
import { findMission } from "@/lib/domain/progression";
import { effectiveStreak } from "@/lib/domain/streak";
import type { Quest } from "@/lib/domain/types";
import { playerLevelFromXp } from "@/lib/domain/xp";
import { useActivity, useDailyActivity, useQuests, useTimezone, useToday } from "@/lib/hooks/data";
import { cn } from "@/lib/utils";
import { ActivityFeed } from "./ActivityFeed";
import { Reminders } from "./Reminders";

function pickUpNext(quests: Quest[]) {
  const active = quests
    .filter((q) => q.status === "active" && q.summary.nextMissionId)
    .sort((a, b) => (b.lastStudiedAt ?? b.createdAt) - (a.lastStudiedAt ?? a.createdAt));
  for (const q of active) {
    const found = findMission(q.stages, q.summary.nextMissionId!);
    if (found) return { quest: q, ...found };
  }
  return null;
}

const MOTIVATIONS = ["m0", "m1", "m2", "m3", "m4", "m5", "m6"] as const;

export function DashboardView() {
  const { t, formatNumber, formatMinutes, formatSeconds, formatDate } = useI18n();
  const { profile, settings } = useAccount();
  const tz = useTimezone();
  const today = useToday();
  const { data: quests, loading: questsLoading } = useQuests();
  const { data: week } = useDailyActivity(7);
  const { data: activity, loading: activityLoading } = useActivity(8);

  const minutes = minutesOfDayInTz(Date.now(), tz);
  const greetKey = minutes < 5 * 60 ? "night" : minutes < 12 * 60 ? "morning" : minutes < 17 * 60 ? "afternoon" : minutes < 22 * 60 ? "evening" : "night";
  const dayNumber = Math.floor(keyToDisplayDate(today).getTime() / 86_400_000);
  const motivation = t(`motivation.${MOTIVATIONS[dayNumber % MOTIVATIONS.length]}`);

  const level = playerLevelFromXp(profile.totalXp);
  const streak = effectiveStreak(profile, today);
  const todayDoc = week.find((d) => d.date === today);
  const missionsToday = todayDoc?.missionsCompleted ?? 0;
  const minutesToday = Math.round((todayDoc?.studySeconds ?? 0) / 60);
  const goalMissions = settings?.dailyGoalMissions ?? 3;
  const goalMinutes = settings?.dailyGoalMinutes ?? 45;
  const active = quests.filter((q) => q.status === "active");
  const upNext = pickUpNext(quests);
  const weekDays = dateRange(addDays(today, -6), today);
  const weekMax = Math.max(1, ...week.map((d) => d.studySeconds));
  const weekSeconds = week.reduce((s, d) => s + d.studySeconds, 0);
  const firstName = profile.displayName.split(/\s+/)[0] || profile.displayName;

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-[13px] text-ink-3">{formatDate(Date.now(), { weekday: "long", month: "long", day: "numeric" }, tz)}</p>
        <h1 className="font-display text-[30px] leading-tight font-medium text-ink sm:text-[36px]">
          {t(`greeting.${greetKey}`, { name: firstName })}
        </h1>
        <p className="text-[15px] text-ink-2">{motivation}</p>
      </header>

      <Reminders quests={quests} todayMissions={missionsToday} startHref={upNext ? studyHref(upNext.quest.id, upNext.mission.id) : null} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* Up next */}
          {questsLoading ? (
            <Skeleton className="h-44" />
          ) : upNext ? (
            <Card className="relative overflow-hidden p-6 sm:p-7">
              <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-sage-soft/70" aria-hidden />
              <div className="relative">
                <div className="text-[12px] font-semibold tracking-wide text-sage-strong uppercase">{t("dashboard.upNext")}</div>
                <h2 className="mt-2 font-display text-[24px] leading-snug font-medium text-ink">{upNext.mission.title}</h2>
                <p className="mt-1 text-[13.5px] text-ink-3">
                  {upNext.quest.title} · {t("map.level", { n: upNext.ref.index + 1 })}: {upNext.level.title}
                </p>
                <MissionMeta mission={upNext.mission} className="mt-3" />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    href={studyHref(upNext.quest.id, upNext.mission.id)}
                    className="inline-flex h-11 items-center gap-2 rounded-[13px] bg-sage-strong px-5 text-sm font-medium text-white shadow-soft hover:bg-[color-mix(in_oklab,var(--sage-strong),black_8%)] dark:text-sage-ink"
                  >
                    {t("dashboard.startMission")}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Link>
                  <Link href={`/quests/${upNext.quest.id}`} className="text-sm font-medium text-ink-2 hover:text-ink">
                    {t("quest.viewMap")}
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<Sparkles />}
                title={quests.length ? t("dashboard.upNextEmpty") : t("dashboard.emptyTitle")}
                body={quests.length ? undefined : t("dashboard.emptyBody")}
                action={
                  <Link
                    href="/planner"
                    className="inline-flex h-11 items-center gap-2 rounded-[13px] bg-sage-strong px-5 text-sm font-medium text-white shadow-soft dark:text-sage-ink"
                  >
                    <Sparkles className="h-4 w-4" />
                    {t("dashboard.planFirst")}
                  </Link>
                }
              />
            </Card>
          )}

          {/* Active quests */}
          {active.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">{t("dashboard.questsHeading")}</h2>
                <Link href="/quests" className="text-[13px] font-medium text-sage-strong hover:underline">
                  {t("dashboard.viewAll")}
                </Link>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {active.slice(0, 4).map((q) => (
                  <QuestCard key={q.id} quest={q} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Recent activity */}
          <Card className="p-5">
            <CardHeader title={t("dashboard.recentActivity")} />
            <div className="mt-3">
              {activityLoading ? (
                <Skeleton className="h-24" />
              ) : activity.length ? (
                <ActivityFeed events={activity} />
              ) : (
                <p className="px-2 py-4 text-sm text-ink-3">{t("dashboard.noActivity")}</p>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          {/* Player overview */}
          <Card className="p-5">
            <CardHeader title={t("dashboard.player")} />
            <div className="mt-4 flex items-center gap-4">
              <ProgressRing value={level.progress * 100} size={76} stroke={6} label={t("dashboard.levelLabel")}>
                <span className="flex flex-col items-center leading-none">
                  <span className="text-[10px] text-ink-3">{t("dashboard.levelLabel")}</span>
                  <span className="tabular mt-0.5 text-xl font-semibold text-ink">{formatNumber(level.level)}</span>
                </span>
              </ProgressRing>
              <div className="min-w-0">
                <div className="tabular text-2xl font-semibold text-ink">
                  {formatNumber(profile.totalXp)} <span className="text-sm font-normal text-ink-3">{t("units.xp")}</span>
                </div>
                <p className="text-[12.5px] text-ink-3">
                  {t("dashboard.toNext", { xp: formatNumber(level.xpForNext - level.xpIntoLevel), level: level.level + 1 })}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <StatTile
                icon={<Flame className={streak > 0 ? "text-honey-strong" : ""} />}
                label={t("dashboard.currentStreak")}
                value={formatNumber(streak)}
              />
              <StatTile icon={<Trophy />} label={t("dashboard.longestStreak")} value={formatNumber(profile.longestStreak)} />
            </div>
          </Card>

          {/* Daily goals */}
          <Card className="p-5">
            <CardHeader title={t("dashboard.dailyGoals")} />
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <Target className="h-3.5 w-3.5 text-ink-3" />
                    {t("dashboard.missionsToday")}
                  </span>
                  <span className="tabular font-medium">{t("dashboard.goalProgress", { done: missionsToday, goal: goalMissions })}</span>
                </div>
                <ProgressBar value={(missionsToday / goalMissions) * 100} label={t("dashboard.missionsToday")} />
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <Clock className="h-3.5 w-3.5 text-ink-3" />
                    {t("dashboard.minutesToday")}
                  </span>
                  <span className="tabular font-medium">
                    {formatMinutes(minutesToday)} / {formatMinutes(goalMinutes)}
                  </span>
                </div>
                <ProgressBar value={(minutesToday / goalMinutes) * 100} tone="olive" label={t("dashboard.minutesToday")} />
              </div>
              {missionsToday >= goalMissions ? <p className="text-[13px] font-medium text-sage-strong">{t("dashboard.goalReached")}</p> : null}
            </div>
          </Card>

          {/* Study overview */}
          <Card className="p-5">
            <CardHeader title={t("dashboard.overview")} />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <StatTile icon={<MapIcon />} label={t("dashboard.activeQuests")} value={formatNumber(active.length)} />
              <StatTile icon={<Target />} label={t("dashboard.missionsDone")} value={formatNumber(profile.missionsCompleted)} />
              <StatTile icon={<Clock />} label={t("dashboard.studyTime")} value={formatSeconds(profile.totalStudySeconds)} />
              <StatTile icon={<Flame />} label={t("stats.studyDays")} value={formatNumber(profile.studyDays)} />
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-3 flex items-baseline justify-between text-[13px]">
                <span className="text-ink-2">{t("dashboard.thisWeek")}</span>
                <span className="tabular text-ink-3">{formatSeconds(weekSeconds)}</span>
              </div>
              <div className="flex h-20 items-end gap-2" role="img" aria-label={t("dashboard.thisWeek")}>
                {weekDays.map((d) => {
                  const doc = week.find((x) => x.date === d);
                  const secs = doc?.studySeconds ?? 0;
                  const missions = doc?.missionsCompleted ?? 0;
                  const h = secs > 0 ? Math.max(8, (secs / weekMax) * 100) : missions > 0 ? 8 : 4;
                  return (
                    <div key={d} className="flex flex-1 flex-col items-center gap-1.5" title={`${formatDate(keyToDisplayDate(d), { weekday: "short", day: "numeric" }, "UTC")}: ${formatSeconds(secs)}`}>
                      <div className="flex h-16 w-full items-end">
                        <div
                          className={cn("w-full rounded-md transition-[height] duration-700", secs > 0 || missions > 0 ? "bg-sage" : "bg-muted", d === today && "bg-sage-strong")}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className={cn("text-[10.5px]", d === today ? "font-semibold text-ink" : "text-ink-3")}>
                        {formatDate(keyToDisplayDate(d), { weekday: "narrow" }, "UTC")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
