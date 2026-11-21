import { z } from "zod";
import { isLevelComplete, isStageComplete } from "./progression";
import { ACTIVITY_TYPES, type Difficulty, type Level, type Mission, type Stage } from "./types";
import { clampMinutes } from "./xp";

/**
 * Editable plan structure ("draft") — what the planner preview, the quest
 * editor and the AI all produce. It carries no progress; progress is merged
 * in by id on the server so edits never lose completed work.
 */

export const LIMITS = {
  title: 140,
  description: 1000,
  objective: 300,
  objectives: 8,
  stages: 12,
  levelsPerStage: 15,
  missionsPerLevel: 20,
  totalMissions: 300,
  topic: 2000,
} as const;

const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{4,40}$/)
  .optional();

const text = (max: number) => z.string().trim().max(max);
const title = z.string().trim().min(1).max(LIMITS.title);

export const draftMissionSchema = z.object({
  id: idSchema,
  title,
  description: text(LIMITS.description).default(""),
  activity: z.enum(ACTIVITY_TYPES).default("read"),
  estimatedMinutes: z.number().int().min(5).max(120),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  required: z.boolean().default(true),
});

export const draftLevelSchema = z.object({
  id: idSchema,
  title,
  description: text(LIMITS.description).default(""),
  objectives: z.array(text(LIMITS.objective).min(1)).max(LIMITS.objectives).default([]),
  buildsOn: text(LIMITS.objective).default(""),
  missions: z.array(draftMissionSchema).min(1).max(LIMITS.missionsPerLevel),
});

export const draftStageSchema = z.object({
  id: idSchema,
  title,
  description: text(LIMITS.description).default(""),
  levels: z.array(draftLevelSchema).min(1).max(LIMITS.levelsPerStage),
});

export const stagesSchema = z
  .array(draftStageSchema)
  .min(1)
  .max(LIMITS.stages)
  .refine(
    (stages) =>
      stages.reduce((n, s) => n + s.levels.reduce((m, l) => m + l.missions.length, 0), 0) <=
      LIMITS.totalMissions,
    { message: "too_many_missions" },
  );

export const planDraftSchema = z.object({
  title,
  description: text(LIMITS.description).default(""),
  topic: text(LIMITS.topic).default(""),
  subjectArea: text(80).default(""),
  complexity: z.enum(["introductory", "intermediate", "advanced"]).default("intermediate"),
  prerequisites: z.array(text(200).min(1)).max(8).default([]),
  pacingNote: text(LIMITS.description).default(""),
  stages: stagesSchema,
});

export type DraftMission = z.infer<typeof draftMissionSchema>;
export type DraftLevel = z.infer<typeof draftLevelSchema>;
export type DraftStage = z.infer<typeof draftStageSchema>;
export type PlanDraft = z.infer<typeof planDraftSchema>;

/** Convert stored stages back into an editable draft (ids preserved). */
export function stagesToDraft(stages: Stage[]): DraftStage[] {
  return stages.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    levels: s.levels.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      objectives: [...l.objectives],
      buildsOn: l.buildsOn,
      missions: l.missions.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        activity: m.activity,
        estimatedMinutes: m.estimatedMinutes,
        difficulty: m.difficulty,
        required: m.required,
      })),
    })),
  }));
}

/**
 * Merge an edited draft into stored stages.
 * - Missions/levels/stages whose id already exists keep their progress
 *   (status, completion time, tracked time, XP awarded, unlock/skip flags).
 * - Unknown or duplicate ids get fresh ids (clients cannot forge progress).
 * - Completion timestamps are recomputed from the merged state.
 */
