"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { reminderText } from "@/components/layout/ReminderScheduler";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { minutesOfDayInTz } from "@/lib/domain/dates";
import { dueReminders } from "@/lib/domain/reminders";
import type { Quest } from "@/lib/domain/types";
import { useTimezone, useToday } from "@/lib/hooks/data";

const DISMISS = (key: string) => `sq_dismissed_${key}`;

/** Gentle in-app reminder cards (dismissible for the day). */
export function Reminders({ quests, todayMissions, startHref }: { quests: Quest[]; todayMissions: number; startHref: string | null }) {
  const { t, formatMinutes } = useI18n();
  const { profile, settings } = useAccount();
  const tz = useTimezone();
  const today = useToday();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [minutesNow, setMinutesNow] = useState<number | null>(null);

  useEffect(() => {
    setMinutesNow(minutesOfDayInTz(Date.now(), tz));
    const id = setInterval(() => setMinutesNow(minutesOfDayInTz(Date.now(), tz)), 60_000);
    return () => clearInterval(id);
  }, [tz]);

  useEffect(() => {
    try {
      const keys = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("sq_dismissed_")) keys.add(k.slice("sq_dismissed_".length));
      }
      setDismissed(keys);
    } catch {
      /* ignore */
    }
  }, []);

  if (!settings || minutesNow === null) return null;
  const due = dueReminders({ settings, profile, today, todayMissions, minutesNow, quests }).filter((r) => !dismissed.has(r.key));
  if (due.length === 0) return null;

  return (
    <div className="space-y-2">
      {due.map((r) => {
        const { title, body } = reminderText(t, formatMinutes, r);
        return (
          <div key={r.key} role="status" className="flex items-start gap-3 rounded-2xl border border-honey-strong/15 bg-honey px-4 py-3 animate-rise">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-honey-strong" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-[13px] text-ink-2">{body}</p>
              {startHref && r.type !== "deadline" ? (
                <Link href={startHref} className="mt-1.5 inline-block text-[13px] font-medium text-sage-strong hover:underline">
                  {t("reminders.startNow")}
                </Link>
              ) : r.questId ? (
                <Link href={`/quests/${r.questId}`} className="mt-1.5 inline-block text-[13px] font-medium text-sage-strong hover:underline">
                  {t("quest.viewMap")}
                </Link>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("reminders.dismiss")}
              onClick={() => {
                try {
                  localStorage.setItem(DISMISS(r.key), "1");
                } catch {
                  /* ignore */
                }
                setDismissed((d) => new Set(d).add(r.key));
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
