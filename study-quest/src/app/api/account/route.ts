import { z } from "zod";
import { json, readJson, requireUser, route } from "@/lib/server/http";
import { deleteAccount } from "@/lib/server/accountService";

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await readJson(req, z.object({ confirm: z.literal("DELETE") }));
  await deleteAccount(user.uid);
  return json({ ok: true });
});
