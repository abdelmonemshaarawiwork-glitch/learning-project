import { dateKeyInTz } from "@/lib/domain/dates";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "./http";
import { refs } from "./paths";

export function dailyAiLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT ?? "25");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
}

/** Count one AI plan generation against the user's daily allowance. */
export async function consumeAiQuota(uid: string, timezone: string, now = Date.now()): Promise<number> {
  const date = dateKeyInTz(now, timezone);
  const ref = refs.usage(uid, date);
  const limit = dailyAiLimit();
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.get("planGenerations") ?? 0) : 0;
    if (used >= limit) throw new ApiError(429, "ai_daily_limit");
    tx.set(ref, { date, planGenerations: used + 1, updatedAt: now }, { merge: true });
    return limit - used - 1;
  });
}
