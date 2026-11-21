import { json, readJson, requireUser, route } from "@/lib/server/http";
import { changeQuestStatus, questStatusSchema } from "@/lib/server/questService";

type Ctx = { params: Promise<{ questId: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUser(req);
  const { questId } = await ctx.params;
  const { action } = await readJson(req, questStatusSchema);
  const status = await changeQuestStatus(user.uid, questId, action);
  return json({ status });
});
