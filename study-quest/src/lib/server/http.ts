import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { adminAuth, ServerConfigError } from "@/lib/firebase/admin";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface AuthedUser {
  uid: string;
  email: string;
  name: string;
}

/** Verify the Firebase ID token sent as `Authorization: Bearer <token>`. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ApiError(401, "unauthenticated");
  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      name: (decoded.name as string | undefined) ?? "",
    };
  } catch (e) {
    if (e instanceof ServerConfigError) throw e;
    throw new ApiError(401, "unauthenticated");
  }
}

const MAX_BODY_BYTES = 512 * 1024;

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large");
  let body: unknown;
  try {
    const textBody = await req.text();
    if (textBody.length > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large");
    body = textBody ? JSON.parse(textBody) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "invalid_json");
  }
  return schema.parse(body);
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return json({ error: { code: e.code, message: e.message } }, e.status);
  }
  if (e instanceof ZodError) {
    return json(
      { error: { code: "invalid_input", message: "Invalid input", issues: e.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) } },
      400,
    );
  }
  if (e instanceof ServerConfigError) {
    console.error("[config]", e.message);
    return json({ error: { code: "server_not_configured", message: e.message } }, 503);
  }
  console.error("[api] unexpected error", e);
  return json({ error: { code: "server_error", message: "Something went wrong" } }, 500);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler with uniform error handling. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
