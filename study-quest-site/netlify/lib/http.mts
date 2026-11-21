import { createHash, timingSafeEqual } from "node:crypto";
import { openStore } from "./store.mts";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function errorJson(code: string, status: number): Response {
  return json({ error: code }, status);
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time password check against AGENT_PASSWORD. */
export function passwordMatches(given: string | null): boolean {
  const expected = process.env.AGENT_PASSWORD ?? "";
  if (!expected || !given) return false;
  return timingSafeEqual(sha(given), sha(expected));
}

export function clientIp(req: Request, context?: { ip?: string }): string {
  return context?.ip || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const MAX_FAILS_PER_HOUR = 10;

function failKey(ip: string) {
  const hour = new Date().toISOString().slice(0, 13);
  return `fail_${sha(ip).toString("hex").slice(0, 16)}_${hour}`;
}

export type AuthResult = { ok: true } | { ok: false; response: Response };

/**
 * Require the agent password (header x-agent-password). Wrong passwords are
 * slowed down and an IP is locked out for the rest of the hour after 10 misses.
 */
export async function requirePassword(req: Request, context?: { ip?: string }): Promise<AuthResult> {
  if (!process.env.AGENT_PASSWORD) return { ok: false, response: errorJson("not_configured_password", 503) };
  const meta = await openStore("agent-meta");
  const key = failKey(clientIp(req, context));
  const fails = (await meta.get<number>(key)) ?? 0;
  if (fails >= MAX_FAILS_PER_HOUR) return { ok: false, response: errorJson("too_many_attempts", 429) };
  if (passwordMatches(req.headers.get("x-agent-password"))) return { ok: true };
  await meta.set(key, fails + 1);
  await new Promise((r) => setTimeout(r, 700));
  return { ok: false, response: errorJson("wrong_password", 401) };
}

export const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
