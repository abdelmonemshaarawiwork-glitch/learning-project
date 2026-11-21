import type { Transaction } from "firebase-admin/firestore";
import { newlyEarnedAchievements } from "@/lib/domain/achievements";
import type { ActivityEvent, DailyActivity, UserStats, XpTransaction } from "@/lib/domain/types";
import { playerLevelFromXp } from "@/lib/domain/xp";
import { refs, xpKeys } from "./paths";
import { newId } from "./ids";

/**
 * Helpers used inside Firestore transactions to record XP, achievements,
 * daily activity and the activity feed consistently.
 * All reads must happen before any of these write helpers are called.
 */

export async function readUnlockedAchievements(tx: Transaction, uid: string): Promise<Set<string>> {
  const snap = await tx.get(refs.achievements(uid));
  return new Set(snap.docs.map((d) => d.id));
}

export function writeXp(
  tx: Transaction,
  uid: string,
  key: string,
  entry: Omit<XpTransaction, "id">,
): void {
  tx.create(refs.xp(uid).doc(key), { id: key, ...entry });
}

export function writeActivity(
  tx: Transaction,
  uid: string,
  event: Omit<ActivityEvent, "id">,
): void {
  const id = newId();
  tx.set(refs.activity(uid).doc(id), { id, ...event });
}

export interface EarnedAchievement {
  id: string;
  xpReward: number;
}

/**
 * Unlock every achievement whose threshold `stats` now meets and add its XP
 * reward to `stats.totalXp`. Achievement metrics are never XP-based, so one
 * pass is enough; the ledger's create() calls make double unlocks impossible.
 */
export function grantAchievements(
  tx: Transaction,
  uid: string,
  stats: UserStats,
  unlocked: Set<string>,
  ctx: { now: number; date: string },
): EarnedAchievement[] {
  const earned = newlyEarnedAchievements(stats, unlocked);
  for (const a of earned) {
    unlocked.add(a.id);
    tx.create(refs.achievements(uid).doc(a.id), { id: a.id, unlockedAt: ctx.now, xpReward: a.xpReward });
    writeXp(tx, uid, xpKeys.achievement(a.id), {
      reason: "achievement",
      amount: a.xpReward,
      questId: null,
      refId: a.id,
      label: a.id,
      date: ctx.date,
      createdAt: ctx.now,
    });
    writeActivity(tx, uid, {
      type: "achievement_unlocked",
      questId: null,
      title: a.id,
      detail: "",
      xp: a.xpReward,
      createdAt: ctx.now,
    });
    stats.totalXp += a.xpReward;
  }
  return earned.map((a) => ({ id: a.id, xpReward: a.xpReward }));
}

/** Recompute the player level; logs a level-up event when it rises. */
export function settlePlayerLevel(
  tx: Transaction,
  uid: string,
  stats: UserStats,
  previousLevel: number,
  now: number,
): { before: number; after: number } {
  const after = playerLevelFromXp(stats.totalXp).level;
  stats.playerLevel = after;
  if (after > previousLevel) {
    writeActivity(tx, uid, {
      type: "player_level_up",
      questId: null,
      title: String(after),
      detail: "",
      xp: 0,
      createdAt: now,
    });
  }
  return { before: previousLevel, after };
}

export function emptyDaily(date: string, now: number): DailyActivity {
  return { date, missionsCompleted: 0, studySeconds: 0, xpEarned: 0, sessions: 0, updatedAt: now };
}

export function pickStats(doc: UserStats): UserStats {
  return {
    totalXp: doc.totalXp,
    playerLevel: doc.playerLevel,
    currentStreak: doc.currentStreak,
    longestStreak: doc.longestStreak,
    lastStudyDate: doc.lastStudyDate,
    studyDays: doc.studyDays,
    missionsCompleted: doc.missionsCompleted,
    levelsCompleted: doc.levelsCompleted,
    stagesCompleted: doc.stagesCompleted,
    questsCompleted: doc.questsCompleted,
    questsCreated: doc.questsCreated,
    totalStudySeconds: doc.totalStudySeconds,
    longestSessionSeconds: doc.longestSessionSeconds,
    bestDayStudySeconds: doc.bestDayStudySeconds,
    sessionsCompleted: doc.sessionsCompleted,
  };
}
