import { addDays } from "./dates";
import { flattenLevels } from "./progression";
import type { Quest } from "./types";

export interface ScheduledItem {
  questId: string;
  questTitle: string;
  missionId: string;
  title: string;
  minutes: number;
}

export interface ScheduledDay {
  date: string;
  items: ScheduledItem[];
  minutes: number;
}

/**
 * Spread upcoming missions over the next `days` days within the daily minutes
 * goal. Quests with the nearest target dates come first; missions are taken
 * round-robin across quests so every active quest keeps moving.
 */
export function buildSchedule(
  quests: Pick<Quest, "id" | "title" | "status" | "deadline" | "lastStudiedAt" | "stages">[],
  dailyMinutes: number,
  today: string,
  days = 7,
): ScheduledDay[] {
  const active = quests
    .filter((q) => q.status === "active")
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return (b.lastStudiedAt ?? 0) - (a.lastStudiedAt ?? 0);
    });
  const queues = active.map((q) =>
    flattenLevels(q.stages)
      .flatMap((r) => r.level.missions)
      .filter((m) => m.status !== "done")
      .map<ScheduledItem>((m) => ({ questId: q.id, questTitle: q.title, missionId: m.id, title: m.title, minutes: m.estimatedMinutes })),
  );
  const capacity = Math.max(5, dailyMinutes);
  const out: ScheduledDay[] = [];
  for (let d = 0; d < days; d++) {
    const day: ScheduledDay = { date: addDays(today, d), items: [], minutes: 0 };
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const q of queues) {
        const next = q[0];
        if (!next) continue;
        const fits = day.minutes + next.minutes <= capacity || day.items.length === 0;
        if (!fits) continue;
        q.shift();
        day.items.push(next);
        day.minutes += next.minutes;
        progressed = true;
        if (day.minutes >= capacity) break;
      }
      if (day.minutes >= capacity) break;
    }
    out.push(day);
  }
  return out;
}
