import { z } from "zod";
import { isDateKey } from "@/lib/domain/dates";
import { LIMITS, type DraftStage, type PlanDraft } from "@/lib/domain/plan";
import { ACTIVITY_TYPES, type Difficulty } from "@/lib/domain/types";
import { clampMinutes } from "@/lib/domain/xp";

/** What the planner endpoint accepts. */
export const plannerInputSchema = z.object({
  topic: z.string().trim().min(3).max(LIMITS.topic),
  deadline: z.string().refine(isDateKey, "invalid_date").nullable().optional(),
  minutesPerDay: z.number().int().min(5).max(600).nullable().optional(),
  familiarity: z.enum(["new", "some", "confident"]).nullable().optional(),
  /** Free-text guidance for a regenerated plan ("shorter", "more practice"…). */
  feedback: z.string().trim().max(1000).optional(),
  /** Titles of missions already completed (regeneration keeps them). */
  completed: z.array(z.string().max(200)).max(300).optional(),
  locale: z.enum(["en", "ar"]).default("en"),
});
export type PlannerInput = z.infer<typeof plannerInputSchema>;

/**
 * Shape requested from the model via structured outputs. Kept free of
 * numeric/array-length constraints (not all are supported by JSON-schema
 * structured outputs); limits are enforced by normalizePlan() instead.
 */
export const aiMissionSchema = z.object({
  title: z.string(),
  description: z.string(),
  activity: z.enum(ACTIVITY_TYPES),
  estimated_minutes: z.number().int(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  required: z.boolean(),
});

export const aiLevelSchema = z.object({
  title: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  builds_on: z.string(),
  missions: z.array(aiMissionSchema),
});

export const aiStageSchema = z.object({
  title: z.string(),
  description: z.string(),
  levels: z.array(aiLevelSchema),
});

export const aiPlanSchema = z.object({
  title: z.string(),
  description: z.string(),
  subject_area: z.string(),
  complexity: z.enum(["introductory", "intermediate", "advanced"]),
  prerequisites: z.array(z.string()),
  pacing_note: z.string(),
  stages: z.array(aiStageSchema),
});
export type AiPlan = z.infer<typeof aiPlanSchema>;

export class PlannerError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

const DIFFICULTY: Record<string, Difficulty> = { easy: 1, medium: 2, hard: 3 };

const cut = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/** Clamp an AI plan into the app's limits and convert it to a PlanDraft. */
export function normalizePlan(raw: AiPlan, topic: string): PlanDraft {
  let missionBudget: number = LIMITS.totalMissions;
  const stages: DraftStage[] = [];
  for (const s of raw.stages.slice(0, LIMITS.stages)) {
    const levels = [];
    for (const l of s.levels.slice(0, LIMITS.levelsPerStage)) {
      const missions = l.missions
        .filter((m) => cut(m.title, LIMITS.title).length > 0)
        .slice(0, Math.min(LIMITS.missionsPerLevel, missionBudget))
        .map((m) => ({
          title: cut(m.title, LIMITS.title),
          description: cut(m.description, LIMITS.description),
          activity: (ACTIVITY_TYPES as readonly string[]).includes(m.activity) ? m.activity : "read",
          estimatedMinutes: clampMinutes(m.estimated_minutes),
          difficulty: DIFFICULTY[m.difficulty] ?? 2,
          required: m.required !== false,
        }));
      missionBudget -= missions.length;
      const title = cut(l.title, LIMITS.title);
      if (missions.length === 0 || !title) continue;
      levels.push({
        title,
        description: cut(l.description, LIMITS.description),
        objectives: l.objectives.map((o) => cut(o, LIMITS.objective)).filter(Boolean).slice(0, LIMITS.objectives),
        buildsOn: cut(l.builds_on, LIMITS.objective),
        missions,
      });
    }
    const title = cut(s.title, LIMITS.title);
    if (levels.length > 0 && title) {
      stages.push({ title, description: cut(s.description, LIMITS.description), levels });
    }
  }
  if (stages.length === 0) throw new PlannerError("ai_invalid_plan", "The plan had no usable missions");
  return {
    title: cut(raw.title, LIMITS.title) || cut(topic, LIMITS.title) || "Study quest",
    description: cut(raw.description, LIMITS.description),
    topic: cut(topic, LIMITS.topic),
    subjectArea: cut(raw.subject_area, 80),
    complexity: raw.complexity,
    prerequisites: raw.prerequisites.map((p) => cut(p, 200)).filter(Boolean).slice(0, 8),
    pacingNote: cut(raw.pacing_note, LIMITS.description),
    stages,
  };
}
