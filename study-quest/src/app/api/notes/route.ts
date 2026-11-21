import { json, readJson, requireUser, route } from "@/lib/server/http";
import { noteSchema, saveNote } from "@/lib/server/notesService";

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, noteSchema);
  const note = await saveNote(user.uid, input);
  return json({ updatedAt: note.updatedAt });
});
