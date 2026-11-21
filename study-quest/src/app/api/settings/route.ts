import { json, readJson, requireUser, route } from "@/lib/server/http";
import { settingsPatchSchema, updateSettings } from "@/lib/server/userService";

export const PATCH = route(async (req) => {
  const user = await requireUser(req);
  const patch = await readJson(req, settingsPatchSchema);
  const settings = await updateSettings(user.uid, patch);
  return json({ settings });
});
