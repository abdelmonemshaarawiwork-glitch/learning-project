import { describe, expect, it } from "vitest";
import { buildMockPlan, extractTopic } from "@/lib/ai/mock";
import { normalizePlan, plannerInputSchema, type AiPlan } from "@/lib/ai/schema";
import { buildPlannerUserPrompt } from "@/lib/ai/prompt";
import { planDraftSchema, countDraft } from "@/lib/domain/plan";

const input = (topic: string, extra: Record<string, unknown> = {}) => plannerInputSchema.parse({ topic, ...extra });

describe("mock planner", () => {
  it("extracts the subject and sub-topics from a natural request", () => {
    const r = extractTopic("I want to study the brachial plexus, including anatomy, branches, relations, and clinical applications.");
    expect(r.subject).toBe("Brachial plexus");
    expect(r.parts).toEqual(["Anatomy", "Branches", "Relations", "Clinical applications"]);
  });
  it("handles Arabic requests", () => {
    const r = extractTopic("أريد أن أذاكر الضفيرة العضدية بما في ذلك التشريح، الفروع، والتطبيقات السريرية");
    expect(r.subject).toBe("الضفيرة العضدية");
    expect(r.parts).toEqual(["التشريح", "الفروع", "التطبيقات السريرية"]);
  });
  it("builds a valid, appropriately sized plan", () => {
    const big = buildMockPlan(input("I want to study the brachial plexus, including anatomy, branches, relations, and clinical applications."));
    expect(planDraftSchema.safeParse(big).success).toBe(true);
    expect(big.stages.map((s) => s.title)).toEqual(["Foundations", "Core understanding", "Application & mastery"]);
    expect(big.complexity).toBe("advanced");
    const small = buildMockPlan(input("Photosynthesis"));
    expect(small.stages).toHaveLength(2);
    expect(countDraft(small.stages).missions).toBeLessThan(countDraft(big.stages).missions);
    const ar = buildMockPlan(input("أريد أن أذاكر الضفيرة العضدية"));
    expect(ar.stages[0].title).toBe("الأساسيات");
  });
  it("skips completed missions when regenerating", () => {
    const first = buildMockPlan(input("Photosynthesis"));
    const doneTitle = first.stages[0].levels[0].missions[0].title;
    const again = buildMockPlan(input("Photosynthesis", { completed: [doneTitle] }));
    const titles = again.stages.flatMap((s) => s.levels.flatMap((l) => l.missions.map((m) => m.title)));
    expect(titles).not.toContain(doneTitle);
  });
});

describe("normalizePlan", () => {
  const raw: AiPlan = {
    title: "  T  ",
    description: "d",
    subject_area: "Anatomy",
    complexity: "intermediate",
    prerequisites: ["", "Basic anatomy"],
    pacing_note: "",
    stages: [
      { title: "", description: "", levels: [{ title: "L", description: "", objectives: [], builds_on: "", missions: [{ title: "x", description: "", activity: "read", estimated_minutes: 10, difficulty: "easy", required: true }] }] },
      {
        title: "S",
        description: "",
        levels: [
          { title: "Empty", description: "", objectives: [], builds_on: "", missions: [] },
          { title: "L2", description: "", objectives: ["a", ""], builds_on: "", missions: [{ title: "m", description: "", activity: "quiz", estimated_minutes: 400, difficulty: "hard", required: false }] },
        ],
      },
    ],
  };
  it("drops empty parts, clamps values and keeps the result valid", () => {
    const p = normalizePlan(raw, "topic");
    expect(p.title).toBe("T");
    expect(p.stages).toHaveLength(1);
    expect(p.stages[0].levels).toHaveLength(1);
    expect(p.stages[0].levels[0].missions[0]).toMatchObject({ estimatedMinutes: 120, difficulty: 3, required: false });
    expect(p.prerequisites).toEqual(["Basic anatomy"]);
    expect(planDraftSchema.safeParse(p).success).toBe(true);
  });
  it("throws when nothing usable remains", () => {
    expect(() => normalizePlan({ ...raw, stages: [] }, "t")).toThrow();
  });
});

describe("prompt", () => {
  it("includes constraints and completed work", () => {
    const p = buildPlannerUserPrompt(input("Krebs cycle", { deadline: "2026-12-01", minutesPerDay: 30, familiarity: "new", completed: ["Learn the steps"], feedback: "more practice" }), "2026-11-21");
    expect(p).toContain("2026-12-01");
    expect(p).toContain("30 minutes");
    expect(p).toContain("- Learn the steps");
    expect(p).toContain("more practice");
    expect(p).toContain("<request>\nKrebs cycle\n</request>");
  });
});
