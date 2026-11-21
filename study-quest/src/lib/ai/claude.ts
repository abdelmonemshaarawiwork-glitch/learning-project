import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PlanDraft } from "@/lib/domain/plan";
import { buildPlannerUserPrompt, PLANNER_SYSTEM_PROMPT } from "./prompt";
import { aiPlanSchema, normalizePlan, PlannerError, type PlannerInput } from "./schema";

const DEFAULT_MODEL = "claude-opus-5-5";
type Effort = "low" | "medium" | "high";

function effort(): Effort {
  const e = process.env.ANTHROPIC_EFFORT;
  return e === "low" || e === "high" ? e : "medium";
}

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

/**
 * Generate a plan with Claude. Streams the JSON text as it is produced (so the
 * UI can show the plan forming and the HTTP connection stays alive), then
 * validates it against the schema and normalizes it.
 *
 * Uses server-side fallback ("default"): if the model declines a request for
 * policy reasons, the API retries it on Anthropic's recommended fallback model.
 */
export async function generateWithClaude(
  input: PlannerInput,
  today: string,
  onText?: (delta: string) => void,
  signal?: AbortSignal,
): Promise<PlanDraft> {
  const client = new Anthropic({ maxRetries: 1, timeout: 240_000 });
  const format = zodOutputFormat(aiPlanSchema);

  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = client.beta.messages.stream(
      {
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: effort(),
          format: { type: "json_schema", schema: format.schema },
        },
        system: PLANNER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPlannerUserPrompt(input, today) }],
      },
      { signal },
    );
    if (onText) stream.on("text", (delta) => onText(delta));
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new PlannerError("ai_not_configured", "The AI key was rejected");
    }
    if (e instanceof Anthropic.RateLimitError) throw new PlannerError("ai_busy");
    if (e instanceof Anthropic.BadRequestError) {
      console.error("[planner] bad request", e.message);
      throw new PlannerError("ai_unavailable");
    }
    if (e instanceof Anthropic.APIUserAbortError) throw new PlannerError("ai_aborted");
    if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) {
      console.error("[planner] api error", e.message);
      throw new PlannerError("ai_unavailable");
    }
    throw e;
  }

  if (message.stop_reason === "refusal") throw new PlannerError("ai_refused");
  if (message.stop_reason === "max_tokens") throw new PlannerError("ai_truncated");

  const text = message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  let raw;
  try {
    raw = format.parse(text);
  } catch {
    throw new PlannerError("ai_invalid_plan");
  }
  return normalizePlan(raw, input.topic);
}
