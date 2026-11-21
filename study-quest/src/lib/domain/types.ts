/**
 * Core domain types for Study Quest.
 *
 * Firestore layout (all private to the owner):
 *   users/{uid}                          UserDoc (profile + aggregate stats)
 *   users/{uid}/settings/preferences     UserSettings
 *   users/{uid}/quests/{questId}         Quest (stages → levels → missions embedded)
 *   users/{uid}/studySessions/{id}       StudySession
 *   users/{uid}/xpTransactions/{key}     XpTransaction (deterministic ids → no double rewards)
 *   users/{uid}/dailyActivity/{date}     DailyActivity (date = YYYY-MM-DD in the user's timezone)
 *   users/{uid}/achievements/{id}        UnlockedAchievement
 *   users/{uid}/activity/{id}            ActivityEvent (recent-activity feed)
 *   users/{uid}/notes/{questId__mission} MissionNote
 *   users/{uid}/usage/{date}             AI usage counter
 *
 * All timestamps are epoch milliseconds.
 */

export type Locale = "en" | "ar";
export type ThemePreference = "light" | "dark" | "system";

export type Difficulty = 1 | 2 | 3;

export const ACTIVITY_TYPES = [
  "read",
  "watch",
  "notes",
  "recall",
  "practice",
  "quiz",
  "review",
  "diagram",
  "flashcards",
  "project",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type Complexity = "introductory" | "intermediate" | "advanced";
export type Familiarity = "new" | "some" | "confident";

export type MissionStatus = "todo" | "done";

export interface Mission {
  id: string;
  title: string;
  description: string;
  activity: ActivityType;
  estimatedMinutes: number;
  difficulty: Difficulty;
  /** Required missions gate level completion; optional ones are bonus practice. */
  required: boolean;
  status: MissionStatus;
  completedAt: number | null;
  /** Seconds of tracked study time across sessions. */
  actualSeconds: number;
  xpAwarded: number;
}

export interface Level {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  /** What this level builds on (prerequisite knowledge / earlier levels). */
  buildsOn: string;
  missions: Mission[];
  manuallyUnlocked: boolean;
  skipped: boolean;
  completedAt: number | null;
}

export interface Stage {
  id: string;
  title: string;
  description: string;
  levels: Level[];
  completedAt: number | null;
}

export type QuestStatus = "active" | "paused" | "completed" | "archived";
export type QuestSource = "ai" | "mock" | "manual";

export interface QuestSummary {
  totalMissions: number;
  completedMissions: number;
  requiredMissions: number;
  completedRequiredMissions: number;
  totalMinutes: number;
  remainingMinutes: number;
  percent: number;
  totalLevels: number;
  completedLevels: number;
  currentStageId: string | null;
  currentLevelId: string | null;
  nextMissionId: string | null;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  /** The user's original request, kept for regeneration. */
  topic: string;
  subjectArea: string;
  complexity: Complexity;
  prerequisites: string[];
  pacingNote: string;
  status: QuestStatus;
  source: QuestSource;
  /** Optional target date, YYYY-MM-DD. */
  deadline: string | null;
  minutesPerDay: number | null;
  familiarity: Familiarity | null;
  stages: Stage[];
  summary: QuestSummary;
  createdAt: number;
  updatedAt: number;
  lastStudiedAt: number | null;
  completedAt: number | null;
  archivedAt: number | null;
}

export interface UserStats {
  totalXp: number;
  playerLevel: number;
  currentStreak: number;
  longestStreak: number;
  /** YYYY-MM-DD (user timezone) of the last day a mission was completed. */
  lastStudyDate: string | null;
  studyDays: number;
  missionsCompleted: number;
  levelsCompleted: number;
  stagesCompleted: number;
  questsCompleted: number;
  questsCreated: number;
  totalStudySeconds: number;
  longestSessionSeconds: number;
  /** Most tracked study seconds in a single day. */
  bestDayStudySeconds: number;
  sessionsCompleted: number;
}

export interface UserDoc extends UserStats {
  uid: string;
  displayName: string;
  email: string;
  timezone: string;
  locale: Locale;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationPreferences {
  browserEnabled: boolean;
  dailyReminder: boolean;
  goalReminder: boolean;
  deadlineReminder: boolean;
  streakReminder: boolean;
  /** HH:MM in the user's timezone. */
  reminderTime: string;
}

export interface UserSettings {
  theme: ThemePreference;
  locale: Locale;
  timezone: string;
  dailyGoalMissions: number;
  dailyGoalMinutes: number;
  preferredSessionMinutes: number;
  notifications: NotificationPreferences;
  updatedAt: number;
}

export interface StudySession {
  id: string;
  questId: string;
  missionId: string;
  questTitle: string;
  missionTitle: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  date: string;
  createdAt: number;
}

export type XpReason =
  | "mission"
  | "level"
  | "stage"
  | "quest"
  | "achievement";

export interface XpTransaction {
  id: string;
  reason: XpReason;
  amount: number;
  questId: string | null;
  refId: string;
  label: string;
  date: string;
  createdAt: number;
}

export interface DailyActivity {
  date: string;
  missionsCompleted: number;
  studySeconds: number;
  xpEarned: number;
  sessions: number;
  updatedAt: number;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
  xpReward: number;
}

export type ActivityEventType =
  | "mission_completed"
  | "level_completed"
  | "level_unlocked"
  | "stage_completed"
  | "quest_completed"
  | "quest_created"
  | "achievement_unlocked"
  | "player_level_up"
  | "session_logged";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  questId: string | null;
  title: string;
  detail: string;
  xp: number;
  createdAt: number;
}

export interface MissionNote {
  questId: string;
  missionId: string;
  text: string;
  updatedAt: number;
}

export type LevelState = "locked" | "available" | "in_progress" | "completed";
