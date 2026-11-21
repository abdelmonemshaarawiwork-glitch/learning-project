/**
 * Local development server: serves the static site and the agent functions
 * (background function runs without being awaited, like on Netlify).
 *   npm run dev   →  http://localhost:8888   (password: local-dev-password, mock AI)
 */
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import agent from "./netlify/functions/agent.mts";
import run from "./netlify/functions/agent-run-background.mts";

process.env.AGENT_LOCAL_STORE = "1";
const root = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 8888);
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
  if (url.pathname === "/api/agent/run") {
    run(request, { ip: "127.0.0.1" }).catch((e) => console.error(e));
    res.writeHead(202).end();
    return;
  }
  if (url.pathname.startsWith("/api/agent/")) {
    const r = await agent(request, { ip: "127.0.0.1" });
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/html" }).end(await fs.readFile(path.join(root, "404.html")));
  }
}).listen(PORT, () => console.log(`Study Quest site on http://localhost:${PORT}`));
