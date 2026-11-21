import { describe, expect, it } from "vitest";
import { buildSamplePlan, extractTopic, paceFromInput, sampleTurn, totalMinutes } from "../netlify/lib/sample.mts";

const BP = "I want to study the brachial plexus, including anatomy, branches, relations, and clinical applications.";
const BP_AR = "أريد أن أذاكر الضفيرة العضدية بما في ذلك التشريح، الفروع، العلاقات، والتطبيقات السريرية";

describe("topic analysis", () => {
  it("finds the subject and its parts (English)", () => {
    expect(extractTopic(BP)).toEqual({ subject: "Brachial plexus", parts: ["Anatomy", "Branches", "Relations", "Clinical applications"] });
    expect(extractTopic("Help me revise the cardiac cycle for an exam in 10 days.").subject).toBe("Cardiac cycle");
    expect(extractTopic("Brachial plexus please").subject).toBe("Brachial plexus");
    expect(extractTopic("من فضلك، الدورة القلبية").subject).toBe("الدورة القلبية");
  });
  it("finds the subject and its parts (Arabic)", () => {
    expect(extractTopic(BP_AR)).toEqual({ subject: "الضفيرة العضدية", parts: ["التشريح", "الفروع", "العلاقات", "التطبيقات السريرية"] });
  });
});

describe("plans", () => {
  it("builds a full journey for a multi-part topic", () => {
    const p = buildSamplePlan(BP, { minutesPerDay: 45 });
    expect(p.stages.map((s) => s.title)).toEqual(["Foundations", "Core understanding", "Application & mastery"]);
    expect(p.stages[1].levels.map((l) => l.title)).toEqual(["Anatomy", "Branches", "Relations", "Clinical applications"]);
    expect(p.pacing).toMatch(/45 minutes a day/);
  });
  it("keeps a narrow topic compact", () => {
    const p = buildSamplePlan("Photosynthesis");
    expect(p.stages).toHaveLength(2);
  });
  it("uses a target date for pacing", () => {
    const pace = paceFromInput({ deadline: "2026-12-05" }, "2026-11-21");
    expect(pace.days).toBe(14);
    expect(buildSamplePlan(BP, pace).pacing).toMatch(/for 14 days/);
  });
});

describe("follow-ups", () => {
  const plan = buildSamplePlan(BP);
  it("makes the plan shorter", () => {
    const r = sampleTurn("Make it shorter", plan, {});
    expect(r.plan_changed).toBe(true);
    expect(totalMinutes(r.plan)).toBeLessThan(totalMinutes(plan));
  });
  it("adds practice", () => {
    const r = sampleTurn("Add more practice questions", plan, {});
    expect(r.plan_changed).toBe(true);
    expect(r.plan.stages[1].levels[0].missions.at(-1)!.title).toMatch(/Extra questions/);
  });
  it("fits the plan into a number of weeks or minutes a day", () => {
    expect(sampleTurn("Fit it into 2 weeks", plan, {}).plan.pacing).toMatch(/for 14 days/);
    expect(sampleTurn("I can do 30 minutes a day", plan, {}).plan.pacing).toMatch(/30 minutes a day/);
  });
  it("explains a level without changing the plan", () => {
    const r = sampleTurn("Explain how to study level 1", plan, {});
    expect(r.plan_changed).toBe(false);
    expect(r.reply).toMatch(/Level 1, “Orientation: Brachial plexus”/);
  });
  it("starts a new plan for a new topic", () => {
    const r = sampleTurn("I want to study the Krebs cycle", plan, {});
    expect(r.plan.title).toBe("Krebs cycle");
  });
  it("explains what it can do for anything else", () => {
    const r = sampleTurn("Why?", plan, {});
    expect(r.plan_changed).toBe(false);
    expect(r.reply).toMatch(/sample planner/);
  });
  it("understands Arabic follow-ups", () => {
    const ar = buildSamplePlan(BP_AR);
    expect(sampleTurn("اجعلها أقصر", ar, {}).reply).toMatch(/اختصرت/);
    expect(sampleTurn("اجعلها في أسبوعين", ar, {}).plan.pacing).toMatch(/14 يومًا/);
    expect(sampleTurn("اشرح كيف أذاكر المستوى 1", ar, {}).reply).toMatch(/المستوى 1/);
  });
});
