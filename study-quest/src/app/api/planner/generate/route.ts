import { activeProvider, generatePlan } from "@/lib/ai";
import { plannerInputSchema, PlannerError } from "@/lib/ai/schema";
import { dateKeyInTz } from "@/lib/domain/dates";
import { readJson, requireUser, route } from "@/lib/server/http";
import { consumeAiQuota } from "@/lib/server/usageService";
import { getUserOrThrow } from "@/lib/server/userService";

export const maxDuration = 300;

/**
 * Generates a study plan and streams progress as NDJSON:
 *   {"type":"start","provider":"ai"|"mock"}
 *   {"type":"delta","text":"..."}     (partial JSON as the model writes it)
 *   {"type":"ping"}                    (keep-alive while the model thinks)
 *   {"type":"result","plan":{...},"provider":"ai"|"mock"}
 *   {"type":"error","code":"..."}
 * Nothing is saved here; the client shows a preview and saves via POST /api/quests.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readJson(req, plannerInputSchema);
  const profile = await getUserOrThrow(user.uid);
  const provider = activeProvider();
  if (provider === "ai") await consumeAiQuota(user.uid, profile.timezone);
  const today = dateKeyInTz(Date.now(), profile.timezone);

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };
      send({ type: "start", provider });
      const ping = setInterval(() => send({ type: "ping" }), 4000);
      try {
        const result = await generatePlan(input, today, (text) => send({ type: "delta", text }), abort.signal);
        send({ type: "result", plan: result.plan, provider: result.provider });
      } catch (e) {
        const code = e instanceof PlannerError ? e.code : "ai_unavailable";
        if (!(e instanceof PlannerError)) console.error("[planner] unexpected", e);
        send({ type: "error", code });
      } finally {
        clearInterval(ping);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
