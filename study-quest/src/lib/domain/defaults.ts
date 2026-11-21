import type { Locale, UserDoc, UserSettings, UserStats } from "./types";

export const EMPTY_STATS: UserStats = {
  totalXp: 0,
  playerLevel: 1,
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: null,
  studyDays: 0,
  missionsCompleted: 0,
  levelsCompleted: 0,
  stagesCompleted: 0,
  questsCompleted: 0,
  questsCreated: 0,
  totalStudySeconds: 0,
  longestSessionSeconds: 0,
  bestDayStudySeconds: 0,
  sessionsCompleted: 0,
};

export function defaultSettings(timezone: string, locale: Locale, now: number): UserSettings {
  return {
    theme: "light",
    locale,
    timezone,
    dailyGoalMissions: 3,
    dailyGoalMinutes: 45,
    preferredSessionMinutes: 25,
    notifications: {
      browserEnabled: false,
      dailyReminder: true,
      goalReminder: true,
      deadlineReminder: true,
      streakReminder: true,
      reminderTime: "18:00",
    },
    updatedAt: now,
  };
}

export function newUserDoc(
  uid: string,
  email: string,
  displayName: string,
  timezone: string,
  locale: Locale,
  now: number,
): UserDoc {
  return {
    uid,
    email,
    displayName,
    timezone,
    locale,
    createdAt: now,
    updatedAt: now,
    ...EMPTY_STATS,
  };
}

/** Fill any missing stat fields (older documents, partial reads). */
export function withStatDefaults<T extends Partial<UserStats>>(doc: T): T & UserStats {
  return { ...EMPTY_STATS, ...doc } as T & UserStats;
}
