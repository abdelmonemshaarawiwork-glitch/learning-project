import { z } from "zod";
import { dateKeyInTz } from "@/lib/domain/dates";
import { withStatDefaults } from "@/lib/domain/defaults";
import { findMission } from "@/lib/domain/progression";
import type { DailyActivity, Quest, StudySession, UserDoc } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "./http";
import { emptyDaily, grantAchievements, pickStats, readUnlockedAchievements, settlePlayerLevel } from "./ledger";
import { refs } from "./paths";

/** Sessions longer than this are rejected as implausible. */
export const MAX_SESSION_SECONDS = 6 * 60 * 60;
export const MIN_SESSION_SECONDS = 30;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const sessionSchema = z.object({
  /** Client-generated id: makes retries idempotent. */
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  questId: z.string().min(1).max(64),
  missionId: z.string().min(1).max(64),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  activeSeconds: z.number().int().min(0).max(MAX_SESSION_SECONDS),
});

export interface SessionResult {
  recorded: boolean;
  activeSeconds: number;
  achievements: { id: string; xpReward: number }[];
}

/**
 * Record a finished study session. Validates that the active time fits in the
 * wall-clock window, then adds it to the mission, the day and the user totals.
 */
export async function recordSession(
  uid: string,
  input: z.infer<typeof sessionSchema>,
  now = Date.now(),
): Promise<SessionResult> {
  if (input.endedAt < input.startedAt) throw new ApiError(400, "invalid_session_window");
  if (input.endedAt > now + CLOCK_SKEW_MS) throw new ApiError(400, "invalid_session_window");
  const windowSeconds = Math.ceil((input.endedAt - input.startedAt) / 1000);
  if (input.activeSeconds > windowSeconds + 5) throw new ApiError(400, "invalid_session_duration");
  if (input.activeSeconds < MIN_SESSION_SECONDS) {
    return { recorded: false, activeSeconds: input.activeSeconds, achievements: [] };
  }

  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const sessionRef = refs.sessions(uid).doc(input.sessionId);
    const questRef = refs.quest(uid, input.questId);
    const userRef = refs.user(uid);
    const [sessionSnap, questSnap, userSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(questRef),
      tx.get(userRef),
    ]);
    if (sessionSnap.exists) {
      return { recorded: false, activeSeconds: input.activeSeconds, achievements: [] };
    }
    if (!userSnap.exists) throw new ApiError(404, "profile_missing");
    if (!questSnap.exists) throw new ApiError(404, "quest_not_found");
    const user = withStatDefaults(userSnap.data() as UserDoc);
    const quest = questSnap.data() as Quest;
    const found = findMission(quest.stages, input.missionId);
    if (!found) throw new ApiError(404, "mission_not_found");

    // Attribute the session to the day it ended on, in the user's timezone.
    const date = dateKeyInTz(input.endedAt, user.timezone);
    const dailyRef = refs.daily(uid, date);
    const dailySnap = await tx.get(dailyRef);
    const unlocked = await readUnlockedAchievements(tx, uid);

    const daily: DailyActivity = dailySnap.exists
      ? (dailySnap.data() as DailyActivity)
      : emptyDaily(date, now);
    daily.studySeconds += input.activeSeconds;
    daily.sessions += 1;

    const stats = pickStats(user);
    const prevLevel = stats.playerLevel;
    stats.totalStudySeconds += input.activeSeconds;
    stats.sessionsCompleted += 1;
    stats.longestSessionSeconds = Math.max(stats.longestSessionSeconds, input.activeSeconds);
    stats.bestDayStudySeconds = Math.max(stats.bestDayStudySeconds, daily.studySeconds);

    const achievements = grantAchievements(tx, uid, stats, unlocked, { now, date });
    const achievementXp = achievements.reduce((s, a) => s + a.xpReward, 0);
    daily.xpEarned += achievementXp;
    daily.updatedAt = now;
    settlePlayerLevel(tx, uid, stats, prevLevel, now);

    found.mission.actualSeconds += input.activeSeconds;
    quest.lastStudiedAt = now;
    quest.updatedAt = now;

    const session: StudySession = {
      id: input.sessionId,
      questId: input.questId,
      missionId: input.missionId,
      questTitle: quest.title,
      missionTitle: found.mission.title,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      activeSeconds: input.activeSeconds,
      date,
      createdAt: now,
    };
    tx.create(sessionRef, session);
    tx.update(questRef, { stages: quest.stages, lastStudiedAt: now, updatedAt: now });
    tx.set(dailyRef, daily);
    tx.update(userRef, { ...stats, updatedAt: now });
    return { recorded: true, activeSeconds: input.activeSeconds, achievements };
  });
}
