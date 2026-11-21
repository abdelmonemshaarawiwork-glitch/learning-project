import { json, readJson, requireUser, route } from "@/lib/server/http";
import { completeMission, completeMissionSchema } from "@/lib/server/progressService";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { questId, missionId } = await readJson(req, completeMissionSchema);
  const result = await completeMission(user.uid, questId, missionId);
  return json(result);
});
