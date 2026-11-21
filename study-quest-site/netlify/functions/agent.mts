/**
 * Agent API (synchronous, fast):
 *   POST   /api/agent/auth          check the password; reports which planner runs (claude | sample)
 *   GET    /api/agent/status?id=…   progress / result of a running turn
 *   GET    /api/agent/chats         saved conversations (newest first)
 *   GET    /api/agent/chats/:id     one conversation with its plan
 *   DELETE /api/agent/chats/:id     delete a conversation
 * Every route requires the x-agent-password header.
 */
import { activeProvider, dailyLimit, type Chat, type ChatSummary, type Job } from "../lib/agent.mts";
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

export const config = {
  path: ["/api/agent/auth", "/api/agent/status", "/api/agent/chats", "/api/agent/chats/:id"],
};
