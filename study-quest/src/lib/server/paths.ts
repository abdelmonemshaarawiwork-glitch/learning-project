import { adminDb } from "@/lib/firebase/admin";

/** Typed-ish helpers for the per-user document tree. */
export const refs = {
  user: (uid: string) => adminDb().collection("users").doc(uid),
  settings: (uid: string) => refs.user(uid).collection("settings").doc("preferences"),
  quests: (uid: string) => refs.user(uid).collection("quests"),
  quest: (uid: string, questId: string) => refs.quests(uid).doc(questId),
  sessions: (uid: string) => refs.user(uid).collection("studySessions"),
  xp: (uid: string) => refs.user(uid).collection("xpTransactions"),
  daily: (uid: string, date: string) => refs.user(uid).collection("dailyActivity").doc(date),
  dailyAll: (uid: string) => refs.user(uid).collection("dailyActivity"),
  achievements: (uid: string) => refs.user(uid).collection("achievements"),
  activity: (uid: string) => refs.user(uid).collection("activity"),
  notes: (uid: string) => refs.user(uid).collection("notes"),
  note: (uid: string, questId: string, missionId: string) => refs.notes(uid).doc(`${questId}__${missionId}`),
  usage: (uid: string, date: string) => refs.user(uid).collection("usage").doc(date),
};

/** Deterministic XP ledger ids: a reward can only ever be written once. */
export const xpKeys = {
  mission: (q: string, m: string) => `mission_${q}_${m}`,
  level: (q: string, l: string) => `level_${q}_${l}`,
  stage: (q: string, s: string) => `stage_${q}_${s}`,
  quest: (q: string) => `quest_${q}`,
  achievement: (a: string) => `achievement_${a}`,
};
