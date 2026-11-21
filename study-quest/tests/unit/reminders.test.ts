import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/domain/defaults";
import { dueReminders } from "@/lib/domain/reminders";
import { summarizeQuest } from "@/lib/domain/progression";
import { level, mission, stage } from "../helpers/factory";

const settings = defaultSettings("UTC", "en", 0); // reminder time 18:00, goal 3
const quest = (over: Record<string, unknown> = {}) => {
  const stages = [stage([level([mission(), mission()])])];
  return { id: "q1", title: "Krebs", status: "active" as const, deadline: null as string | null, summary: summarizeQuest(stages), ...over };
};
const base = { settings, profile: { currentStreak: 0, lastStudyDate: null as string | null }, today: "2026-11-21", todayMissions: 0, quests: [quest()] };

describe("reminders", () => {
  it("stays quiet before the reminder time", () => {
    expect(dueReminders({ ...base, minutesNow: 17 * 60 })).toEqual([]);
  });
  it("nudges gently after the reminder time if nothing was studied", () => {
    expect(dueReminders({ ...base, minutesNow: 18 * 60 }).map((r) => r.type)).toEqual(["study"]);
  });
  it("uses the streak reminder instead when a streak is at stake", () => {
    const r = dueReminders({ ...base, profile: { currentStreak: 4, lastStudyDate: "2026-11-20" }, minutesNow: 19 * 60 });
    expect(r.map((x) => x.type)).toEqual(["streak"]);
    expect(r[0].vars.count).toBe(4);
  });
  it("reminds about the goal only when partly done", () => {
    expect(dueReminders({ ...base, todayMissions: 1, minutesNow: 19 * 60 }).map((r) => r.type)).toEqual(["goal"]);
    expect(dueReminders({ ...base, todayMissions: 3, minutesNow: 19 * 60 })).toEqual([]);
  });
  it("flags deadlines within three days at any time", () => {
    const r = dueReminders({ ...base, quests: [quest({ deadline: "2026-11-23" })], minutesNow: 8 * 60 });
    expect(r.map((x) => x.type)).toEqual(["deadline"]);
    expect(dueReminders({ ...base, quests: [quest({ deadline: "2026-12-23" })], minutesNow: 8 * 60 })).toEqual([]);
  });
  it("respects disabled preferences and paused quests", () => {
    const off = { ...settings, notifications: { ...settings.notifications, dailyReminder: false } };
    expect(dueReminders({ ...base, settings: off, minutesNow: 19 * 60 })).toEqual([]);
    expect(dueReminders({ ...base, quests: [quest({ status: "paused" })], minutesNow: 19 * 60 })).toEqual([]);
  });
});
