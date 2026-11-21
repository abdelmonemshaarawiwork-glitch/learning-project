import { beforeEach, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase/admin";
import { buildMockPlan } from "@/lib/ai/mock";
import { plannerInputSchema } from "@/lib/ai/schema";
import { stagesToDraft } from "@/lib/domain/plan";
import { computeLevelStates, flattenLevels } from "@/lib/domain/progression";
import type { DailyActivity, Quest, UserDoc } from "@/lib/domain/types";
import { missionXp } from "@/lib/domain/xp";
import { refs } from "@/lib/server/paths";
import { bootstrapUser, updateSettings } from "@/lib/server/userService";
import { changeQuestStatus, createQuest, deleteQuest, levelAction, updateStructure } from "@/lib/server/questService";
import { completeMission } from "@/lib/server/progressService";
import { recordSession } from "@/lib/server/sessionService";
import { saveNote } from "@/lib/server/notesService";
import { deleteAccount, exportData, resetStudyData } from "@/lib/server/accountService";
import { consumeAiQuota } from "@/lib/server/usageService";
import { ApiError } from "@/lib/server/http";

const DAY = 86_400_000;
// 2026-11-20 10:00 UTC
const T0 = Date.UTC(2026, 10, 20, 10, 0, 0);

let uid: string;

async function clearUser(u: string) {
  await adminDb().recursiveDelete(refs.user(u));
}

async function getQuest(questId: string) {
  return (await refs.quest(uid, questId).get()).data() as Quest;
}
async function getUser() {
  return (await refs.user(uid).get()).data() as UserDoc;
}

async function newQuest(topic = "I want to study the brachial plexus, including anatomy, branches, and clinical applications") {
  const plan = buildMockPlan(plannerInputSchema.parse({ topic }));
  const { questId } = await createQuest(uid, { plan, source: "mock" }, T0);
  return questId;
}

function expectApiError(code: string) {
  return (e: unknown) => {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe(code);
    return true;
  };
}

beforeEach(async () => {
  uid = `user_${Math.random().toString(36).slice(2, 10)}`;
  await clearUser(uid);
  await bootstrapUser(uid, "learner@example.com", "Learner", { timezone: "Africa/Cairo", locale: "en" }, T0);
});

describe("profile bootstrap", () => {
  it("creates profile and settings once (idempotent)", async () => {
    const again = await bootstrapUser(uid, "learner@example.com", "Learner", { timezone: "Africa/Cairo" }, T0);
    expect(again.created).toBe(false);
    const user = await getUser();
    expect(user).toMatchObject({ displayName: "Learner", timezone: "Africa/Cairo", totalXp: 0, playerLevel: 1 });
    const settings = (await refs.settings(uid).get()).data();
    expect(settings).toMatchObject({ theme: "light", dailyGoalMissions: 3, timezone: "Africa/Cairo" });
  });
  it("updates settings and mirrors timezone/locale to the profile", async () => {
    await updateSettings(uid, { timezone: "Asia/Tokyo", locale: "ar", notifications: { reminderTime: "20:30" } }, T0);
    const user = await getUser();
    expect(user).toMatchObject({ timezone: "Asia/Tokyo", locale: "ar" });
    const s = (await refs.settings(uid).get()).data()!;
    expect(s.notifications.reminderTime).toBe("20:30");
    expect(s.notifications.dailyReminder).toBe(true);
  });
});

describe("quests and progression", () => {
  it("creates a quest with computed summary and the Path Maker achievement", async () => {
    const questId = await newQuest();
    const quest = await getQuest(questId);
    expect(quest.status).toBe("active");
    expect(quest.summary.totalMissions).toBeGreaterThan(5);
    expect(quest.summary.nextMissionId).toBe(quest.stages[0].levels[0].missions[0].id);
    const user = await getUser();
    expect(user.questsCreated).toBe(1);
    expect(user.totalXp).toBe(10);
    expect((await refs.achievements(uid).doc("path-maker").get()).exists).toBe(true);
  });

  it("awards mission XP once, starts a streak, and rejects repeats", async () => {
    const questId = await newQuest();
    const q = await getQuest(questId);
    const m = q.stages[0].levels[0].missions[0];
    const r = await completeMission(uid, questId, m.id, T0);
    expect(r.breakdown.mission).toBe(missionXp(m.estimatedMinutes, m.difficulty));
    expect(r.achievements.map((a) => a.id)).toContain("first-mission");
    expect(r.streak).toEqual({ current: 1, increased: true });
    await expect(completeMission(uid, questId, m.id, T0 + 1000)).rejects.toSatisfy(expectApiError("mission_already_completed"));
    const xpDocs = await refs.xp(uid).where("reason", "==", "mission").get();
    expect(xpDocs.size).toBe(1);
    const daily = (await refs.daily(uid, "2026-11-20").get()).data() as DailyActivity;
    expect(daily.missionsCompleted).toBe(1);
    expect(daily.xpEarned).toBe(r.xpGained);
    const user = await getUser();
    expect(user.totalXp).toBe(10 + r.xpGained);
  });

  it("blocks locked levels, then unlocks the next level when one is completed", async () => {
    const questId = await newQuest();
    let q = await getQuest(questId);
    const [first, second] = flattenLevels(q.stages);
    await expect(completeMission(uid, questId, second.level.missions[0].id, T0)).rejects.toSatisfy(expectApiError("level_locked"));
    let last;
    for (const m of first.level.missions) last = await completeMission(uid, questId, m.id, T0);
    expect(last!.levelCompleted?.id).toBe(first.level.id);
    expect(last!.breakdown.level).toBeGreaterThan(0);
    expect(last!.unlockedLevels.map((l) => l.id)).toEqual([second.level.id]);
    q = await getQuest(questId);
    expect(computeLevelStates(q.stages).get(second.level.id)).toBe("available");
    expect((await getUser()).levelsCompleted).toBe(1);
  });

  it("completes a whole quest with stage and quest bonuses exactly once", async () => {
    const questId = await newQuest("Photosynthesis");
    let q = await getQuest(questId);
    const all = flattenLevels(q.stages);
    const results = [];
    for (const ref of all) for (const m of ref.level.missions) results.push(await completeMission(uid, questId, m.id, T0));
    const final = results[results.length - 1];
    expect(results.filter((r) => r.stageCompleted).length).toBe(q.stages.length);
    expect(results.filter((r) => r.questCompleted).length).toBe(1);
    expect(final.questCompleted || results.some((r) => r.questCompleted)).toBe(true);
    q = await getQuest(questId);
    expect(q.status).toBe("completed");
    expect(q.summary.percent).toBe(100);
    const user = await getUser();
    expect(user.questsCompleted).toBe(1);
    expect(user.stagesCompleted).toBe(q.stages.length);
    const ledger = await refs.xp(uid).get();
    const sum = ledger.docs.reduce((s, d) => s + (d.get("amount") as number), 0);
    expect(user.totalXp).toBe(sum);
    expect(ledger.docs.filter((d) => d.get("reason") === "quest")).toHaveLength(1);
  });

  it("counts streak days in the user's timezone, once per day", async () => {
    const questId = await newQuest();
    const q = await getQuest(questId);
    const ms = q.stages[0].levels[0].missions;
    // 23:30 Cairo time on Nov 20 is 21:30 UTC
    const lateEvening = Date.UTC(2026, 10, 20, 21, 30);
    let r = await completeMission(uid, questId, ms[0].id, lateEvening);
    expect(r.streak.current).toBe(1);
    // 00:30 Cairo time on Nov 21 (22:30 UTC Nov 20) — a new local day
    r = await completeMission(uid, questId, ms[1].id, lateEvening + 60 * 60 * 1000);
    expect(r.streak).toEqual({ current: 2, increased: true });
    const user = await getUser();
    expect(user).toMatchObject({ currentStreak: 2, longestStreak: 2, studyDays: 2, lastStudyDate: "2026-11-21" });
    // Two days later the streak restarts at 1.
    r = await completeMission(uid, questId, ms[2].id, lateEvening + 3 * DAY);
    expect(r.streak.current).toBe(1);
    expect((await getUser()).longestStreak).toBe(2);
  });

  it("supports manual unlock and skip, without completing the quest", async () => {
    const questId = await newQuest();
    let q = await getQuest(questId);
    const [first, second, third] = flattenLevels(q.stages);
    await levelAction(uid, questId, third.level.id, "unlock", T0);
    q = await getQuest(questId);
    expect(computeLevelStates(q.stages).get(third.level.id)).toBe("available");
    await levelAction(uid, questId, first.level.id, "skip", T0);
    q = await getQuest(questId);
    const states = computeLevelStates(q.stages);
    expect(states.get(second.level.id)).toBe("available");
    expect(states.get(first.level.id)).toBe("available");
    await completeMission(uid, questId, second.level.missions[0].id, T0);
  });

  it("pauses, resumes, archives and unarchives with guarded transitions", async () => {
    const questId = await newQuest();
    expect(await changeQuestStatus(uid, questId, "pause", T0)).toBe("paused");
    const q = await getQuest(questId);
    await expect(completeMission(uid, questId, q.summary.nextMissionId!, T0)).rejects.toSatisfy(expectApiError("quest_not_active"));
    await expect(changeQuestStatus(uid, questId, "pause", T0)).rejects.toSatisfy(expectApiError("invalid_status_change"));
    expect(await changeQuestStatus(uid, questId, "resume", T0)).toBe("active");
    expect(await changeQuestStatus(uid, questId, "archive", T0)).toBe("archived");
    expect(await changeQuestStatus(uid, questId, "unarchive", T0)).toBe("active");
  });

  it("preserves completed progress when the structure is edited", async () => {
    const questId = await newQuest();
    let q = await getQuest(questId);
    const m0 = q.stages[0].levels[0].missions[0];
    await completeMission(uid, questId, m0.id, T0);
    const draft = stagesToDraft(q.stages);
    // Reorder stages' first level missions, rename, add a mission, delete another level.
    draft[0].levels[0].missions.reverse();
    draft[0].levels[0].missions.push({ title: "Extra drill", description: "", activity: "quiz", estimatedMinutes: 15, difficulty: 1, required: false });
    draft[draft.length - 1].levels.pop();
    draft[0].title = "Renamed foundations";
    await updateStructure(uid, questId, { stages: draft }, T0 + 1000);
    q = await getQuest(questId);
    const kept = q.stages[0].levels[0].missions.find((m) => m.id === m0.id)!;
    expect(kept.status).toBe("done");
    expect(q.stages[0].title).toBe("Renamed foundations");
    expect(q.stages[0].levels[0].missions.at(-1)!.title).toBe("Extra drill");
    expect(q.summary.completedMissions).toBe(1);
  });

  it("deletes a quest with its notes but keeps XP history", async () => {
    const questId = await newQuest();
    const q = await getQuest(questId);
    const m = q.stages[0].levels[0].missions[0];
    await saveNote(uid, { questId, missionId: m.id, text: "Roots C5–T1" }, T0);
    await completeMission(uid, questId, m.id, T0);
    await deleteQuest(uid, questId);
    expect((await refs.quest(uid, questId).get()).exists).toBe(false);
    expect((await refs.notes(uid).get()).size).toBe(0);
    expect((await refs.xp(uid).where("reason", "==", "mission").get()).size).toBe(1);
  });
});

describe("study sessions", () => {
  it("records tracked time idempotently and validates durations", async () => {
    const questId = await newQuest();
    const q = await getQuest(questId);
    const m = q.stages[0].levels[0].missions[0];
    const base = { sessionId: "sess_abc12345", questId, missionId: m.id, startedAt: T0, endedAt: T0 + 50 * 60_000, activeSeconds: 46 * 60 };
    const r = await recordSession(uid, base, T0 + 50 * 60_000);
    expect(r.recorded).toBe(true);
    expect(r.achievements.map((a) => a.id)).toContain("deep-focus");
    const again = await recordSession(uid, base, T0 + 51 * 60_000);
    expect(again.recorded).toBe(false);
    const user = await getUser();
    expect(user).toMatchObject({ totalStudySeconds: 46 * 60, sessionsCompleted: 1, longestSessionSeconds: 46 * 60 });
    const quest = await getQuest(questId);
    expect(quest.stages[0].levels[0].missions[0].actualSeconds).toBe(46 * 60);
    // Active time longer than the wall-clock window is rejected.
    await expect(recordSession(uid, { ...base, sessionId: "sess_bad000001", activeSeconds: 3600 }, T0 + 50 * 60_000)).rejects.toSatisfy(expectApiError("invalid_session_duration"));
    // Sessions in the future are rejected.
    await expect(recordSession(uid, { ...base, sessionId: "sess_bad000002", startedAt: T0 + DAY, endedAt: T0 + DAY + 60_000, activeSeconds: 60 }, T0)).rejects.toSatisfy(expectApiError("invalid_session_window"));
    // Very short sessions are ignored.
    const tiny = await recordSession(uid, { ...base, sessionId: "sess_tiny00001", endedAt: T0 + 10_000, activeSeconds: 10 }, T0 + 60_000);
    expect(tiny.recorded).toBe(false);
  });
});

describe("account and limits", () => {
  it("enforces the daily AI allowance", async () => {
    process.env.AI_DAILY_LIMIT = "2";
    await consumeAiQuota(uid, "UTC", T0);
    await consumeAiQuota(uid, "UTC", T0);
    await expect(consumeAiQuota(uid, "UTC", T0)).rejects.toSatisfy(expectApiError("ai_daily_limit"));
    await expect(consumeAiQuota(uid, "UTC", T0 + DAY)).resolves.toBe(1);
    delete process.env.AI_DAILY_LIMIT;
  });

  it("exports, resets study data and deletes the account", async () => {
    const questId = await newQuest();
    const q = await getQuest(questId);
    await completeMission(uid, questId, q.summary.nextMissionId!, T0);
    const data = await exportData(uid);
    expect((data.quests as unknown[]).length).toBe(1);
    expect((data.xpTransactions as unknown[]).length).toBeGreaterThan(0);
    await resetStudyData(uid, T0);
    expect((await refs.quests(uid).get()).size).toBe(0);
    expect((await getUser()).totalXp).toBe(0);
    expect((await refs.settings(uid).get()).exists).toBe(true);
    await deleteAccount(uid);
    expect((await refs.user(uid).get()).exists).toBe(false);
    expect((await refs.settings(uid).get()).exists).toBe(false);
  });
});
