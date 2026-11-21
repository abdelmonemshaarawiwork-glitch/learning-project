import type { UserStats } from "./types";

export type AchievementMetric =
  | "missionsCompleted"
  | "levelsCompleted"
  | "stagesCompleted"
  | "questsCompleted"
  | "questsCreated"
  | "longestStreak"
  | "studyDays"
  | "bestDayStudySeconds"
  | "longestSessionSeconds";

export type AchievementIcon =
  | "sprout"
  | "footprints"
  | "book"
  | "library"
  | "stairs"
  | "mountain"
  | "flag"
  | "trophy"
  | "compass"
  | "flame"
  | "sun"
  | "calendar"
  | "timer"
  | "focus"
  | "map";

export interface AchievementDefinition {
  id: string;
  icon: AchievementIcon;
  metric: AchievementMetric;
  threshold: number;
  xpReward: number;
  /** i18n key suffix under achievements.items.<id> */
}

/** Order here is display order. Titles/descriptions live in i18n dictionaries. */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "path-maker", icon: "map", metric: "questsCreated", threshold: 1, xpReward: 10 },
  { id: "first-mission", icon: "sprout", metric: "missionsCompleted", threshold: 1, xpReward: 10 },
  { id: "first-level", icon: "stairs", metric: "levelsCompleted", threshold: 1, xpReward: 15 },
  { id: "streak-3", icon: "flame", metric: "longestStreak", threshold: 3, xpReward: 20 },
  { id: "steady-steps", icon: "footprints", metric: "missionsCompleted", threshold: 10, xpReward: 25 },
  { id: "deep-focus", icon: "focus", metric: "longestSessionSeconds", threshold: 45 * 60, xpReward: 30 },
  { id: "first-stage", icon: "flag", metric: "stagesCompleted", threshold: 1, xpReward: 30 },
  { id: "streak-7", icon: "sun", metric: "longestStreak", threshold: 7, xpReward: 50 },
  { id: "study-marathon", icon: "timer", metric: "bestDayStudySeconds", threshold: 2 * 60 * 60, xpReward: 60 },
  { id: "consistent-learner", icon: "calendar", metric: "studyDays", threshold: 14, xpReward: 75 },
  { id: "dedicated-scholar", icon: "book", metric: "missionsCompleted", threshold: 50, xpReward: 75 },
  { id: "first-quest", icon: "trophy", metric: "questsCompleted", threshold: 1, xpReward: 100 },
  { id: "level-master", icon: "mountain", metric: "levelsCompleted", threshold: 10, xpReward: 100 },
  { id: "centurion", icon: "library", metric: "missionsCompleted", threshold: 100, xpReward: 150 },
  { id: "streak-30", icon: "flame", metric: "longestStreak", threshold: 30, xpReward: 200 },
  { id: "seasoned-explorer", icon: "compass", metric: "questsCompleted", threshold: 3, xpReward: 200 },
];

export function achievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function metricValue(stats: Partial<UserStats>, metric: AchievementMetric): number {
  const v = stats[metric];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function achievementProgress(
  stats: Partial<UserStats>,
  def: AchievementDefinition,
): { value: number; threshold: number; ratio: number } {
  const value = metricValue(stats, def.metric);
  return { value, threshold: def.threshold, ratio: Math.min(1, value / def.threshold) };
}

/** Achievements whose threshold is met and which are not yet unlocked. */
export function newlyEarnedAchievements(
  stats: Partial<UserStats>,
  alreadyUnlocked: ReadonlySet<string>,
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(
    (a) => !alreadyUnlocked.has(a.id) && metricValue(stats, a.metric) >= a.threshold,
  );
}
