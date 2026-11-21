import { describe, expect, it } from "vitest";
import { buildSchedule } from "@/lib/domain/schedule";
import { done, level, mission, stage } from "../helpers/factory";

const q = (id: string, minutes: number[], over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  status: "active" as const,
  deadline: null as string | null,
  lastStudiedAt: null as number | null,
  stages: [stage([level(minutes.map((m) => mission({ estimatedMinutes: m })))])],
  ...over,
});

describe("buildSchedule", () => {
  it("fills each day up to the daily goal, round-robin across quests", () => {
    const days = buildSchedule([q("a", [20, 20, 20]), q("b", [20, 20])], 45, "2026-11-21", 3);
    expect(days[0].date).toBe("2026-11-21");
    expect(days[0].items.map((i) => i.questId)).toEqual(["a", "b"]);
    expect(days[0].minutes).toBe(40);
    expect(days[1].items.map((i) => i.questId)).toEqual(["a", "b"]);
    expect(days[2].items.map((i) => i.questId)).toEqual(["a"]);
  });
  it("always schedules at least one mission even if it exceeds the goal", () => {
    const days = buildSchedule([q("a", [90])], 30, "2026-11-21", 2);
    expect(days[0].items).toHaveLength(1);
    expect(days[1].items).toHaveLength(0);
  });
  it("puts quests with the nearest target date first and skips done or paused work", () => {
    const quest = q("late", [20, 20]);
    quest.stages[0].levels[0].missions[0] = done(quest.stages[0].levels[0].missions[0]);
    const days = buildSchedule(
      [quest, q("soon", [20], { deadline: "2026-11-25" }), q("paused", [20], { status: "paused" })],
      100,
      "2026-11-21",
      1,
    );
    expect(days[0].items.map((i) => i.questId)).toEqual(["soon", "late"]);
  });
});
