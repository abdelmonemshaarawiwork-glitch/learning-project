import { json, readJson, requireUser, route } from "@/lib/server/http";
import { levelAction, levelActionSchema } from "@/lib/server/questService";

type Ctx = { params: Promise<{ questId: string; levelId: string }> };

export const POST = route<Ctx>(async (req, ctx) => {
  const user = await requireUser(req);
  const { questId, levelId } = await ctx.params;
  const { action } = await readJson(req, levelActionSchema);
  await levelAction(user.uid, questId, levelId, action);
  return json({ ok: true });
});
