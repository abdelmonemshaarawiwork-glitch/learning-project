"use client";

import {
  BookOpen,
  CalendarDays,
  Compass,
  Flag,
  Flame,
  Focus,
  Footprints,
  Library,
  Lock,
  Map as MapIcon,
  Mountain,
  Sprout,
  Sun,
  Timer,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Card } from "@/components/ui/Card";
import { PageHeader, Skeleton } from "@/components/ui/Misc";
import { ProgressBar } from "@/components/ui/Progress";
import { ACHIEVEMENTS, achievementProgress, type AchievementDefinition, type AchievementIcon } from "@/lib/domain/achievements";
import type { MessageKey } from "@/lib/i18n/types";
import { useAchievements } from "@/lib/hooks/data";
import { cn } from "@/lib/utils";

const ICONS: Record<AchievementIcon, LucideIcon> = {
  sprout: Sprout,
  footprints: Footprints,
  book: BookOpen,
  library: Library,
  stairs: TrendingUp,
  mountain: Mountain,
  flag: Flag,
  trophy: Trophy,
  compass: Compass,
  flame: Flame,
  sun: Sun,
  calendar: CalendarDays,
  timer: Timer,
  focus: Focus,
  map: MapIcon,
};

function isTimeMetric(def: AchievementDefinition) {
  return def.metric === "bestDayStudySeconds" || def.metric === "longestSessionSeconds";
}

export function AchievementsView() {
  const { t, formatNumber, formatDate, formatSeconds } = useI18n();
  const { profile } = useAccount();
  const { data: unlocked, loading } = useAchievements();
  const unlockedMap = new Map(unlocked.map((a) => [a.id, a]));
  const count = ACHIEVEMENTS.filter((a) => unlockedMap.has(a.id)).length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("achievements.title")}
        subtitle={t("achievements.subtitle")}
        actions={
          <div className="min-w-48">
            <div className="tabular mb-1.5 text-end text-[13px] text-ink-2">
              {t("achievements.count", { unlocked: count, total: ACHIEVEMENTS.length })}
            </div>
            <ProgressBar value={(count / ACHIEVEMENTS.length) * 100} label={t("achievements.title")} />
          </div>
        }
      />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((def) => {
            const got = unlockedMap.get(def.id);
            const Icon = ICONS[def.icon];
            const p = achievementProgress(profile, def);
            const fmt = (v: number) => (isTimeMetric(def) ? formatSeconds(v) : formatNumber(v));
            return (
              <li key={def.id}>
                <Card className={cn("flex h-full gap-4 p-5", !got && "bg-surface/70")}>
                  <div className="relative shrink-0 self-start">
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl",
                        got ? "bg-sage-soft text-sage-strong" : "bg-surface-2 text-ink-3",
                      )}
                    >
                      <Icon className="h-[22px] w-[22px]" />
                    </span>
                    {!got ? (
                      <span className="absolute -end-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-3">
                        <Lock className="h-2.5 w-2.5" />
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={cn("text-[15px] font-semibold", got ? "text-ink" : "text-ink-2")}>
                      {t(`achievements.items.${def.id}.title` as MessageKey)}
                    </h3>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{t(`achievements.items.${def.id}.description` as MessageKey)}</p>
                    {got ? (
                      <p className="mt-3 text-[12px] font-medium text-sage-strong">
                        {t("achievements.unlocked", { date: formatDate(got.unlockedAt, { dateStyle: "medium" }) })} · {t("achievements.reward", { xp: def.xpReward })}
                      </p>
                    ) : (
                      <div className="mt-3">
                        <ProgressBar value={p.ratio * 100} size="sm" tone="honey" label={t(`achievements.items.${def.id}.title` as MessageKey)} />
                        <div className="tabular mt-1.5 flex justify-between text-[12px] text-ink-3">
                          <span>{t("achievements.progress", { value: fmt(Math.min(p.value, p.threshold)), threshold: fmt(p.threshold) })}</span>
                          <span>{t("achievements.reward", { xp: def.xpReward })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
