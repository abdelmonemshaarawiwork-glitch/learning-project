import { describe, expect, it } from "vitest";
import { keepCompletedProgress, mergeStructure, planDraftSchema, stagesToDraft } from "@/lib/domain/plan";
import { done, level, mission, stage } from "../helpers/factory";

let k = 0;
const newId = () => `new${(++k).toString().padStart(5, "0")}`;

describe("mergeStructure", () => {
  it("preserves progress for existing missions and levels while applying edits", () => {
    const m1 = done({ ...mission(), xpAwarded: 25, actualSeconds: 600 });
    const m2 = mission();
    const l1 = level([m1, m2], { manuallyUnlocked: true });
    const stages = [stage([l1])];
    const draft = stagesToDraft(stages);
    draft[0].levels[0].missions[0].title = "Renamed";
    draft[0].levels[0].missions.reverse();
    draft[0].levels[0].missions.push({ title: "Brand new", description: "", activity: "quiz", estimatedMinutes: 15, difficulty: 1, required: true });
    const merged = mergeStructure(stages, draft, newId, 1000);
    const ms = merged[0].levels[0].missions;
    expect(ms.map((m) => m.title)).toEqual(["Mission", "Renamed", "Brand new"]);
    expect(ms[1]).toMatchObject({ id: m1.id, status: "done", xpAwarded: 25, actualSeconds: 600 });
    expect(ms[2].status).toBe("todo");
    expect(ms[2].id.startsWith("new")).toBe(true);
    expect(merged[0].levels[0].manuallyUnlocked).toBe(true);
  });
  it("cannot forge progress through unknown or duplicated ids", () => {
    const m1 = done(mission());
    const stages = [stage([level([m1])])];
    const draft = stagesToDraft(stages);
    const copy = { ...draft[0].levels[0].missions[0] };
    draft[0].levels[0].missions.push(copy); // duplicate id
    draft[0].levels[0].missions.push({ ...copy, id: "forged00001" }); // unknown id
    const merged = mergeStructure(stages, draft, newId, 1);
    const ms = merged[0].levels[0].missions;
    expect(ms[0].status).toBe("done");
    expect(ms[1].status).toBe("todo");
    expect(ms[1].id).not.toBe(m1.id);
    expect(ms[2].status).toBe("todo");
    expect(ms[2].id).not.toBe("forged00001");
  });
  it("marks levels complete when remaining required missions are removed", () => {
    const m1 = done(mission());
    const m2 = mission();
    const stages = [stage([level([m1, m2])])];
    const draft = stagesToDraft(stages);
    draft[0].levels[0].missions = draft[0].levels[0].missions.slice(0, 1);
    const merged = mergeStructure(stages, draft, newId, 42);
    expect(merged[0].levels[0].completedAt).toBe(42);
    expect(merged[0].completedAt).toBe(42);
  });
});

describe("regeneration helpers", () => {
  it("keeps only completed missions", () => {
    const l1 = level([done(mission({ title: "A" })), mission({ title: "B" })]);
    const l2 = level([mission({ title: "C" })]);
    const kept = keepCompletedProgress([stage([l1]), stage([l2])]);
    expect(kept).toHaveLength(1);
    expect(kept[0].levels[0].missions.map((m) => m.title)).toEqual(["A"]);
  });
});

describe("planDraftSchema", () => {
  it("rejects invalid input", () => {
    const bad = planDraftSchema.safeParse({ title: "", stages: [] });
    expect(bad.success).toBe(false);
    const badMinutes = planDraftSchema.safeParse({
      title: "T",
      stages: [{ title: "S", levels: [{ title: "L", missions: [{ title: "M", estimatedMinutes: 500, difficulty: 2 }] }] }],
    });
    expect(badMinutes.success).toBe(false);
  });
  it("accepts and fills defaults", () => {
    const ok = planDraftSchema.parse({
      title: "T",
      stages: [{ title: "S", levels: [{ title: "L", missions: [{ title: "M", estimatedMinutes: 30, difficulty: 2 }] }] }],
    });
    expect(ok.stages[0].levels[0].missions[0]).toMatchObject({ required: true, activity: "read", description: "" });
    expect(ok.complexity).toBe("intermediate");
  });
});
