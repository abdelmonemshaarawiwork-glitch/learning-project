"use client";

import { Flame } from "lucide-react";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { ProgressBar } from "@/components/ui/Progress";
import { useToday } from "@/lib/hooks/data";
import { effectiveStreak } from "@/lib/domain/streak";
import { playerLevelFromXp } from "@/lib/domain/xp";

export function PlayerMini() {
  const { t, formatNumber } = useI18n();
  const { profile } = useAccount();
  const today = useToday();
  const info = playerLevelFromXp(profile.totalXp);
  const streak = effectiveStreak(profile, today);
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-ink">{t("shell.level", { level: info.level })}</span>
        <span className="inline-flex items-center gap-1 text-ink-2" title={t("dashboard.currentStreak")}>
          <Flame className={streak > 0 ? "h-3.5 w-3.5 text-honey-strong" : "h-3.5 w-3.5 text-ink-3"} />
          <span className="tabular">{formatNumber(streak)}</span>
        </span>
      </div>
      <ProgressBar value={info.progress * 100} size="sm" className="mt-2.5" label={t("dashboard.totalXp")} />
      <div className="tabular mt-1.5 text-[11.5px] text-ink-3">
        {formatNumber(info.xpIntoLevel)} / {formatNumber(info.xpForNext)} {t("units.xp")}
      </div>
    </div>
  );
}
