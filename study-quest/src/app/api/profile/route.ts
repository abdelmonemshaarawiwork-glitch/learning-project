import { json, readJson, requireUser, route } from "@/lib/server/http";
import { profileSchema, updateProfile } from "@/lib/server/userService";

export const PATCH = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, profileSchema);
  await updateProfile(user.uid, input);
  return json({ ok: true });
});
