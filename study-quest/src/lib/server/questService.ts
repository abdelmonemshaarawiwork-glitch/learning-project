import { z } from "zod";
import { dateKeyInTz, isDateKey } from "@/lib/domain/dates";
import { withStatDefaults } from "@/lib/domain/defaults";
import { mergeStructure, planDraftSchema, stagesSchema } from "@/lib/domain/plan";
import { findLevel, isQuestComplete, summarizeQuest } from "@/lib/domain/progression";
import type { Quest, QuestStatus, UserDoc } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "./http";
import { newId } from "./ids";
import { grantAchievements, pickStats, readUnlockedAchievements, settlePlayerLevel, writeActivity } from "./ledger";
import { refs } from "./paths";

export const MAX_OPEN_QUESTS = 60;

const deadlineSchema = z
  .string()
  .refine(isDateKey, "invalid_date")
  .nullable()
  .optional();

export const createQuestSchema = z.object({
  plan: planDraftSchema,
  source: z.enum(["ai", "mock", "manual"]),
  deadline: deadlineSchema,
  minutesPerDay: z.number().int().min(5).max(600).nullable().optional(),
  familiarity: z.enum(["new", "some", "confident"]).nullable().optional(),
});

export async function createQuest(
  uid: string,
  input: z.infer<typeof createQuestSchema>,
  now = Date.now(),
): Promise<{ questId: string; achievements: string[] }> {
  const db = adminDb();
  const questId = newId();
  const openCount = await refs
    .quests(uid)
    .where("status", "in", ["active", "paused"])
    .count()
    .get();
  if (openCount.data().count >= MAX_OPEN_QUESTS) throw new ApiError(409, "too_many_quests");

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(refs.user(uid));
    if (!userSnap.exists) throw new ApiError(404, "profile_missing");
    const unlocked = await readUnlockedAchievements(tx, uid);
    const user = withStatDefaults(userSnap.data() as UserDoc);
    const stages = mergeStructure(null, input.plan.stages, newId, now);
    const quest: Quest = {
      id: questId,
      title: input.plan.title,
      description: input.plan.description,
      topic: input.plan.topic,
      subjectArea: input.plan.subjectArea,
      complexity: input.plan.complexity,
      prerequisites: input.plan.prerequisites,
      pacingNote: input.plan.pacingNote,
      status: "active",
      source: input.source,
      deadline: input.deadline ?? null,
      minutesPerDay: input.minutesPerDay ?? null,
      familiarity: input.familiarity ?? null,
      stages,
      summary: summarizeQuest(stages),
      createdAt: now,
      updatedAt: now,
      lastStudiedAt: null,
      completedAt: null,
      archivedAt: null,
    };
    tx.create(refs.quest(uid, questId), quest);

    const stats = pickStats(user);
    const prevLevel = stats.playerLevel;
    stats.questsCreated += 1;
    const date = dateKeyInTz(now, user.timezone);
    writeActivity(tx, uid, {
      type: "quest_created",
      questId,
      title: quest.title,
      detail: "",
      xp: 0,
      createdAt: now,
    });
    const earned = grantAchievements(tx, uid, stats, unlocked, { now, date });
    settlePlayerLevel(tx, uid, stats, prevLevel, now);
    tx.update(refs.user(uid), { ...stats, updatedAt: now });
    return { questId, achievements: earned.map((a) => a.id) };
  });
}

export const questMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().max(1000),
    deadline: deadlineSchema,
    minutesPerDay: z.number().int().min(5).max(600).nullable(),
  })
  .partial()
  .strict();

export async function updateQuestMeta(
  uid: string,
  questId: string,
  patch: z.infer<typeof questMetaSchema>,
  now = Date.now(),
): Promise<void> {
  const ref = refs.quest(uid, questId);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "quest_not_found");
    tx.update(ref, { ...patch, updatedAt: now });
  });
}

export const questStatusSchema = z.object({
  action: z.enum(["pause", "resume", "archive", "unarchive"]),
});

export async function changeQuestStatus(
  uid: string,
  questId: string,
  action: z.infer<typeof questStatusSchema>["action"],
  now = Date.now(),
): Promise<QuestStatus> {
  const ref = refs.quest(uid, questId);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "quest_not_found");
    const quest = snap.data() as Quest;
    let next: QuestStatus;
    switch (action) {
      case "pause":
        if (quest.status !== "active") throw new ApiError(409, "invalid_status_change");
        next = "paused";
        break;
      case "resume":
        if (quest.status !== "paused") throw new ApiError(409, "invalid_status_change");
        next = "active";
        break;
      case "archive":
        if (quest.status === "archived") throw new ApiError(409, "invalid_status_change");
        next = "archived";
        break;
      case "unarchive":
        if (quest.status !== "archived") throw new ApiError(409, "invalid_status_change");
        next = isQuestComplete(quest.stages) ? "completed" : "active";
        break;
    }
    tx.update(ref, {
      status: next,
      archivedAt: next === "archived" ? now : null,
      updatedAt: now,
    });
    return next;
  });
}

export async function deleteQuest(uid: string, questId: string): Promise<void> {
  const ref = refs.quest(uid, questId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "quest_not_found");
  // Remove the quest and its notes. XP history and study sessions are kept so
  // totals, streaks and achievements stay truthful.
  const notes = await refs.notes(uid).where("questId", "==", questId).get();
  const db = adminDb();
  const batch = db.batch();
  notes.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(ref);
  await batch.commit();
}

export const structureSchema = z.object({ stages: stagesSchema });

/**
 * Replace the quest's structure with an edited version. Progress on existing
 * missions/levels is preserved by id (see mergeStructure).
 */
export async function updateStructure(
  uid: string,
  questId: string,
  input: z.infer<typeof structureSchema>,
  now = Date.now(),
): Promise<Quest> {
  const ref = refs.quest(uid, questId);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "quest_not_found");
    const quest = snap.data() as Quest;
    const stages = mergeStructure(quest.stages, input.stages, newId, now);
    const complete = isQuestComplete(stages);
    let status = quest.status;
    if (status === "completed" && !complete) status = "active";
    const updated: Quest = {
      ...quest,
      stages,
      summary: summarizeQuest(stages),
      status,
      completedAt: status === "completed" ? quest.completedAt : complete ? quest.completedAt : null,
      updatedAt: now,
    };
    tx.set(ref, updated);
    return updated;
  });
}

export const levelActionSchema = z.object({
  action: z.enum(["unlock", "skip", "unskip"]),
});

export async function levelAction(
  uid: string,
  questId: string,
  levelId: string,
  action: z.infer<typeof levelActionSchema>["action"],
  now = Date.now(),
): Promise<void> {
  const ref = refs.quest(uid, questId);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "quest_not_found");
    const quest = snap.data() as Quest;
    if (quest.status === "archived") throw new ApiError(409, "quest_not_active");
    const found = findLevel(quest.stages, levelId);
    if (!found) throw new ApiError(404, "level_not_found");
    const lvl = found.level;
    if (action === "unlock") lvl.manuallyUnlocked = true;
    if (action === "skip") {
      lvl.skipped = true;
      lvl.manuallyUnlocked = true;
    }
    if (action === "unskip") lvl.skipped = false;
    tx.update(ref, { stages: quest.stages, summary: summarizeQuest(quest.stages), updatedAt: now });
  });
}
