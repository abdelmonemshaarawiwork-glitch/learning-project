import { z } from "zod";
import { findMission } from "@/lib/domain/progression";
import type { MissionNote, Quest } from "@/lib/domain/types";
import { ApiError } from "./http";
import { refs } from "./paths";

export const MAX_NOTE_LENGTH = 20_000;

export const noteSchema = z.object({
  questId: z.string().min(1).max(64),
  missionId: z.string().min(1).max(64),
  text: z.string().max(MAX_NOTE_LENGTH),
});

export async function saveNote(uid: string, input: z.infer<typeof noteSchema>, now = Date.now()): Promise<MissionNote> {
  const questSnap = await refs.quest(uid, input.questId).get();
  if (!questSnap.exists) throw new ApiError(404, "quest_not_found");
  if (!findMission((questSnap.data() as Quest).stages, input.missionId)) {
    throw new ApiError(404, "mission_not_found");
  }
  const note: MissionNote = { questId: input.questId, missionId: input.missionId, text: input.text, updatedAt: now };
  const ref = refs.note(uid, input.questId, input.missionId);
  if (input.text.trim() === "") await ref.delete();
  else await ref.set(note);
  return note;
}
