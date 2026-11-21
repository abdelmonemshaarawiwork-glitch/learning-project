import { json, readJson, requireUser, route } from "@/lib/server/http";
import { bootstrapSchema, bootstrapUser } from "@/lib/server/userService";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, bootstrapSchema);
  const result = await bootstrapUser(user.uid, user.email, user.name, input);
  return json(result);
});
