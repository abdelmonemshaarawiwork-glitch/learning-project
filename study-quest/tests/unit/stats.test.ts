import { describe, expect, it } from "vitest";
import { cumulativeXp, dailyBuckets, heatLevel, monthlyBuckets, weeklyBuckets } from "@/lib/domain/stats";

const d = (date: string, minutes: number, missions = 0, xp = 0) => ({ date, studySeconds: minutes * 60, missionsCompleted: missions, xpEarned: xp, sessions: 1, updatedAt: 0 });
const days = [d("2026-11-21", 30, 2, 50), d("2026-11-20", 15, 1, 20), d("2026-11-10", 60, 3, 90), d("2026-10-05", 45, 1, 25)];

describe("stats buckets", () => {
  it("fills every day of the window", () => {
    const b = dailyBuckets(days, "2026-11-21", 3);
    expect(b.map((x) => [x.key, x.minutes])).toEqual([["2026-11-19", 0], ["2026-11-20", 15], ["2026-11-21", 30]]);
  });
  it("groups Monday-based weeks", () => {
    const b = weeklyBuckets(days, "2026-11-21", 2);
    expect(b.map((x) => [x.start, x.minutes, x.missions])).toEqual([["2026-11-09", 60, 3], ["2026-11-16", 45, 3]]);
  });
  it("groups months", () => {
    const b = monthlyBuckets(days, "2026-11-21", 3);
    expect(b.map((x) => [x.key, x.minutes])).toEqual([["2026-09", 0], ["2026-10", 45], ["2026-11", 105]]);
  });
  it("anchors cumulative XP to the current total", () => {
    const c = cumulativeXp(days, "2026-11-21", 2, 500);
    expect(c).toEqual([{ date: "2026-11-20", xp: 450, gained: 20 }, { date: "2026-11-21", xp: 500, gained: 50 }]);
  });
  it("maps intensity to 0–4", () => {
    expect(heatLevel(0, 0)).toBe(0);
    expect(heatLevel(10, 0)).toBe(1);
    expect(heatLevel(0, 2)).toBe(2);
    expect(heatLevel(60, 1)).toBe(3);
    expect(heatLevel(120, 0)).toBe(4);
  });
});
