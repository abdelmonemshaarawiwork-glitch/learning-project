"use client";

import { Clock, Flame, ListChecks, Target, Timer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader, Segmented, Skeleton, StatTile } from "@/components/ui/Misc";
import { ProgressBar } from "@/components/ui/Progress";
import { keyToDisplayDate } from "@/lib/domain/dates";
import { cumulativeXp, dailyBuckets, monthlyBuckets, weeklyBuckets, type Bucket } from "@/lib/domain/stats";
import type { MessageKey } from "@/lib/i18n/types";
import { useDailyActivity, useQuests, useToday, useXpHistory } from "@/lib/hooks/data";
import { StudyColumns, XpArea, type ColumnDatum } from "./Charts";
import { Heatmap } from "./Heatmap";

type Range = "daily" | "weekly" | "monthly";

export function StatisticsView() {
  const { t, formatNumber, formatMinutes, formatSeconds, formatDate } = useI18n();
  const { profile } = useAccount();
  const today = useToday();
  const { data: days, loading } = useDailyActivity(366);
  const { data: quests } = useQuests();
  const { data: xpHistory } = useXpHistory(25);
  const [range, setRange] = useState<Range>("daily");
  const [table, setTable] = useState(false);

  const columns: ColumnDatum[] = useMemo(() => {
    const fmtDay = (k: string, o: Intl.DateTimeFormatOptions) => formatDate(keyToDisplayDate(k), o, "UTC");
    const map = (b: Bucket, label: string, title: string): ColumnDatum => ({ key: b.key, label, tooltipTitle: title, minutes: b.minutes, missions: b.missions });
    if (range === "daily")
      return dailyBuckets(days, today, 30).map((b) => map(b, fmtDay(b.start, { day: "numeric" }), fmtDay(b.start, { weekday: "short", month: "short", day: "numeric" })));
    if (range === "weekly")
      return weeklyBuckets(days, today, 12).map((b) =>
        map(b, fmtDay(b.start, { month: "short", day: "numeric" }), t("stats.weekOf", { date: fmtDay(b.start, { month: "short", day: "numeric" }) })),
      );
    return monthlyBuckets(days, today, 12).map((b) => map(b, fmtDay(b.start, { month: "short" }), fmtDay(b.start, { month: "long", year: "numeric" })));
  }, [days, today, range, formatDate, t]);

  const xp = useMemo(
    () =>
      cumulativeXp(days, today, 90, profile.totalXp).map((d) => ({
        ...d,
        label: formatDate(keyToDisplayDate(d.date), { month: "short", day: "numeric" }, "UTC"),
        tooltipTitle: formatDate(keyToDisplayDate(d.date), { dateStyle: "medium" }, "UTC"),
      })),
    [days, today, profile.totalXp, formatDate],
  );

  const totalMissions = quests.filter((q) => q.status !== "archived").reduce((n, q) => n + q.summary.totalMissions, 0);
  const doneMissions = quests.filter((q) => q.status !== "archived").reduce((n, q) => n + q.summary.completedMissions, 0);
  const avgPerDay = profile.studyDays > 0 ? Math.round(profile.totalStudySeconds / 60 / profile.studyDays) : 0;
  const rangeTitle = { daily: t("stats.last30"), weekly: t("stats.last12w"), monthly: t("stats.last12m") }[range];
  const hasAny = days.length > 0 || profile.missionsCompleted > 0;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title={t("stats.title")} subtitle={t("stats.subtitle")} />

      <Card className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-5 sm:p-6">
        <StatTile icon={<Clock />} label={t("stats.totalTime")} value={formatSeconds(profile.totalStudySeconds)} />
        <StatTile icon={<Target />} label={t("stats.missionsDone")} value={formatNumber(profile.missionsCompleted)} />
        <StatTile icon={<ListChecks />} label={t("stats.missionsLeft")} value={formatNumber(Math.max(0, totalMissions - doneMissions))} />
        <StatTile icon={<Flame />} label={t("stats.studyDays")} value={formatNumber(profile.studyDays)} />
        <StatTile icon={<Timer />} label={t("stats.avgPerDay")} value={formatMinutes(avgPerDay)} />
      </Card>

      {loading ? (
        <Skeleton className="h-72" />
      ) : !hasAny ? (
        <Card className="p-8 text-center text-sm text-ink-3">{t("stats.noData")}</Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CardHeader title={t("stats.studyActivity")} subtitle={rangeTitle} />
              <div className="flex items-center gap-2">
                <Segmented
                  label={t("stats.studyActivity")}
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: "daily", label: t("stats.daily") },
                    { value: "weekly", label: t("stats.weekly") },
                    { value: "monthly", label: t("stats.monthly") },
                  ]}
                />
                <Button variant="ghost" size="sm" onClick={() => setTable((v) => !v)} aria-pressed={table}>
                  {table ? t("stats.showChart") : t("stats.showTable")}
                </Button>
              </div>
            </div>
            <div className="mt-5">
              {table ? (
                <div className="scrollbar-thin max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-[12px] text-ink-3">
                      <tr>
                        <th className="py-2 text-start font-medium">{t("stats.colPeriod")}</th>
                        <th className="py-2 text-end font-medium">{t("stats.colTime")}</th>
                        <th className="py-2 text-end font-medium">{t("stats.colMissions")}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-line/70">
                      {[...columns].reverse().map((c) => (
                        <tr key={c.key}>
                          <td className="py-2 text-ink-2">{c.tooltipTitle}</td>
                          <td className="py-2 text-end">{formatMinutes(c.minutes)}</td>
                          <td className="py-2 text-end">{formatNumber(c.missions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <StudyColumns data={columns} ariaLabel={`${t("stats.studyActivity")} — ${rangeTitle}`} />
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <CardHeader title={t("stats.xpOverTime")} subtitle={t("stats.xpCumulative")} />
              <div className="mt-5">
                <XpArea data={xp} ariaLabel={t("stats.xpCumulative")} />
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <CardHeader title={t("stats.calendar")} subtitle={t("stats.calendarHint")} />
              <div className="mt-5">
                <Heatmap days={days} today={today} />
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-5 sm:p-6">
          <CardHeader title={t("stats.questProgress")} subtitle={t("stats.completedVsRemaining")} />
          <ul className="mt-5 space-y-5">
            {quests.filter((q) => q.status !== "archived").length === 0 ? (
              <li className="text-sm text-ink-3">{t("quests.emptyActive")}</li>
            ) : (
              quests
                .filter((q) => q.status !== "archived")
                .map((q) => (
                  <li key={q.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <Link href={`/quests/${q.id}`} className="min-w-0 truncate text-sm font-medium text-ink hover:underline">
                        {q.title}
                      </Link>
                      <span className="tabular shrink-0 text-[12.5px] text-ink-3">{q.summary.percent}%</span>
                    </div>
                    <ProgressBar value={(q.summary.completedMissions / Math.max(1, q.summary.totalMissions)) * 100} label={q.title} />
                    <div className="tabular mt-1.5 flex flex-wrap gap-x-4 text-[12px] text-ink-3">
                      <span>
                        {t("stats.completed")}: {formatNumber(q.summary.completedMissions)}
                      </span>
                      <span>
                        {t("stats.remaining")}: {formatNumber(q.summary.totalMissions - q.summary.completedMissions)}
                      </span>
                      <span>{t("quest.levelsProgress", { done: q.summary.completedLevels, total: q.summary.totalLevels })}</span>
                    </div>
                  </li>
                ))
            )}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader title={t("stats.xpHistory")} />
          {xpHistory.length === 0 ? (
            <p className="mt-4 text-sm text-ink-3">{t("stats.xpHistoryEmpty")}</p>
          ) : (
            <ul className="scrollbar-thin mt-3 max-h-96 divide-y divide-line/70 overflow-y-auto">
              {xpHistory.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] text-ink">
                      {x.reason === "achievement" ? t(`achievements.items.${x.label}.title` as MessageKey) : x.label}
                    </div>
                    <div className="text-[12px] text-ink-3">
                      {t(`stats.reason.${x.reason}`)} · {formatDate(x.createdAt, { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-sm font-medium text-sage-strong">+{formatNumber(x.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
