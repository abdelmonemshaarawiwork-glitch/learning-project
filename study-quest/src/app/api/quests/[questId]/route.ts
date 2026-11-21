import { json, readJson, requireUser, route } from "@/lib/server/http";
import { deleteQuest, questMetaSchema, updateQuestMeta } from "@/lib/server/questService";

type Ctx = { params: Promise<{ questId: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireUser(req);
  const { questId } = await ctx.params;
  const patch = await readJson(req, questMetaSchema);
  await updateQuestMeta(user.uid, questId, patch);
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, ctx) => {
  const user = await requireUser(req);
  const { questId } = await ctx.params;
  await deleteQuest(user.uid, questId);
  return json({ ok: true });
});
