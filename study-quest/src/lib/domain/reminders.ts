import { daysUntil } from "./progression";
import { streakNeedsToday } from "./streak";
import type { Quest, UserDoc, UserSettings } from "./types";

export type ReminderType = "study" | "streak" | "goal" | "deadline";

export interface Reminder {
  type: ReminderType;
  /** Stable id: one reminder of each kind (per quest for deadlines) per day. */
  key: string;
  questId?: string;
  vars: Record<string, string | number>;
}

function parseHHMM(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Which gentle reminders are due right now. Never more than one "study"-type
 * nudge (streak replaces the plain study reminder), nothing before the chosen
 * reminder time except upcoming deadlines, nothing once today's goal is met.
 */
export function dueReminders(args: {
  settings: UserSettings;
  profile: Pick<UserDoc, "currentStreak" | "lastStudyDate">;
  today: string;
  todayMissions: number;
  minutesNow: number;
  quests: Pick<Quest, "id" | "title" | "status" | "deadline" | "summary">[];
}): Reminder[] {
  const { settings, profile, today, todayMissions, minutesNow, quests } = args;
  const n = settings.notifications;
  const out: Reminder[] = [];
  const afterTime = minutesNow >= parseHHMM(n.reminderTime);
  const hasActive = quests.some((q) => q.status === "active" && q.summary.nextMissionId);

  if (afterTime && hasActive && todayMissions === 0) {
    if (n.streakReminder && streakNeedsToday(profile, today)) {
      out.push({ type: "streak", key: `streak_${today}`, vars: { count: profile.currentStreak } });
    } else if (n.dailyReminder) {
      out.push({ type: "study", key: `study_${today}`, vars: {} });
    }
  }
  if (afterTime && n.goalReminder && todayMissions > 0 && todayMissions < settings.dailyGoalMissions && hasActive) {
    out.push({ type: "goal", key: `goal_${today}`, vars: { done: todayMissions, goal: settings.dailyGoalMissions } });
  }
  if (n.deadlineReminder) {
    for (const q of quests) {
      if (q.status !== "active" || q.summary.remainingMinutes <= 0) continue;
      const d = daysUntil(q.deadline, today);
      if (d !== null && d >= 0 && d <= 3) {
        out.push({
          type: "deadline",
          key: `deadline_${q.id}_${today}`,
          questId: q.id,
          vars: { title: q.title, days: d, minutes: q.summary.remainingMinutes },
        });
      }
    }
  }
  return out;
}
