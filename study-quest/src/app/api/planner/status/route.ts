import { activeProvider } from "@/lib/ai";
import { json, requireUser, route } from "@/lib/server/http";
import { dailyAiLimit } from "@/lib/server/usageService";

export const GET = route(async (req) => {
  await requireUser(req);
  return json({ provider: activeProvider(), dailyLimit: dailyAiLimit() });
});
