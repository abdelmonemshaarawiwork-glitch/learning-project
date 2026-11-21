import type { Level, Mission, Stage } from "@/lib/domain/types";

let n = 0;
export const id = (p: string) => `${p}${(++n).toString().padStart(4, "0")}`;

export function mission(over: Partial<Mission> = {}): Mission {
  return {
    id: id("m"),
    title: "Mission",
    description: "",
    activity: "read",
    estimatedMinutes: 20,
    difficulty: 2,
    required: true,
    status: "todo",
    completedAt: null,
    actualSeconds: 0,
    xpAwarded: 0,
    ...over,
  };
}

export function level(missions: Mission[], over: Partial<Level> = {}): Level {
  return {
    id: id("l"),
    title: "Level",
    description: "",
    objectives: [],
    buildsOn: "",
    missions,
    manuallyUnlocked: false,
    skipped: false,
    completedAt: null,
    ...over,
  };
}

export function stage(levels: Level[], over: Partial<Stage> = {}): Stage {
  return { id: id("s"), title: "Stage", description: "", levels, completedAt: null, ...over };
}

export const done = (m: Mission): Mission => ({ ...m, status: "done", completedAt: 1 });
