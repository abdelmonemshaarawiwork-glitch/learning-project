import { json, readJson, requireUser, route } from "@/lib/server/http";
import { structureSchema, updateStructure } from "@/lib/server/questService";

type Ctx = { params: Promise<{ questId: string }> };

export const PUT = route<Ctx>(async (req, ctx) => {
  const user = await requireUser(req);
  const { questId } = await ctx.params;
  const input = await readJson(req, structureSchema);
  const quest = await updateStructure(user.uid, questId, input);
  return json({ summary: quest.summary, status: quest.status });
});
