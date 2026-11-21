import { z } from "zod";
import { defaultSettings, newUserDoc, withStatDefaults } from "@/lib/domain/defaults";
import { isValidTimeZone, safeTimeZone } from "@/lib/domain/dates";
import type { Locale, UserDoc, UserSettings } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "./http";
import { refs } from "./paths";

export const bootstrapSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  timezone: z.string().max(64).optional(),
  locale: z.enum(["en", "ar"]).optional(),
});

/** Create the user's profile + settings on first sign-in. Idempotent. */
export async function bootstrapUser(
  uid: string,
  email: string,
  tokenName: string,
  input: z.infer<typeof bootstrapSchema>,
  now = Date.now(),
): Promise<{ created: boolean }> {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const userRef = refs.user(uid);
    const settingsRef = refs.settings(uid);
    const [userSnap, settingsSnap] = await Promise.all([tx.get(userRef), tx.get(settingsRef)]);
    const tz = safeTimeZone(input.timezone);
    const locale: Locale = input.locale ?? "en";
    const name = (input.displayName || tokenName || email.split("@")[0] || "Learner").slice(0, 60);
    let created = false;
    if (!userSnap.exists) {
      tx.set(userRef, newUserDoc(uid, email, name, tz, locale, now));
      created = true;
    } else if (email && userSnap.get("email") !== email) {
      tx.update(userRef, { email, updatedAt: now });
    }
    if (!settingsSnap.exists) {
      tx.set(settingsRef, defaultSettings(tz, locale, now));
    }
    return { created };
  });
}

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});

export async function updateProfile(uid: string, input: z.infer<typeof profileSchema>, now = Date.now()) {
  const ref = refs.user(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "profile_missing");
  await ref.update({ displayName: input.displayName, updatedAt: now });
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const settingsPatchSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    locale: z.enum(["en", "ar"]),
    timezone: z.string().refine(isValidTimeZone, "invalid_timezone"),
    dailyGoalMissions: z.number().int().min(1).max(20),
    dailyGoalMinutes: z.number().int().min(5).max(600),
    preferredSessionMinutes: z.number().int().min(5).max(180),
    notifications: z
      .object({
        browserEnabled: z.boolean(),
        dailyReminder: z.boolean(),
        goalReminder: z.boolean(),
        deadlineReminder: z.boolean(),
        streakReminder: z.boolean(),
        reminderTime: hhmm,
      })
      .partial(),
  })
  .partial()
  .strict();

export async function updateSettings(
  uid: string,
  patch: z.infer<typeof settingsPatchSchema>,
  now = Date.now(),
): Promise<UserSettings> {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const settingsRef = refs.settings(uid);
    const userRef = refs.user(uid);
    const [snap, userSnap] = await Promise.all([tx.get(settingsRef), tx.get(userRef)]);
    if (!userSnap.exists) throw new ApiError(404, "profile_missing");
    const user = userSnap.data() as UserDoc;
    const current = snap.exists
      ? (snap.data() as UserSettings)
      : defaultSettings(user.timezone, user.locale, now);
    const next: UserSettings = {
      ...current,
      ...patch,
      notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
      updatedAt: now,
    };
    tx.set(settingsRef, next);
    const mirror: Partial<UserDoc> = {};
    if (patch.timezone && patch.timezone !== user.timezone) mirror.timezone = patch.timezone;
    if (patch.locale && patch.locale !== user.locale) mirror.locale = patch.locale;
    if (Object.keys(mirror).length) tx.update(userRef, { ...mirror, updatedAt: now });
    return next;
  });
}

export async function getUserOrThrow(uid: string): Promise<UserDoc> {
  const snap = await refs.user(uid).get();
  if (!snap.exists) throw new ApiError(404, "profile_missing");
  return withStatDefaults(snap.data() as UserDoc);
}
