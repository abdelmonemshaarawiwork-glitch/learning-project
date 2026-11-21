"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Misc";
import { studyHref } from "@/lib/client/actions";
import { keyToDisplayDate } from "@/lib/domain/dates";
import { buildSchedule } from "@/lib/domain/schedule";
import { useQuests, useToday } from "@/lib/hooks/data";
import { cn } from "@/lib/utils";

export function Schedule() {
  const { t, formatDate, formatMinutes } = useI18n();
  const { settings } = useAuth();
  const today = useToday();
  const { data: quests, loading } = useQuests();
  const goal = settings?.dailyGoalMinutes ?? 45;
  const days = buildSchedule(quests, goal, today, 7);
  const empty = days.every((d) => d.items.length === 0);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader title={t("planner.scheduleTitle")} subtitle={t("planner.scheduleSubtitle", { minutes: goal })} />
      {loading ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : empty ? (
        <p className="mt-5 rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">{t("planner.scheduleEmpty")}</p>
      ) : (
        <ol className="mt-5 divide-y divide-line/70">
          {days.map((d, i) => (
            <li key={d.date} className="grid gap-2 py-3.5 sm:grid-cols-[150px_1fr] sm:gap-4">
              <div>
                <div className={cn("text-sm font-medium", i === 0 ? "text-sage-strong" : "text-ink")}>
                  {i === 0 ? t("common.today") : formatDate(keyToDisplayDate(d.date), { weekday: "long" }, "UTC")}
                </div>
                <div className="tabular text-[12px] text-ink-3">
                  {formatDate(keyToDisplayDate(d.date), { month: "short", day: "numeric" }, "UTC")}
                  {d.minutes > 0 ? ` · ${formatMinutes(d.minutes)}` : ""}
                </div>
              </div>
              {d.items.length ? (
                <ul className="space-y-1.5">
                  {d.items.map((item) => (
                    <li key={item.missionId}>
                      <Link
                        href={studyHref(item.questId, item.missionId)}
                        className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{item.title}</span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {item.questTitle} · {formatMinutes(item.minutes)}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-2 text-[13px] text-ink-3">—</div>
              )}
            </li>
          ))}
        </ol>
      )}
      {!empty && quests.some((q) => q.deadline && q.status === "active") ? (
        <p className="mt-3 text-[12px] text-ink-3">{t("planner.scheduleDeadline")}</p>
      ) : null}
    </Card>
  );
}
