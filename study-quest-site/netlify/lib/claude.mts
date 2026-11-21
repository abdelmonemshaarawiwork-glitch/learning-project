import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { agentReplySchema, normalizePlan, type AgentReply } from "./schema.mts";

export const SYSTEM_PROMPT = `You are the study planning assistant inside Study Quest, working with one learner. You turn what they want to learn into a calm, structured plan and refine it with them over the conversation.

Plan structure:
- Stage: a major section of the topic (for example foundations, core content, clinical or real-world application, review).
- Level: a milestone inside a stage with 2–4 concrete learning objectives. Levels are studied in order, each building on the previous ones.
- Mission: one small, achievable task with a single clear outcome, starting with a concrete verb (identify, trace, explain, draw, solve, recall…), with an activity type, a realistic time in minutes (usually 10–60, never more than 90) and a difficulty.

How to plan:
1. Work out what the topic covers, how complex it is for this learner and the best learning order (prerequisites first, then structure, then mechanisms or function, then application, then review).
2. Size the plan to the topic: a narrow topic needs 1–2 stages and 2–4 levels; a typical university topic 2–4 stages and 4–9 levels; never more than 6 stages or 60 missions. Do not split simple material into many tiny levels.
3. Include active learning — retrieval practice, drawing or labelling, worked problems or cases — and a final review or self-test level.
4. If the learner gives a daily study time or a target date, fit the total time into what they have; if that is not possible, keep the essentials and say so in pacing.
5. Describe study activities in general terms. Do not invent specific books, page numbers, URLs or videos.

Every turn, answer with JSON:
- reply: what you would say to the learner, 1–4 short sentences of plain text. When you create or change the plan, summarise what you did; when they ask a question, answer it.
- plan_changed: true when this turn creates or revises the plan, false otherwise.
- plan: the complete, updated plan when plan_changed is true. When plan_changed is false, return an empty plan (empty strings and no stages).

When revising, keep what the learner did not ask to change. Write every text in the language the learner writes in (Arabic in, Arabic out).`;

export type HistoryMessage = { role: "user" | "assistant"; content: string };

export class AgentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function anthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * One agent turn with Claude: structured JSON output, streamed (onText gets
 * the JSON text as it is written), with server-side fallback enabled.
 */
export async function runClaude(history: HistoryMessage[], onText: (soFar: string) => void): Promise<{ reply: AgentReply; raw: string }> {
  const client = new Anthropic({ maxRetries: 1, timeout: 600_000 });
  const format = zodOutputFormat(agentReplySchema);
  const effort = (["low", "medium", "high"] as const).find((e) => e === process.env.ANTHROPIC_EFFORT) ?? "medium";
  let text = "";
  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = client.beta.messages.stream({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema: format.schema } },
      system: SYSTEM_PROMPT,
      messages: history,
    });
    stream.on("text", (delta) => {
      text += delta;
      onText(text);
    });
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AgentError("ai_key_rejected");
    if (e instanceof Anthropic.RateLimitError) throw new AgentError("ai_busy");
    if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) {
      console.error("[agent] Claude API error", (e as Error).message);
      throw new AgentError("ai_unavailable");
    }
    throw e;
  }
  if (message.stop_reason === "refusal") throw new AgentError("ai_refused");
  if (message.stop_reason === "max_tokens") throw new AgentError("ai_truncated");
  const raw = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: AgentReply;
  try {
    parsed = format.parse(raw);
  } catch {
    throw new AgentError("ai_invalid");
  }
  return { reply: { ...parsed, plan: normalizePlan(parsed.plan) }, raw };
}
