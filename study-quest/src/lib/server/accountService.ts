import { EMPTY_STATS } from "@/lib/domain/defaults";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { refs } from "./paths";

const STUDY_COLLECTIONS = [
  "quests",
  "studySessions",
  "xpTransactions",
  "dailyActivity",
  "achievements",
  "activity",
  "notes",
] as const;

/** Delete all study data but keep the account, profile and settings. */
export async function resetStudyData(uid: string, now = Date.now()): Promise<void> {
  const db = adminDb();
  for (const name of STUDY_COLLECTIONS) {
    await db.recursiveDelete(refs.user(uid).collection(name));
  }
  await refs.user(uid).update({ ...EMPTY_STATS, updatedAt: now });
}

/** Permanently delete the account and every document under it. */
export async function deleteAccount(uid: string): Promise<void> {
  await adminDb().recursiveDelete(refs.user(uid));
  try {
    await adminAuth().deleteUser(uid);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "auth/user-not-found") throw e;
  }
}

/** Everything stored for the user, as plain JSON. */
export async function exportData(uid: string): Promise<Record<string, unknown>> {
  const userSnap = await refs.user(uid).get();
  const settingsSnap = await refs.settings(uid).get();
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    format: "study-quest-export-v1",
    profile: userSnap.data() ?? null,
    settings: settingsSnap.data() ?? null,
  };
  for (const name of STUDY_COLLECTIONS) {
    const snap = await refs.user(uid).collection(name).get();
    out[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return out;
}
