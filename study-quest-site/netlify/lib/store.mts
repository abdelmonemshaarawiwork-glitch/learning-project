/**
 * Key-value storage. On Netlify: Netlify Blobs (strong consistency, so polling
 * sees updates immediately). Locally (dev server / tests): JSON files.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const LOCAL_DIR = process.env.LOCAL_BLOBS_DIR ?? path.join(process.cwd(), ".local-blobs");

function localStore(name: string): KV {
  const dir = path.join(LOCAL_DIR, name);
  const file = (key: string) => path.join(dir, encodeURIComponent(key) + ".json");
  return {
    async get<T>(key: string) {
      try {
        return JSON.parse(await fs.readFile(file(key), "utf8")) as T;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key), JSON.stringify(value));
    },
    async delete(key) {
      await fs.rm(file(key), { force: true });
    },
  };
}

async function netlifyStore(name: string): Promise<KV> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name, consistency: "strong" });
  return {
    async get<T>(key: string) {
      return ((await store.get(key, { type: "json" })) as T | null) ?? null;
    },
    async set(key, value) {
      await store.setJSON(key, value);
    },
    async delete(key) {
      await store.delete(key);
    },
  };
}

const useLocal = () => process.env.AGENT_LOCAL_STORE === "1" || !process.env.NETLIFY_BLOBS_CONTEXT;

export async function openStore(name: "agent-jobs" | "agent-chats" | "agent-meta"): Promise<KV> {
  return useLocal() ? localStore(name) : netlifyStore(name);
}
