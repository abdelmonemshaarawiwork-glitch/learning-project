"use client";

import { clientAuth } from "@/lib/firebase/client";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const user = clientAuth().currentUser;
  if (!user) throw new ApiClientError("unauthenticated", 401);
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeader()) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("network", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  if (!res.ok) throw new ApiClientError(data?.error?.code ?? "server_error", res.status);
  return data as T;
}

/** POST and read an NDJSON stream, calling onEvent for each line. */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { ...(await authHeader()), "Content-Type": "application/json" };
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body), signal, cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("network", 0);
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new ApiClientError(data?.error?.code ?? "server_error", res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onEvent(JSON.parse(line));
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("network", 0);
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest));
}

export function newClientId(prefix = "s"): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return prefix + "_" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
