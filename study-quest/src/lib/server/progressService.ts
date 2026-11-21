import { z } from "zod";
import { dateKeyInTz } from "@/lib/domain/dates";
import { withStatDefaults } from "@/lib/domain/defaults";
import {
  computeLevelStates,
  findMission,
  flattenLevels,
  gatingMissions,
  isLevelComplete,
  isQuestComplete,
  isStageComplete,
  summarizeQuest,
} from "@/lib/domain/progression";
import { applyStudyDay } from "@/lib/domain/streak";
import type { DailyActivity, Quest, UserDoc } from "@/lib/domain/types";
import { levelBonusXp, missionXp, QUEST_BONUS_XP, STAGE_BONUS_XP } from "@/lib/domain/xp";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "./http";
import {
  emptyDaily,
  grantAchievements,
  pickStats,
  readUnlockedAchievements,
  settlePlayerLevel,
  writeActivity,
  writeXp,
} from "./ledger";
import { refs, xpKeys } from "./paths";

export const completeMissionSchema = z.object({
  questId: z.string().min(1).max(64),
  missionId: z.string().min(1).max(64),
});

export interface CompletionResult {
  xpGained: number;
  breakdown: { mission: number; level: number; stage: number; quest: number; achievements: number };
  playerLevel: { before: number; after: number };
  totalXp: number;
  streak: { current: number; increased: boolean };
  levelCompleted: { id: string; title: string } | null;
  unlockedLevels: { id: string; title: string }[];
  stageCompleted: { id: string; title: string } | null;
  questCompleted: boolean;
  achievements: { id: string; xpReward: number }[];
  nextMissionId: string | null;
  todayMissions: number;
}

/**
 * Complete a mission. Everything happens in one transaction so XP, unlocks,
 * streaks, achievements and daily activity can never drift apart, and every
 * reward is keyed in the XP ledger so it can be granted only once.
 */
