"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { addDays, dateKeyInTz } from "@/lib/domain/dates";
import type {
  ActivityEvent,
  DailyActivity,
  MissionNote,
  Quest,
  StudySession,
  UnlockedAchievement,
  XpTransaction,
} from "@/lib/domain/types";
import { useLiveCollection, useLiveDoc } from "./firestore";

function useUid(): string | null {
  return useAuth().user?.uid ?? null;
}

export function useTimezone(): string {
  const { settings, profile } = useAuth();
  return settings?.timezone ?? profile?.timezone ?? "UTC";
}

/** Today's date key in the user's timezone; updates across midnight. */
export function useToday(): string {
  const tz = useTimezone();
  const [today, setToday] = useState(() => dateKeyInTz(Date.now(), tz));
  useEffect(() => {
    setToday(dateKeyInTz(Date.now(), tz));
    const id = setInterval(() => setToday(dateKeyInTz(Date.now(), tz)), 30_000);
    return () => clearInterval(id);
  }, [tz]);
  return today;
}

export function useQuests() {
  const uid = useUid();
  return useLiveCollection<Quest>(uid ? ["users", uid, "quests"] : null, { orderBy: ["updatedAt", "desc"] });
}

export function useQuest(questId: string | null) {
  const uid = useUid();
  return useLiveDoc<Quest>(uid && questId ? ["users", uid, "quests", questId] : null);
}

/** Daily activity from `days` days ago through today. */
export function useDailyActivity(days: number) {
  const uid = useUid();
  const today = useToday();
  const from = addDays(today, -(days - 1));
  return useLiveCollection<DailyActivity>(uid ? ["users", uid, "dailyActivity"] : null, {
    where: ["date", ">=", from],
    orderBy: ["date", "asc"],
  });
}

export function useXpHistory(limit = 50) {
  const uid = useUid();
  return useLiveCollection<XpTransaction>(uid ? ["users", uid, "xpTransactions"] : null, {
    orderBy: ["createdAt", "desc"],
    limit,
  });
}

export function useActivity(limit = 10) {
  const uid = useUid();
  return useLiveCollection<ActivityEvent>(uid ? ["users", uid, "activity"] : null, {
    orderBy: ["createdAt", "desc"],
    limit,
  });
}

export function useAchievements() {
  const uid = useUid();
  return useLiveCollection<UnlockedAchievement>(uid ? ["users", uid, "achievements"] : null);
}

export function useSessions(limit = 20) {
  const uid = useUid();
  return useLiveCollection<StudySession>(uid ? ["users", uid, "studySessions"] : null, {
    orderBy: ["endedAt", "desc"],
    limit,
  });
}

export function useNote(questId: string, missionId: string) {
  const uid = useUid();
  return useLiveDoc<MissionNote>(uid ? ["users", uid, "notes", `${questId}__${missionId}`] : null);
}
