"use client";

import { useEffect } from "react";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { minutesOfDayInTz } from "@/lib/domain/dates";
import { dueReminders, type Reminder } from "@/lib/domain/reminders";
import { useDailyActivity, useQuests, useTimezone, useToday } from "@/lib/hooks/data";

const storageKey = (key: string) => `sq_notified_${key}`;

export function reminderText(t: ReturnType<typeof useI18n>["t"], formatMinutes: (m: number) => string, r: Reminder) {
  switch (r.type) {
    case "study":
      return { title: t("reminders.studyTitle"), body: t("reminders.studyBody") };
    case "streak":
      return { title: t("reminders.streakTitle"), body: t("reminders.streakBody", r.vars) };
    case "goal":
      return { title: t("reminders.goalTitle"), body: t("reminders.goalBody", r.vars) };
    case "deadline":
      return {
        title: t("reminders.deadlineTitle"),
        body: t("reminders.deadlineBody", { ...r.vars, time: formatMinutes(Number(r.vars.minutes)) }),
      };
  }
}

/** Shows due reminders as browser notifications while the app is open (opt-in, once a day each). */
export function ReminderScheduler() {
  const { t, formatMinutes } = useI18n();
  const { profile, settings } = useAccount();
  const tz = useTimezone();
  const today = useToday();
  const { data: daily } = useDailyActivity(1);
  const { data: quests, loading } = useQuests();
  const todayMissions = daily.find((d) => d.date === today)?.missionsCompleted ?? 0;

  useEffect(() => {
    if (!settings?.notifications.browserEnabled || loading) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const check = () => {
      if (Notification.permission !== "granted") return;
      const due = dueReminders({
        settings,
        profile,
        today,
        todayMissions,
        minutesNow: minutesOfDayInTz(Date.now(), tz),
        quests,
      });
      for (const r of due) {
        try {
          if (localStorage.getItem(storageKey(r.key))) continue;
          localStorage.setItem(storageKey(r.key), "1");
        } catch {
          continue;
        }
        const { title, body } = reminderText(t, formatMinutes, r);
        try {
          new Notification(title, { body, tag: r.key, icon: "/icon.svg" });
        } catch {
          /* some mobile browsers only allow notifications from a service worker */
        }
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [settings, profile, today, todayMissions, tz, quests, loading, t, formatMinutes]);

  return null;
}
