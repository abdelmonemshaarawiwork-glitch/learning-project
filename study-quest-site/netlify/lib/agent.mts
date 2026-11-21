import { Allow, parse as parsePartial } from "partial-json";
import { AgentError, anthropicConfigured, runClaude, type HistoryMessage } from "./claude.mts";
import { runMock } from "./mock.mts";
import type { Plan, RunInput } from "./schema.mts";
import { openStore } from "./store.mts";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  at: number;
  planChanged?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ChatTurn[];
  /** Raw model messages (assistant content = JSON) for context. */
  history: HistoryMessage[];
  plan: Plan | null;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export type Job =
  | { state: "running"; chatId: string; startedAt: number; preview?: Preview }
  | { state: "done"; chatId: string; startedAt: number; finishedAt: number; reply: string; planChanged: boolean; plan: Plan | null }
  | { state: "error"; chatId: string; startedAt: number; code: string };

/** A light view of the plan while it is still being written. */
export interface Preview {
  title?: string;
  stages: { title: string; levels: string[] }[];
}

const MAX_HISTORY = 16;

export function dailyLimit() {
  const n = Number(process.env.AGENT_DAILY_LIMIT ?? "60");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

function previewFrom(text: string): Preview | undefined {
  try {
    const p = parsePartial(text, Allow.ALL) as { plan?: { title?: string; stages?: { title?: string; levels?: { title?: string }[] }[] } };
    const stages = (p.plan?.stages ?? [])
      .filter((s) => s && typeof s.title === "string" && s.title)
      .map((s) => ({ title: s.title as string, levels: (s.levels ?? []).map((l) => l?.title).filter((x): x is string => Boolean(x)) }));
    return { title: p.plan?.title || undefined, stages };
  } catch {
    return undefined;
  }
}

function contextLine(input: RunInput, isFirst: boolean): string {
  if (!isFirst) return "";
  const today = new Date().toISOString().slice(0, 10);
  const bits = [`Today is ${today}.`];
  if (input.minutesPerDay) bits.push(`I can study about ${input.minutesPerDay} minutes a day.`);
  if (input.deadline) bits.push(`I want to finish by ${input.deadline}.`);
  return bits.join(" ") + "\n\n";
}

/** Run one agent turn: called by the background function. Never throws. */
export async function runTurn(input: RunInput): Promise<void> {
  const jobs = await openStore("agent-jobs");
  const chats = await openStore("agent-chats");
  const meta = await openStore("agent-meta");
  const startedAt = Date.now();
  await jobs.set(input.jobId, { state: "running", chatId: input.chatId, startedAt } satisfies Job);

  try {
    const day = new Date().toISOString().slice(0, 10);
    const used = (await meta.get<number>(`usage_${day}`)) ?? 0;
    if (used >= dailyLimit()) throw new AgentError("daily_limit");
    const mock = process.env.AGENT_MOCK === "1";
    if (!mock && !anthropicConfigured()) throw new AgentError("not_configured_ai");
    await meta.set(`usage_${day}`, used + 1);

    const chat: Chat = (await chats.get<Chat>(input.chatId)) ?? {
      id: input.chatId,
      title: "",
      createdAt: startedAt,
      updatedAt: startedAt,
      turns: [],
      history: [],
      plan: null,
    };
    const isFirst = chat.history.length === 0;
    const history: HistoryMessage[] = [...chat.history, { role: "user" as const, content: contextLine(input, isFirst) + input.message }].slice(-MAX_HISTORY);
    // The API requires the conversation to start with a user turn.
    while (history.length && history[0].role !== "user") history.shift();

    let lastWrite = 0;
    let pending: Promise<void> = Promise.resolve();
    const onText = (soFar: string) => {
      const now = Date.now();
      if (now - lastWrite < 1500) return;
      lastWrite = now;
      const preview = previewFrom(soFar);
      pending = pending.then(() => jobs.set(input.jobId, { state: "running", chatId: input.chatId, startedAt, preview } satisfies Job)).catch(() => undefined);
    };
    const { reply, raw } = mock ? await runMock(history, onText) : await runClaude(history, onText);
    await pending;

    const now = Date.now();
    const plan = reply.plan_changed && reply.plan.stages.length > 0 ? reply.plan : chat.plan;
    const updated: Chat = {
      ...chat,
      title: chat.title || plan?.title || input.message.slice(0, 80),
      updatedAt: now,
      turns: [
        ...chat.turns,
        { role: "user" as const, text: input.message, at: startedAt },
        { role: "assistant" as const, text: reply.reply, at: now, planChanged: reply.plan_changed },
      ].slice(-60),
      history: [...history, { role: "assistant" as const, content: raw }].slice(-MAX_HISTORY),
      plan,
    };
    if (plan && reply.plan_changed) updated.title = plan.title || updated.title;
    await chats.set(updated.id, updated);
    const index = (await meta.get<ChatSummary[]>("chat_index")) ?? [];
    await meta.set("chat_index", [{ id: updated.id, title: updated.title, updatedAt: now }, ...index.filter((c) => c.id !== updated.id)].slice(0, 200));
    await jobs.set(input.jobId, { state: "done", chatId: input.chatId, startedAt, finishedAt: now, reply: reply.reply, planChanged: reply.plan_changed, plan } satisfies Job);
  } catch (e) {
    const code = e instanceof AgentError ? e.code : "server_error";
    if (!(e instanceof AgentError)) console.error("[agent] unexpected error", e);
    await jobs.set(input.jobId, { state: "error", chatId: input.chatId, startedAt, code } satisfies Job);
  }
}
