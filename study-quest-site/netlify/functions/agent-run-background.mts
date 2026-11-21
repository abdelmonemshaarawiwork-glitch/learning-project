/**
 * Background function (Netlify allows up to 15 minutes): runs one agent turn
 * with Claude and writes progress + the result to the job store. The browser
 * polls /api/agent/status for it.
 */
import { requirePassword } from "../lib/http.mts";
import { runTurn } from "../lib/agent.mts";
import { runSchema } from "../lib/schema.mts";

export default async (req: Request, context?: { ip?: string }) => {
  if (req.method !== "POST") return;
  const auth = await requirePassword(req, context);
  if (!auth.ok) return;
  let input;
  try {
    input = runSchema.parse(await req.json());
  } catch {
    return;
  }
  await runTurn(input);
};

export const config = { path: "/api/agent/run" };
