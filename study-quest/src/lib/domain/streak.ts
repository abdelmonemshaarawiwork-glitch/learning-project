import { addDays, diffDays } from "./dates";
import type { UserStats } from "./types";

type StreakFields = Pick<UserStats, "currentStreak" | "longestStreak" | "lastStudyDate" | "studyDays">;

export interface StreakUpdate extends StreakFields {
  /** True when this is the first completed mission of the day. */
  isNewStudyDay: boolean;
  /** True when the streak counter went up today. */
  streakIncreased: boolean;
}

/**
 * Apply a completed mission on `today` (YYYY-MM-DD in the user's timezone).
 * - Same day as the last study day: nothing changes (no duplicate days).
 * - The day after: streak + 1.
 * - Any gap (or first ever): streak restarts at 1.
 * - A completion dated before the last study day (clock skew/timezone change)
 *   never rewinds or inflates the streak.
 */
export function applyStudyDay(stats: StreakFields, today: string): StreakUpdate {
  const last = stats.lastStudyDate;
  if (last && diffDays(last, today) <= 0) {
    return { ...stats, isNewStudyDay: false, streakIncreased: false };
  }
  const continues = last !== null && addDays(last, 1) === today;
  const currentStreak = continues ? stats.currentStreak + 1 : 1;
  return {
    currentStreak,
    longestStreak: Math.max(stats.longestStreak, currentStreak),
    lastStudyDate: today,
    studyDays: stats.studyDays + 1,
    isNewStudyDay: true,
    streakIncreased: true,
  };
}

/**
 * The streak to display today. A streak stays alive through today until the
 * day is over, so if the last study day was yesterday it still counts.
 */
export function effectiveStreak(
  stats: Pick<UserStats, "currentStreak" | "lastStudyDate">,
  today: string,
): number {
  if (!stats.lastStudyDate) return 0;
  const gap = diffDays(stats.lastStudyDate, today);
  if (gap <= 1) return stats.currentStreak;
  return 0;
}

/** True when the user has an active streak that today's study would extend. */
export function streakNeedsToday(
  stats: Pick<UserStats, "currentStreak" | "lastStudyDate">,
  today: string,
): boolean {
  if (!stats.lastStudyDate) return false;
  return diffDays(stats.lastStudyDate, today) === 1 && stats.currentStreak > 0;
}