export async function completeMission(
  uid: string,
  questId: string,
  missionId: string,
  now = Date.now(),
): Promise<CompletionResult> {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    // ---------- reads ----------
    const questRef = refs.quest(uid, questId);
    const userRef = refs.user(uid);
    const [questSnap, userSnap] = await Promise.all([tx.get(questRef), tx.get(userRef)]);
    if (!userSnap.exists) throw new ApiError(404, "profile_missing");
    if (!questSnap.exists) throw new ApiError(404, "quest_not_found");
    const user = withStatDefaults(userSnap.data() as UserDoc);
    const quest = questSnap.data() as Quest;

    if (quest.status !== "active" && quest.status !== "completed") {
      throw new ApiError(409, "quest_not_active");
    }
    const found = findMission(quest.stages, missionId);
    if (!found) throw new ApiError(404, "mission_not_found");
    const { mission, level, stage } = found;
    if (mission.status === "done") throw new ApiError(409, "mission_already_completed");

    const statesBefore = computeLevelStates(quest.stages);
    if (statesBefore.get(level.id) === "locked") throw new ApiError(409, "level_locked");

    const date = dateKeyInTz(now, user.timezone);
    const dailyRef = refs.daily(uid, date);
    const missionKey = xpKeys.mission(questId, missionId);
    const levelKey = xpKeys.level(questId, level.id);
    const stageKey = xpKeys.stage(questId, stage.id);
    const questKey = xpKeys.quest(questId);
    const [dailySnap, missionTx, levelTx, stageTx, questTx] = await Promise.all([
      tx.get(dailyRef),
      tx.get(refs.xp(uid).doc(missionKey)),
      tx.get(refs.xp(uid).doc(levelKey)),
      tx.get(refs.xp(uid).doc(stageKey)),
      tx.get(refs.xp(uid).doc(questKey)),
    ]);
    const unlocked = await readUnlockedAchievements(tx, uid);

    // ---------- compute ----------
    const stats = pickStats(user);
    const prevPlayerLevel = stats.playerLevel;
    const breakdown = { mission: 0, level: 0, stage: 0, quest: 0, achievements: 0 };

    const levelWasComplete = isLevelComplete(level);
    const stageWasComplete = isStageComplete(stage);
    const questWasComplete = isQuestComplete(quest.stages);

    // Mission reward (once per mission, ever).
    const mXp = missionTx.exists ? 0 : missionXp(mission.estimatedMinutes, mission.difficulty);
    mission.status = "done";
    mission.completedAt = now;
    mission.xpAwarded = mXp;
    if (mXp > 0) {
      writeXp(tx, uid, missionKey, {
        reason: "mission",
        amount: mXp,
        questId,
        refId: missionId,
        label: mission.title,
        date,
        createdAt: now,
      });
    }
    breakdown.mission = mXp;
    stats.missionsCompleted += 1;
    writeActivity(tx, uid, {
      type: "mission_completed",
      questId,
      title: mission.title,
      detail: quest.title,
      xp: mXp,
      createdAt: now,
    });

    // Level completion.
    let levelCompleted: CompletionResult["levelCompleted"] = null;
    if (!levelWasComplete && isLevelComplete(level)) {
      level.completedAt = now;
      levelCompleted = { id: level.id, title: level.title };
      if (!levelTx.exists) {
        const bonus = levelBonusXp(gatingMissions(level).length);
        breakdown.level = bonus;
        stats.levelsCompleted += 1;
        writeXp(tx, uid, levelKey, {
          reason: "level",
          amount: bonus,
          questId,
          refId: level.id,
          label: level.title,
          date,
          createdAt: now,
        });
      }
      writeActivity(tx, uid, {
        type: "level_completed",
        questId,
        title: level.title,
        detail: quest.title,
        xp: breakdown.level,
        createdAt: now,
      });
    }

    // Stage completion.
    let stageCompleted: CompletionResult["stageCompleted"] = null;
    if (!stageWasComplete && isStageComplete(stage)) {
      stage.completedAt = now;
      stageCompleted = { id: stage.id, title: stage.title };
      if (!stageTx.exists) {
        breakdown.stage = STAGE_BONUS_XP;
        stats.stagesCompleted += 1;
        writeXp(tx, uid, stageKey, {
          reason: "stage",
          amount: STAGE_BONUS_XP,
          questId,
          refId: stage.id,
          label: stage.title,
          date,
          createdAt: now,
        });
      }
      writeActivity(tx, uid, {
        type: "stage_completed",
        questId,
        title: stage.title,
        detail: quest.title,
        xp: breakdown.stage,
        createdAt: now,
      });
    }

    // Quest completion.
    let questCompleted = false;
    if (!questWasComplete && isQuestComplete(quest.stages)) {
      questCompleted = true;
      quest.status = "completed";
      quest.completedAt = now;
      if (!questTx.exists) {
        breakdown.quest = QUEST_BONUS_XP;
        stats.questsCompleted += 1;
        writeXp(tx, uid, questKey, {
          reason: "quest",
          amount: QUEST_BONUS_XP,
          questId,
          refId: questId,
          label: quest.title,
          date,
          createdAt: now,
        });
      }
      writeActivity(tx, uid, {
        type: "quest_completed",
        questId,
        title: quest.title,
        detail: "",
        xp: breakdown.quest,
        createdAt: now,
      });
    }

    // Newly unlocked levels.
    const statesAfter = computeLevelStates(quest.stages);
    const unlockedLevels = flattenLevels(quest.stages)
      .filter((r) => statesBefore.get(r.level.id) === "locked" && statesAfter.get(r.level.id) !== "locked")
      .map((r) => ({ id: r.level.id, title: r.level.title }));
    for (const l of unlockedLevels) {
      writeActivity(tx, uid, {
        type: "level_unlocked",
        questId,
        title: l.title,
        detail: quest.title,
        xp: 0,
        createdAt: now,
      });
    }

    // Streak (a study day = at least one completed mission that day).
    const streak = applyStudyDay(stats, date);
    stats.currentStreak = streak.currentStreak;
    stats.longestStreak = streak.longestStreak;
    stats.lastStudyDate = streak.lastStudyDate;
    stats.studyDays = streak.studyDays;

    const earnedBeforeAchievements =
      breakdown.mission + breakdown.level + breakdown.stage + breakdown.quest;
    stats.totalXp += earnedBeforeAchievements;
    const achievements = grantAchievements(tx, uid, stats, unlocked, { now, date });
    breakdown.achievements = achievements.reduce((s, a) => s + a.xpReward, 0);
    const playerLevel = settlePlayerLevel(tx, uid, stats, prevPlayerLevel, now);
    const xpGained = earnedBeforeAchievements + breakdown.achievements;

    // ---------- writes ----------
    quest.summary = summarizeQuest(quest.stages);
    quest.lastStudiedAt = now;
    quest.updatedAt = now;
    tx.set(questRef, quest);

    const daily: DailyActivity = dailySnap.exists
      ? (dailySnap.data() as DailyActivity)
      : emptyDaily(date, now);
    daily.missionsCompleted += 1;
    daily.xpEarned += xpGained;
    daily.updatedAt = now;
    tx.set(dailyRef, daily);

    tx.update(userRef, { ...stats, updatedAt: now });

    return {
      xpGained,
      breakdown,
      playerLevel,
      totalXp: stats.totalXp,
      streak: { current: stats.currentStreak, increased: streak.streakIncreased },
      levelCompleted,
      unlockedLevels,
      stageCompleted,
      questCompleted,
      achievements,
      nextMissionId: quest.summary.nextMissionId,
      todayMissions: daily.missionsCompleted,
    };
  });
}
