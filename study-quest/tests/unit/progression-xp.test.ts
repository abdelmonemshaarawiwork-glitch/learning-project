import { describe, expect, it } from "vitest";
import { computeLevelStates, currentPosition, isQuestComplete, lockInfo, summarizeQuest, suggestedDailyMinutes, stageProgress } from "@/lib/domain/progression";
import { levelBonusXp, missionXp, playerLevelFromXp, totalXpForLevel, xpToAdvance } from "@/lib/domain/xp";
import { newlyEarnedAchievements, ACHIEVEMENTS } from "@/lib/domain/achievements";
import { EMPTY_STATS } from "@/lib/domain/defaults";
import { done, level, mission, stage } from "../helpers/factory";

function sampleQuest() {
  const l1 = level([mission(), mission(), mission({ required: false })]);
  const l2 = level([mission(), mission()]);
  const l3 = level([mission()]);
  const s1 = stage([l1, l2]);
  const s2 = stage([l3]);
  return { stages: [s1, s2], l1, l2, l3, s1, s2 };
}

describe("level states", () => {
  it("unlocks only the first level initially", () => {
    const { stages, l1, l2, l3 } = sampleQuest();
    const st = computeLevelStates(stages);
    expect(st.get(l1.id)).toBe("available");
    expect(st.get(l2.id)).toBe("locked");
    expect(st.get(l3.id)).toBe("locked");
  });
  it("moves to in-progress, then completed when required missions are done (optional ones ignored)", () => {
    const { stages, l1, l2 } = sampleQuest();
    l1.missions[0] = done(l1.missions[0]);
    expect(computeLevelStates(stages).get(l1.id)).toBe("in_progress");
    l1.missions[1] = done(l1.missions[1]);
    const st = computeLevelStates(stages);
    expect(st.get(l1.id)).toBe("completed");
    expect(st.get(l2.id)).toBe("available");
  });
  it("unlocks across stage boundaries", () => {
    const { stages, l1, l2, l3, s1 } = sampleQuest();
    l1.missions = l1.missions.map(done);
    l2.missions = l2.missions.map(done);
    const st = computeLevelStates(stages);
    expect(st.get(l3.id)).toBe("available");
    expect(stageProgress(s1)).toMatchObject({ done: 2, total: 2, percent: 100 });
  });
  it("supports manual unlocking and skipping", () => {
    const { stages, l2, l3 } = sampleQuest();
    l3.manuallyUnlocked = true;
    let st = computeLevelStates(stages);
    expect(st.get(l3.id)).toBe("available");
    expect(st.get(l2.id)).toBe("locked");
    const q = sampleQuest();
    q.l1.skipped = true;
    st = computeLevelStates(q.stages);
    expect(st.get(q.l2.id)).toBe("available");
    expect(st.get(q.l1.id)).toBe("available");
  });
  it("explains what unlocks a locked level", () => {
    const { stages, l1, l2 } = sampleQuest();
    l1.missions[0] = done(l1.missions[0]);
    const info = lockInfo(stages, l2.id);
    expect(info.blockingLevel?.id).toBe(l1.id);
    expect(info.blockingRemaining).toBe(1);
  });
  it("a level with only optional missions needs all of them", () => {
    const l = level([mission({ required: false }), mission({ required: false })]);
    const stages = [stage([l])];
    l.missions[0] = done(l.missions[0]);
    expect(computeLevelStates(stages).get(l.id)).toBe("in_progress");
    l.missions[1] = done(l.missions[1]);
    expect(computeLevelStates(stages).get(l.id)).toBe("completed");
    expect(isQuestComplete(stages)).toBe(true);
  });
  it("skipping does not complete the quest", () => {
    const { stages, l1, l2, l3 } = sampleQuest();
    l1.skipped = true;
    l2.missions = l2.missions.map(done);
    l3.missions = l3.missions.map(done);
    expect(isQuestComplete(stages)).toBe(false);
  });
});

describe("summary and next mission", () => {
  it("points at the next required mission of the current level", () => {
    const { stages, l1 } = sampleQuest();
    l1.missions[0] = done(l1.missions[0]);
    const pos = currentPosition(stages);
    expect(pos.levelId).toBe(l1.id);
    expect(pos.missionId).toBe(l1.missions[1].id);
    const sum = summarizeQuest(stages);
    expect(sum).toMatchObject({ totalMissions: 6, completedMissions: 1, requiredMissions: 5, totalLevels: 3, completedLevels: 0 });
    expect(sum.percent).toBe(20);
    expect(sum.remainingMinutes).toBe(100);
  });
  it("prefers in-progress unskipped levels, and offers leftover optional missions at the end", () => {
    const { stages, l1, l2, l3 } = sampleQuest();
    l1.missions[0] = done(l1.missions[0]);
    l1.missions[1] = done(l1.missions[1]);
    l2.missions = l2.missions.map(done);
    l3.missions = l3.missions.map(done);
    const pos = currentPosition(stages);
    expect(pos.missionId).toBe(l1.missions[2].id);
    expect(summarizeQuest(stages).percent).toBe(100);
  });
  it("suggests a daily pace for a deadline", () => {
    const { stages } = sampleQuest();
    const summary = summarizeQuest(stages);
    expect(suggestedDailyMinutes({ deadline: "2026-11-24", summary }, "2026-11-21")).toBe(30);
    expect(suggestedDailyMinutes({ deadline: null, summary }, "2026-11-21")).toBeNull();
  });
});

describe("xp", () => {
  it("rewards effort and difficulty within bounds", () => {
    expect(missionXp(20, 2)).toBe(25);
    expect(missionXp(45, 3)).toBe(53);
    expect(missionXp(1, 1)).toBe(11); // clamped to 5 minutes
    expect(missionXp(999, 3)).toBe(120); // clamped to 120 minutes
    expect(levelBonusXp(3)).toBe(45);
    expect(levelBonusXp(20)).toBe(80);
  });
  it("has a gentle, increasing level curve", () => {
    expect(xpToAdvance(1)).toBe(100);
    expect(xpToAdvance(2)).toBe(140);
    expect(totalXpForLevel(3)).toBe(240);
    expect(playerLevelFromXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 100 });
    expect(playerLevelFromXp(99).level).toBe(1);
    expect(playerLevelFromXp(100)).toMatchObject({ level: 2, xpIntoLevel: 0 });
    expect(playerLevelFromXp(250)).toMatchObject({ level: 3, xpIntoLevel: 10, xpForNext: 180 });
    expect(playerLevelFromXp(-5).level).toBe(1);
  });
});

describe("achievements", () => {
  it("earns each achievement once, at its threshold", () => {
    const first = newlyEarnedAchievements({ ...EMPTY_STATS, missionsCompleted: 1 }, new Set());
    expect(first.map((a) => a.id)).toEqual(["first-mission"]);
    const again = newlyEarnedAchievements({ ...EMPTY_STATS, missionsCompleted: 1 }, new Set(["first-mission"]));
    expect(again).toEqual([]);
    const many = newlyEarnedAchievements({ ...EMPTY_STATS, missionsCompleted: 10, longestStreak: 3 }, new Set(["first-mission"]));
    expect(many.map((a) => a.id).sort()).toEqual(["steady-steps", "streak-3"]);
  });
  it("has unique ids", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
