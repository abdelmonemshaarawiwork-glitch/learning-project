import { requireUser, route } from "@/lib/server/http";
import { exportData } from "@/lib/server/accountService";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const data = await exportData(user.uid);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="study-quest-export.json"`,
      "Cache-Control": "no-store",
    },
  });
});
