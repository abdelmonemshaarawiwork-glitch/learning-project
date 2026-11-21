import { z } from "zod";
import { json, readJson, requireUser, route } from "@/lib/server/http";
import { resetStudyData } from "@/lib/server/accountService";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await readJson(req, z.object({ confirm: z.literal("RESET") }));
  await resetStudyData(user.uid);
  return json({ ok: true });
});
