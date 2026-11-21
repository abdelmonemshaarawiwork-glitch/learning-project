import { json, readJson, requireUser, route } from "@/lib/server/http";
import { createQuest, createQuestSchema } from "@/lib/server/questService";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, createQuestSchema);
  const result = await createQuest(user.uid, input);
  return json(result, 201);
});
