import type { Difficulty } from "./types";

/**
 * XP rules. Rewards are always computed on the server from the mission's
 * estimate and difficulty; the client never sends an XP amount.
 */

export const MIN_MISSION_MINUTES = 5;
export const MAX_MISSION_MINUTES = 120;

export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  1: 1,
  2: 1.25,
  3: 1.5,
};

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 25;
  return Math.min(MAX_MISSION_MINUTES, Math.max(MIN_MISSION_MINUTES, Math.round(minutes)));
}

/** XP for completing a mission: grows with effort, scaled by difficulty. */
export function missionXp(estimatedMinutes: number, difficulty: Difficulty): number {
  const minutes = clampMinutes(estimatedMinutes);
  const base = 8 + minutes * 0.6;
  return Math.round(base * (DIFFICULTY_MULTIPLIER[difficulty] ?? 1));
}

/** Bonus for completing every required mission in a level. */
export function levelBonusXp(requiredMissionCount: number): number {
  return Math.min(80, 30 + 5 * Math.max(0, requiredMissionCount));
}

export const STAGE_BONUS_XP = 100;
export const QUEST_BONUS_XP = 250;

/** XP needed to go from player level `level` to `level + 1`. */
export function xpToAdvance(level: number): number {
  return 100 + 40 * (Math.max(1, level) - 1);
}

/** Total XP needed to reach `level` from zero. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToAdvance(l);
  return total;
}

export interface PlayerLevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;
  totalXp: number;
}

export function playerLevelFromXp(totalXp: number): PlayerLevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = xp;
  while (remaining >= xpToAdvance(level) && level < 999) {
    remaining -= xpToAdvance(level);
    level++;
  }
  const need = xpToAdvance(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext: need,
    progress: need > 0 ? remaining / need : 0,
    totalXp: xp,
  };
}
