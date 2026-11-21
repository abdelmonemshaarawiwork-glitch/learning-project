"use client";

import type { PlanDraft, DraftStage } from "@/lib/domain/plan";
import type { CompletionResult } from "@/lib/server/progressService";
import { api } from "./api";

export type { CompletionResult };

export const actions = {
  completeMission: (questId: string, missionId: string) =>
    api<CompletionResult>("/api/missions/complete", { method: "POST", body: { questId, missionId } }),
  createQuest: (body: {
    plan: PlanDraft;
    source: "ai" | "mock" | "manual";
    deadline?: string | null;
    minutesPerDay?: number | null;
    familiarity?: "new" | "some" | "confident" | null;
  }) => api<{ questId: string; achievements: string[] }>("/api/quests", { method: "POST", body }),
  updateMeta: (questId: string, patch: { title?: string; description?: string; deadline?: string | null; minutesPerDay?: number | null }) =>
    api(`/api/quests/${questId}`, { method: "PATCH", body: patch }),
  setStatus: (questId: string, action: "pause" | "resume" | "archive" | "unarchive") =>
    api<{ status: string }>(`/api/quests/${questId}/status`, { method: "POST", body: { action } }),
  deleteQuest: (questId: string) => api(`/api/quests/${questId}`, { method: "DELETE" }),
  saveStructure: (questId: string, stages: DraftStage[]) =>
    api(`/api/quests/${questId}/structure`, { method: "PUT", body: { stages } }),
  levelAction: (questId: string, levelId: string, action: "unlock" | "skip" | "unskip") =>
    api(`/api/quests/${questId}/levels/${levelId}`, { method: "POST", body: { action } }),
  saveNote: (questId: string, missionId: string, text: string) =>
    api<{ updatedAt: number }>("/api/notes", { method: "PUT", body: { questId, missionId, text } }),
  recordSession: (body: { sessionId: string; questId: string; missionId: string; startedAt: number; endedAt: number; activeSeconds: number }) =>
    api<{ recorded: boolean; activeSeconds: number; achievements: { id: string; xpReward: number }[] }>("/api/sessions", { method: "POST", body }),
  updateSettings: (patch: Record<string, unknown>) => api("/api/settings", { method: "PATCH", body: patch }),
  updateProfile: (displayName: string) => api("/api/profile", { method: "PATCH", body: { displayName } }),
};

export const studyHref = (questId: string, missionId: string) => `/study/${questId}/${missionId}`;
export const questHref = (questId: string) => `/quests/${questId}`;
