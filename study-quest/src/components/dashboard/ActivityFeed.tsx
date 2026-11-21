"use client";

import { Award, CircleCheck, Flag, LockOpen, Map as MapIcon, Sparkles, Star, Timer, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import type { ActivityEvent, ActivityEventType } from "@/lib/domain/types";
import type { MessageKey } from "@/lib/i18n/types";

const ICONS: Record<ActivityEventType, LucideIcon> = {
  mission_completed: CircleCheck,
  level_completed: Star,
  level_unlocked: LockOpen,
  stage_completed: Flag,
  quest_completed: Trophy,
  quest_created: MapIcon,
  achievement_unlocked: Award,
  player_level_up: Sparkles,
  session_logged: Timer,
};

export function useRelativeTime() {
  const { locale } = useI18n();
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { numeric: "auto" });
  return (ts: number) => {
    const diff = (ts - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 60) return rtf.format(Math.round(diff), "second");
    if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    return rtf.format(Math.round(diff / 86400), "day");
  };
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const { t } = useI18n();
  const rel = useRelativeTime();
  return (
    <ul className="space-y-1">
      {events.map((e) => {
        const Icon = ICONS[e.type] ?? CircleCheck;
        const title =
          e.type === "achievement_unlocked" ? t(`achievements.items.${e.title}.title` as MessageKey) : e.title;
        return (
          <li key={e.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-snug text-ink">{t(`activity.${e.type}`, { title })}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {rel(e.createdAt)}
                {e.detail && e.type !== "quest_completed" ? ` · ${e.detail}` : ""}
              </p>
            </div>
            {e.xp > 0 ? <span className="tabular shrink-0 text-[12px] font-medium text-sage-strong">+{e.xp}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
