import type { Level, LevelState, Mission, Quest, QuestSummary, Stage } from "./types";

/**
 * Progression rules (pure functions shared by server and client).
 *
 * - Levels are ordered globally across stages (Stage 1 L1, L2, Stage 2 L3, …).
 * - A level is COMPLETED when every required mission is done (if a level has no
 *   required missions, every mission must be done).
 * - A level is unlocked when it is the first level, when the previous level is
 *   completed or was skipped, or when the user unlocked it manually.
 * - Unlocked + no missions done → AVAILABLE; some done → IN_PROGRESS.
 * - A stage is completed when all its levels are completed; the quest is
 *   completed when every stage is completed. Skipping never counts as completing.
 */

export interface LevelRef {
  stage: Stage;
  level: Level;
  stageIndex: number;
  levelIndex: number;
  /** 0-based position across the whole quest. */
  index: number;
}

export function flattenLevels(stages: Stage[]): LevelRef[] {
  const out: LevelRef[] = [];
  let index = 0;
  stages.forEach((stage, stageIndex) => {
    stage.levels.forEach((level, levelIndex) => {
      out.push({ stage, level, stageIndex, levelIndex, index: index++ });
    });
  });
  return out;
}

export function gatingMissions(level: Level): Mission[] {
  const required = level.missions.filter((m) => m.required);
  return required.length > 0 ? required : level.missions;
}

export function isLevelComplete(level: Level): boolean {
  const gating = gatingMissions(level);
  return gating.length > 0 && gating.every((m) => m.status === "done");
}

function isLevelSatisfied(level: Level): boolean {
  return isLevelComplete(level) || level.skipped;
}

export function isStageComplete(stage: Stage): boolean {
  return stage.levels.length > 0 && stage.levels.every(isLevelComplete);
}

export function isQuestComplete(stages: Stage[]): boolean {
  return stages.length > 0 && stages.every(isStageComplete);
}

export function computeLevelStates(stages: Stage[]): Map<string, LevelState> {
  const states = new Map<string, LevelState>();
  const flat = flattenLevels(stages);
  flat.forEach((ref, i) => {
    const { level } = ref;
    if (isLevelComplete(level)) {
      states.set(level.id, "completed");
      return;
    }
    const prev = i > 0 ? flat[i - 1].level : null;
    const unlocked = i === 0 || level.manuallyUnlocked || (prev !== null && isLevelSatisfied(prev));
    if (!unlocked) {
      states.set(level.id, "locked");
      return;
    }
    const anyDone = level.missions.some((m) => m.status === "done");
    states.set(level.id, anyDone ? "in_progress" : "available");
  });
  return states;
}