export function mergeStructure(
  existing: Stage[] | null,
  draft: DraftStage[],
  newId: () => string,
  now: number,
): Stage[] {
  const oldMissions = new Map<string, Mission>();
  const oldLevels = new Map<string, Level>();
  const oldStages = new Map<string, Stage>();
  for (const s of existing ?? []) {
    oldStages.set(s.id, s);
    for (const l of s.levels) {
      oldLevels.set(l.id, l);
      for (const m of l.missions) oldMissions.set(m.id, m);
    }
  }
  const used = new Set<string>();
  const claim = (id: string | undefined, known: Map<string, unknown>): string => {
    if (id && known.has(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
    let fresh = newId();
    while (used.has(fresh) || oldMissions.has(fresh) || oldLevels.has(fresh) || oldStages.has(fresh)) {
      fresh = newId();
    }
    used.add(fresh);
    return fresh;
  };

  return draft.map((ds) => {
    const stageId = claim(ds.id, oldStages);
    const levels: Level[] = ds.levels.map((dl) => {
      const levelId = claim(dl.id, oldLevels);
      const prevLevel = oldLevels.get(levelId);
      const missions: Mission[] = dl.missions.map((dm) => {
        const missionId = claim(dm.id, oldMissions);
        const prev = oldMissions.get(missionId);
        return {
          id: missionId,
          title: dm.title.trim(),
          description: (dm.description ?? "").trim(),
          activity: dm.activity,
          estimatedMinutes: clampMinutes(dm.estimatedMinutes),
          difficulty: dm.difficulty as Difficulty,
          required: dm.required,
          status: prev?.status ?? "todo",
          completedAt: prev?.completedAt ?? null,
          actualSeconds: prev?.actualSeconds ?? 0,
          xpAwarded: prev?.xpAwarded ?? 0,
        };
      });
      const level: Level = {
        id: levelId,
        title: dl.title.trim(),
        description: (dl.description ?? "").trim(),
        objectives: (dl.objectives ?? []).map((o) => o.trim()).filter(Boolean),
        buildsOn: (dl.buildsOn ?? "").trim(),
        missions,
        manuallyUnlocked: prevLevel?.manuallyUnlocked ?? false,
        skipped: prevLevel?.skipped ?? false,
        completedAt: null,
      };
      level.completedAt = isLevelComplete(level) ? (prevLevel?.completedAt ?? now) : null;
      return level;
    });
    const stage: Stage = {
      id: stageId,
      title: ds.title.trim(),
      description: (ds.description ?? "").trim(),
      levels,
      completedAt: null,
    };
    stage.completedAt = isStageComplete(stage) ? (oldStages.get(stageId)?.completedAt ?? now) : null;
    return stage;
  });
}

/**
 * For "regenerate plan": keep only what the learner has already completed.
 * Levels with no completed missions and stages with no kept levels are dropped.
 */
export function keepCompletedProgress(stages: Stage[]): DraftStage[] {
  const kept: DraftStage[] = [];
  for (const s of stagesToDraft(stages)) {
    const original = stages.find((x) => x.id === s.id)!;
    const levels = s.levels
      .map((l) => {
        const ol = original.levels.find((x) => x.id === l.id)!;
        const doneIds = new Set(ol.missions.filter((m) => m.status === "done").map((m) => m.id));
        return { ...l, missions: l.missions.filter((m) => m.id && doneIds.has(m.id)) };
      })
      .filter((l) => l.missions.length > 0);
    if (levels.length > 0) kept.push({ ...s, levels });
  }
  return kept;
}

export function completedMissionTitles(stages: Stage[]): string[] {
  return stages.flatMap((s) =>
    s.levels.flatMap((l) => l.missions.filter((m) => m.status === "done").map((m) => m.title)),
  );
}

export function countDraft(stages: DraftStage[]): { stages: number; levels: number; missions: number; minutes: number } {
  let levels = 0;
  let missions = 0;
  let minutes = 0;
  for (const s of stages) {
    levels += s.levels.length;
    for (const l of s.levels) {
      missions += l.missions.length;
      for (const m of l.missions) minutes += m.estimatedMinutes;
    }
  }
  return { stages: stages.length, levels, missions, minutes };
}
