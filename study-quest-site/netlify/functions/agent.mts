/**
 * Agent API (synchronous, fast):
 *   POST   /api/agent/auth          check the password; reports which planner runs (claude | sample)
 *   GET    /api/agent/status?id=…   progress / result of a running turn
 *   GET    /api/agent/chats         saved conversations (newest first)
 *   GET    /api/agent/chats/:id     one conversation with its plan
 *   DELETE /api/agent/chats/:id     delete a conversation
 *   POST   /api/agent/chats/:id/journey   { action: "start" | "reset" } or { action: "tick", title, done }
 * Every route requires the x-agent-password header.
 */
import { z } from "zod";
import { activeProvider, dailyLimit, journeyProgress, missionKey, type Chat, type ChatSummary, type Job } from "../lib/agent.mts";
import { errorJson, ID_RE, json, requirePassword } from "../lib/http.mts";
import { openStore } from "../lib/store.mts";

type Ctx = { ip?: string; params?: Record<string, string> };

export default async (req: Request, context?: Ctx) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const auth = await requirePassword(req, context);
  if (!auth.ok) return auth.response;

  try {
    if (path === "/api/agent/auth" && req.method === "POST") {
      const provider = activeProvider();
      return json({ ok: true, provider, dailyLimit: provider === "claude" ? dailyLimit() : null });
    }
    if (path === "/api/agent/status" && req.method === "GET") {
      const id = url.searchParams.get("id") ?? "";
      if (!ID_RE.test(id)) return errorJson("invalid_id", 400);
      const job = await (await openStore("agent-jobs")).get<Job>(id);
      return job ? json(job) : errorJson("not_found", 404);
    }
    if (path === "/api/agent/chats" && req.method === "GET") {
      const index = (await (await openStore("agent-meta")).get<ChatSummary[]>("chat_index")) ?? [];
      return json({ chats: index });
    }
    const j = /^\/api\/agent\/chats\/([A-Za-z0-9_-]{8,64})\/journey$/.exec(path);
    if (j && req.method === "POST") return journeyAction(j[1], req);
    const m = /^\/api\/agent\/chats\/([A-Za-z0-9_-]{8,64})$/.exec(path);
    if (m) {
      const id = m[1];
      const chats = await openStore("agent-chats");
      if (req.method === "GET") {
        const chat = await chats.get<Chat>(id);
        if (!chat) return errorJson("not_found", 404);
        const { history: _history, ...visible } = chat;
        return json(visible);
      }
      if (req.method === "DELETE") {
        await chats.delete(id);
        const meta = await openStore("agent-meta");
        const index = (await meta.get<ChatSummary[]>("chat_index")) ?? [];
        await meta.set("chat_index", index.filter((c) => c.id !== id));
        return json({ ok: true });
      }
    }
    return errorJson("not_found", 404);
  } catch (e) {
    console.error("[agent api]", e);
    return errorJson("server_error", 500);
  }
};

const journeySchema = z.union([
  z.object({ action: z.enum(["start", "reset"]) }),
  z.object({ action: z.literal("tick"), title: z.string().min(1).max(200), done: z.boolean() }),
]);

/** Start / reset a journey, or tick a mission on and off. Returns the journey. */
async function journeyAction(id: string, req: Request): Promise<Response> {
  let body;
  try {
    body = journeySchema.parse(await req.json());
  } catch {
    return errorJson("invalid_input", 400);
  }
  const chats = await openStore("agent-chats");
  const chat = await chats.get<Chat>(id);
  if (!chat || !chat.plan) return errorJson("not_found", 404);
  const now = Date.now();
  if (body.action === "start") chat.journey = chat.journey ?? { startedAt: now, done: {} };
  if (body.action === "reset") chat.journey = { startedAt: now, done: {} };
  if (body.action === "tick") {
    if (!chat.journey) return errorJson("journey_not_started", 409);
    const key = missionKey(body.title);
    if (body.done) chat.journey.done[key] = chat.journey.done[key] ?? now;
    else delete chat.journey.done[key];
  }
  chat.updatedAt = now;
  await chats.set(id, chat);
  const meta = await openStore("agent-meta");
  const index = (await meta.get<ChatSummary[]>("chat_index")) ?? [];
  await meta.set("chat_index", index.map((c) => (c.id === id ? { ...c, updatedAt: now, progress: journeyProgress(chat) } : c)));
  return json({ journey: chat.journey });
}

export const config = {
  path: ["/api/agent/auth", "/api/agent/status", "/api/agent/chats", "/api/agent/chats/:id", "/api/agent/chats/:id/journey"],
};