export function levelProgress(level: Level): { done: number; total: number; percent: number } {
  const gating = gatingMissions(level);
  const done = gating.filter((m) => m.status === "done").length;
  const total = gating.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function stageProgress(stage: Stage): { done: number; total: number; percent: number } {
  const total = stage.levels.length;
  const done = stage.levels.filter(isLevelComplete).length;
  const missions = stage.levels.flatMap(gatingMissions);
  const missionDone = missions.filter((m) => m.status === "done").length;
  return {
    done,
    total,
    percent: missions.length === 0 ? 0 : Math.round((missionDone / missions.length) * 100),
  };
}

export function findMission(
  stages: Stage[],
  missionId: string,
): { stage: Stage; level: Level; mission: Mission; ref: LevelRef } | null {
  for (const ref of flattenLevels(stages)) {
    const mission = ref.level.missions.find((m) => m.id === missionId);
    if (mission) return { stage: ref.stage, level: ref.level, mission, ref };
  }
  return null;
}

export function findLevel(stages: Stage[], levelId: string): LevelRef | null {
  return flattenLevels(stages).find((r) => r.level.id === levelId) ?? null;
}

export function levelEstimatedMinutes(level: Level): number {
  return level.missions.reduce((sum, m) => sum + m.estimatedMinutes, 0);
}

export function levelRemainingMinutes(level: Level): number {
  return level.missions
    .filter((m) => m.status !== "done")
    .reduce((sum, m) => sum + m.estimatedMinutes, 0);
}

export interface LockInfo {
  /** The level that has to be finished (or skipped) to unlock this one. */
  blockingLevel: Level | null;
  blockingRemaining: number;
}

export function lockInfo(stages: Stage[], levelId: string): LockInfo {
  const flat = flattenLevels(stages);
  const i = flat.findIndex((r) => r.level.id === levelId);
  if (i <= 0) return { blockingLevel: null, blockingRemaining: 0 };
  const prev = flat[i - 1].level;
  return {
    blockingLevel: prev,
    blockingRemaining: gatingMissions(prev).filter((m) => m.status !== "done").length,
  };
}

/**
 * The level the user should work on now: the first unlocked, unfinished level
 * (preferring one already in progress), plus its next mission.
 */
export function currentPosition(stages: Stage[]): {
  stageId: string | null;
  levelId: string | null;
  missionId: string | null;
} {
  const states = computeLevelStates(stages);
  const flat = flattenLevels(stages);
  const open = flat.filter((r) => {
    const s = states.get(r.level.id);
    return s === "available" || s === "in_progress";
  });
  const pick =
    open.find((r) => states.get(r.level.id) === "in_progress" && !r.level.skipped) ??
    open.find((r) => !r.level.skipped) ??
    open[0];
  if (!pick) {
    // Everything completed (or nothing unlocked): any leftover optional mission?
    for (const r of flat) {
      if (states.get(r.level.id) === "locked") continue;
      const m = r.level.missions.find((x) => x.status !== "done");
      if (m) return { stageId: r.stage.id, levelId: r.level.id, missionId: m.id };
    }
    return { stageId: null, levelId: null, missionId: null };
  }
  const nextRequired = pick.level.missions.find((m) => m.required && m.status !== "done");
  const nextAny = pick.level.missions.find((m) => m.status !== "done");
  return {
    stageId: pick.stage.id,
    levelId: pick.level.id,
    missionId: (nextRequired ?? nextAny)?.id ?? null,
  };
}

export function summarizeQuest(stages: Stage[]): QuestSummary {
  const missions = stages.flatMap((s) => s.levels.flatMap((l) => l.missions));
  const required = missions.filter((m) => m.required);
  const levels = stages.flatMap((s) => s.levels);
  const gating = levels.flatMap(gatingMissions);
  const gatingDone = gating.filter((m) => m.status === "done").length;
  const pos = currentPosition(stages);
  const totalMinutes = missions.reduce((s, m) => s + m.estimatedMinutes, 0);
  const remainingMinutes = missions
    .filter((m) => m.status !== "done")
    .reduce((s, m) => s + m.estimatedMinutes, 0);
  return {
    totalMissions: missions.length,
    completedMissions: missions.filter((m) => m.status === "done").length,
    requiredMissions: required.length,
    completedRequiredMissions: required.filter((m) => m.status === "done").length,
    totalMinutes,
    remainingMinutes,
    percent: gating.length === 0 ? 0 : Math.round((gatingDone / gating.length) * 100),
    totalLevels: levels.length,
    completedLevels: levels.filter(isLevelComplete).length,
    currentStageId: pos.stageId,
    currentLevelId: pos.levelId,
    nextMissionId: pos.missionId,
  };
}

/** Days left until the quest deadline (negative when overdue), or null. */
export function daysUntil(deadline: string | null, today: string): number | null {
  if (!deadline) return null;
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+deadline.slice(0, 4), +deadline.slice(5, 7) - 1, +deadline.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Suggested minutes per day to finish by the deadline. */
export function suggestedDailyMinutes(quest: Pick<Quest, "deadline" | "summary">, today: string): number | null {
  const days = daysUntil(quest.deadline, today);
  if (days === null || quest.summary.remainingMinutes <= 0) return null;
  return Math.ceil(quest.summary.remainingMinutes / Math.max(1, days + 1));
}
