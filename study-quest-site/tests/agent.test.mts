import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

process.env.AGENT_LOCAL_STORE = "1";
process.env.LOCAL_BLOBS_DIR = mkdtempSync(path.join(tmpdir(), "sq-agent-"));
process.env.AGENT_MOCK_DELAY_MS = "0";

const { normalizePlan, runSchema } = await import("../netlify/lib/schema.mts");
const { passwordMatches, requirePassword } = await import("../netlify/lib/http.mts");
const { runTurn } = await import("../netlify/lib/agent.mts");
const { openStore } = await import("../netlify/lib/store.mts");
const api = (await import("../netlify/functions/agent.mts")).default;

const req = (path: string, init: RequestInit & { pw?: string } = {}) =>
  new Request("http://x" + path, { ...init, headers: { "x-agent-password": init.pw ?? "secret-pw", ...(init.headers ?? {}) } });

beforeEach(() => {
  process.env.AGENT_PASSWORD = "secret-pw";
  process.env.AGENT_MOCK = "1";
  delete process.env.ANTHROPIC_API_KEY;
});

describe("password", () => {
  it("matches only the configured password", () => {
    expect(passwordMatches("secret-pw")).toBe(true);
    expect(passwordMatches("secret-pW")).toBe(false);
    expect(passwordMatches(null)).toBe(false);
    delete process.env.AGENT_PASSWORD;
    expect(passwordMatches("")).toBe(false);
  });
  it("refuses everything when no password is configured", async () => {
    delete process.env.AGENT_PASSWORD;
    const r = await requirePassword(req("/api/agent/auth", { method: "POST" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });
  it("locks an address out after repeated wrong passwords", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await api(req("/api/agent/auth", { method: "POST", pw: "nope" }), { ip: "10.0.0.9" });
      last = r.status;
    }
    expect(last).toBe(429);
    const ok = await api(req("/api/agent/auth", { method: "POST" }), { ip: "10.0.0.10" });
    expect(ok.status).toBe(200);
  }, 20000);
});

describe("plans", () => {
  it("clamps and cleans model output", () => {
    const p = normalizePlan({
      title: "  T ",
      summary: "s",
      pacing: "",
      stages: [
        { title: "", levels: [{ title: "x", objectives: [], missions: [{ title: "m", activity: "read", minutes: 5, difficulty: "easy" }] }] },
        { title: "S", levels: [{ title: "L", objectives: ["", "o"], missions: [{ title: "m", activity: "quiz", minutes: 999, difficulty: "hard" }, { title: "", activity: "read", minutes: 10, difficulty: "easy" }] }, { title: "Empty", objectives: [], missions: [] }] },
      ],
    });
    expect(p.title).toBe("T");
    expect(p.stages).toHaveLength(1);
    expect(p.stages[0].levels).toHaveLength(1);
    expect(p.stages[0].levels[0].missions).toEqual([{ title: "m", activity: "quiz", minutes: 120, difficulty: "hard" }]);
    expect(p.stages[0].levels[0].objectives).toEqual(["o"]);
  });
  it("validates turn requests", () => {
    expect(runSchema.safeParse({ jobId: "short", chatId: "abcdefgh12", message: "hi" }).success).toBe(false);
    expect(runSchema.safeParse({ jobId: "abcdefgh12", chatId: "abcdefgh12", message: " " }).success).toBe(false);
    expect(runSchema.safeParse({ jobId: "abcdefgh12", chatId: "abcdefgh12", message: "hi", minutesPerDay: 45 }).success).toBe(true);
  });
});

describe("agent turns", () => {
  it("runs a turn, saves the conversation and lists it", async () => {
    await runTurn(runSchema.parse({ jobId: "job_000000001", chatId: "chat_00000001", message: "Brachial plexus please", minutesPerDay: 45 }));
    const job = await (await openStore("agent-jobs")).get<{ state: string; planChanged: boolean }>("job_000000001");
    expect(job).toMatchObject({ state: "done", planChanged: true });
    const status = await api(req("/api/agent/status?id=job_000000001"));
    expect(status.status).toBe(200);
    const chat = await (await api(req("/api/agent/chats/chat_00000001"))).json();
    expect(chat.turns).toHaveLength(2);
    expect(chat.plan.stages.length).toBeGreaterThan(0);
    expect(chat).not.toHaveProperty("history");
    const list = await (await api(req("/api/agent/chats"))).json();
    expect(list.chats[0]).toMatchObject({ id: "chat_00000001", title: "Brachial plexus" });
    // follow-up keeps the plan when unchanged
    await runTurn(runSchema.parse({ jobId: "job_000000002", chatId: "chat_00000001", message: "What should I start with?" }));
    const chat2 = await (await api(req("/api/agent/chats/chat_00000001"))).json();
    expect(chat2.turns).toHaveLength(4);
    expect(chat2.plan.title).toBe("Brachial plexus");
    // delete
    expect((await api(req("/api/agent/chats/chat_00000001", { method: "DELETE" }))).status).toBe(200);
    expect((await api(req("/api/agent/chats/chat_00000001"))).status).toBe(404);
  });
  it("reports missing AI configuration instead of failing silently", async () => {
    delete process.env.AGENT_MOCK;
    await runTurn(runSchema.parse({ jobId: "job_000000003", chatId: "chat_00000002", message: "hi there" }));
    const job = await (await openStore("agent-jobs")).get<{ state: string; code: string }>("job_000000003");
    expect(job).toMatchObject({ state: "error", code: "not_configured_ai" });
  });
  it("enforces the daily limit", async () => {
    process.env.AGENT_DAILY_LIMIT = "1";
    const meta = await openStore("agent-meta");
    await meta.set(`usage_${new Date().toISOString().slice(0, 10)}`, 1);
    await runTurn(runSchema.parse({ jobId: "job_000000004", chatId: "chat_00000003", message: "hi there" }));
    const job = await (await openStore("agent-jobs")).get<{ code: string }>("job_000000004");
    expect(job?.code).toBe("daily_limit");
    delete process.env.AGENT_DAILY_LIMIT;
  });
  it("requires the password on every route", async () => {
    expect((await api(req("/api/agent/chats", { pw: "wrong" }), { ip: "10.1.1.1" })).status).toBe(401);
    expect((await api(req("/api/agent/status?id=job_000000001", { pw: "" }), { ip: "10.1.1.2" })).status).toBe(401);
  });
});
