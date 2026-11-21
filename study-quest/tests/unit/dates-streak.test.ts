import { describe, expect, it } from "vitest";
import { addDays, dateKeyInTz, diffDays, isDateKey, startOfWeek, dateRange, addMonths, minutesOfDayInTz } from "@/lib/domain/dates";
import { applyStudyDay, effectiveStreak, streakNeedsToday } from "@/lib/domain/streak";

describe("dates", () => {
  it("computes the calendar day in the user's timezone", () => {
    // 2026-03-01 23:30 UTC
    const ts = Date.UTC(2026, 2, 1, 23, 30);
    expect(dateKeyInTz(ts, "UTC")).toBe("2026-03-01");
    expect(dateKeyInTz(ts, "Africa/Cairo")).toBe("2026-03-02");
    expect(dateKeyInTz(ts, "America/Los_Angeles")).toBe("2026-03-01");
    expect(dateKeyInTz(ts, "Asia/Tokyo")).toBe("2026-03-02");
  });
  it("falls back to UTC for invalid timezones", () => {
    expect(dateKeyInTz(Date.UTC(2026, 0, 1, 12), "Not/AZone")).toBe("2026-01-01");
  });
  it("handles midnight exactly", () => {
    expect(dateKeyInTz(Date.UTC(2026, 0, 1, 0, 0, 0), "UTC")).toBe("2026-01-01");
    expect(dateKeyInTz(Date.UTC(2025, 11, 31, 23, 59, 59), "UTC")).toBe("2025-12-31");
    expect(minutesOfDayInTz(Date.UTC(2026, 0, 1, 0, 5), "UTC")).toBe(5);
  });
  it("does day arithmetic across month, year, leap day and DST", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // EU DST switch day
    expect(diffDays("2026-03-28", "2026-04-02")).toBe(5);
    expect(diffDays("2026-04-02", "2026-03-28")).toBe(-5);
  });
  it("validates keys and ranges", () => {
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-1-1")).toBe(false);
    expect(startOfWeek("2026-11-21")).toBe("2026-11-16"); // Saturday → Monday
    expect(dateRange("2026-01-30", "2026-02-02")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("streaks", () => {
  const base = { currentStreak: 0, longestStreak: 0, lastStudyDate: null as string | null, studyDays: 0 };

  it("starts a streak on the first study day", () => {
    const r = applyStudyDay(base, "2026-11-20");
    expect(r).toMatchObject({ currentStreak: 1, longestStreak: 1, lastStudyDate: "2026-11-20", studyDays: 1, isNewStudyDay: true });
  });
  it("never double counts the same day", () => {
    const d1 = applyStudyDay(base, "2026-11-20");
    const d1b = applyStudyDay(d1, "2026-11-20");
    expect(d1b).toMatchObject({ currentStreak: 1, studyDays: 1, isNewStudyDay: false });
  });
  it("continues on consecutive days and keeps the longest", () => {
    let s = applyStudyDay(base, "2026-11-20");
    s = applyStudyDay(s, "2026-11-21");
    s = applyStudyDay(s, "2026-11-22");
    expect(s.currentStreak).toBe(3);
    s = applyStudyDay(s, "2026-11-25");
    expect(s).toMatchObject({ currentStreak: 1, longestStreak: 3, studyDays: 4 });
  });
  it("continues across month and year boundaries", () => {
    let s = applyStudyDay(base, "2026-12-31");
    s = applyStudyDay(s, "2027-01-01");
    expect(s.currentStreak).toBe(2);
  });
  it("ignores completions dated before the last study day", () => {
    const s = applyStudyDay({ ...base, currentStreak: 4, longestStreak: 4, lastStudyDate: "2026-11-21", studyDays: 4 }, "2026-11-20");
    expect(s).toMatchObject({ currentStreak: 4, studyDays: 4, isNewStudyDay: false });
  });
  it("shows a streak as alive until the day after is missed", () => {
    const st = { currentStreak: 5, lastStudyDate: "2026-11-20" };
    expect(effectiveStreak(st, "2026-11-20")).toBe(5);
    expect(effectiveStreak(st, "2026-11-21")).toBe(5);
    expect(effectiveStreak(st, "2026-11-22")).toBe(0);
    expect(streakNeedsToday(st, "2026-11-21")).toBe(true);
    expect(streakNeedsToday(st, "2026-11-20")).toBe(false);
  });
});
