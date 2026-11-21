import type { PlanDraft } from "@/lib/domain/plan";
import { anthropicConfigured, generateWithClaude } from "./claude";
import { buildMockPlan, streamMockPlan } from "./mock";
import type { PlannerInput } from "./schema";

export type PlannerProvider = "ai" | "mock";

/** Which planner runs: AI_PROVIDER=anthropic|mock|auto (auto = Claude when a key is set). */
export function activeProvider(): PlannerProvider {
  const pref = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (pref === "mock") return "mock";
  if (pref === "anthropic") return "ai";
  return anthropicConfigured() ? "ai" : "mock";
}

export async function generatePlan(
  input: PlannerInput,
  today: string,
  onText?: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ plan: PlanDraft; provider: PlannerProvider }> {
  const provider = activeProvider();
  if (provider === "ai") {
    const plan = await generateWithClaude(input, today, onText, signal);
    return { plan, provider };
  }
  const plan = buildMockPlan(input);
  await streamMockPlan(plan, onText);
  return { plan, provider };
}
