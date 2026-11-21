import { addDays, addMonths, dateRange, monthKey, startOfWeek } from "./dates";
import type { DailyActivity } from "./types";

export interface Bucket {
  key: string;
  /** First day of the bucket (YYYY-MM-DD). */
  start: string;
  minutes: number;
  missions: number;
  xp: number;
}

function index(days: DailyActivity[]) {
  return new Map(days.map((d) => [d.date, d]));
}

export function dailyBuckets(days: DailyActivity[], today: string, count: number): Bucket[] {
  const byDate = index(days);
  return dateRange(addDays(today, -(count - 1)), today).map((date) => {
    const d = byDate.get(date);
    return { key: date, start: date, minutes: Math.round((d?.studySeconds ?? 0) / 60), missions: d?.missionsCompleted ?? 0, xp: d?.xpEarned ?? 0 };
  });
}

export function weeklyBuckets(days: DailyActivity[], today: string, count: number): Bucket[] {
  const firstWeek = addDays(startOfWeek(today), -7 * (count - 1));
  const buckets: Bucket[] = [];
  for (let i = 0; i < count; i++) {
    const start = addDays(firstWeek, 7 * i);
    buckets.push({ key: start, start, minutes: 0, missions: 0, xp: 0 });
  }
  for (const d of days) {
    const w = startOfWeek(d.date);
    const b = buckets.find((x) => x.start === w);
    if (!b) continue;
    b.minutes += d.studySeconds / 60;
    b.missions += d.missionsCompleted;
    b.xp += d.xpEarned;
  }
  return buckets.map((b) => ({ ...b, minutes: Math.round(b.minutes) }));
}

export function monthlyBuckets(days: DailyActivity[], today: string, count: number): Bucket[] {
  const current = monthKey(today);
  const buckets: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(current, -i);
    buckets.push({ key: m, start: `${m}-01`, minutes: 0, missions: 0, xp: 0 });
  }
  for (const d of days) {
    const b = buckets.find((x) => x.key === monthKey(d.date));
    if (!b) continue;
    b.minutes += d.studySeconds / 60;
    b.missions += d.missionsCompleted;
    b.xp += d.xpEarned;
  }
  return buckets.map((b) => ({ ...b, minutes: Math.round(b.minutes) }));
}

/** Cumulative XP per day over the window, anchored so the last point equals totalXp. */
export function cumulativeXp(days: DailyActivity[], today: string, count: number, totalXp: number) {
  const daily = dailyBuckets(days, today, count);
  const inWindow = daily.reduce((s, d) => s + d.xp, 0);
  let running = Math.max(0, totalXp - inWindow);
  return daily.map((d) => {
    running += d.xp;
    return { date: d.key, xp: running, gained: d.xp };
  });
}

/** Intensity level 0–4 for the calendar heatmap. */
export function heatLevel(minutes: number, missions: number): number {
  if (minutes <= 0 && missions <= 0) return 0;
  const score = minutes + missions * 15;
  if (score < 20) return 1;
  if (score < 45) return 2;
  if (score < 90) return 3;
  return 4;
}
