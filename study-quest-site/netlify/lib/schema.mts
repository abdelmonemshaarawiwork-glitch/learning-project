import { z } from "zod";

export const ACTIVITIES = ["read", "watch", "notes", "recall", "practice", "quiz", "review", "diagram", "flashcards", "project"] as const;

/** Shape requested from Claude via structured outputs (no numeric limits here; normalize() clamps). */
export const missionSchema = z.object({
  title: z.string(),
  activity: z.enum(ACTIVITIES),
  minutes: z.number().int(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});
export const levelSchema = z.object({
  title: z.string(),
  objectives: z.array(z.string()),
  missions: z.array(missionSchema),
});
export const stageSchema = z.object({ title: z.string(), levels: z.array(levelSchema) });
export const planSchema = z.object({
  title: z.string(),
  summary: z.string(),
  pacing: z.string(),
  stages: z.array(stageSchema),
});
export const agentReplySchema = z.object({
  reply: z.string(),
  plan_changed: z.boolean(),
  plan: planSchema,
});
export type Plan = z.infer<typeof planSchema>;
export type AgentReply = z.infer<typeof agentReplySchema>;

/** Request body for a new agent turn. */
export const runSchema = z.object({
  jobId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  chatId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  message: z.string().trim().min(1).max(4000),
  minutesPerDay: z.number().int().min(5).max(600).nullable().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  locale: z.enum(["en", "ar"]).default("en"),
});
export type RunInput = z.infer<typeof runSchema>;

const cut = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/** Clamp a plan into sane limits and drop empty parts. */
export function normalizePlan(p: Plan): Plan {
  let budget = 120;
  const stages = p.stages.slice(0, 8).map((s) => ({
    title: cut(s.title, 120),
    levels: s.levels.slice(0, 12).map((l) => {
      const missions = l.missions
        .filter((m) => cut(m.title, 160))
        .slice(0, Math.max(0, Math.min(15, budget)))
        .map((m) => ({
          title: cut(m.title, 160),
          activity: (ACTIVITIES as readonly string[]).includes(m.activity) ? m.activity : "read",
          minutes: Math.min(120, Math.max(5, Math.round(Number(m.minutes) || 25))),
          difficulty: m.difficulty,
        }));
      budget -= missions.length;
      return { title: cut(l.title, 120), objectives: l.objectives.map((o) => cut(o, 240)).filter(Boolean).slice(0, 6), missions };
    }).filter((l) => l.title && l.missions.length > 0),
  })).filter((s) => s.title && s.levels.length > 0);
  return { title: cut(p.title, 140), summary: cut(p.summary, 600), pacing: cut(p.pacing, 600), stages };
}
