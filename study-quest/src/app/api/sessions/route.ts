import { json, readJson, requireUser, route } from "@/lib/server/http";
import { recordSession, sessionSchema } from "@/lib/server/sessionService";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, sessionSchema);
  const result = await recordSession(user.uid, input);
  return json(result);
});
