import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK (server only).
 *
 * Production: FIREBASE_SERVICE_ACCOUNT_KEY holds the service-account JSON
 * (raw JSON on one line, or base64 of it).
 * Development: when FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are
 * set, the SDK talks to the local emulators and needs no credentials.
 */

export class ServerConfigError extends Error {}

function projectId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    undefined
  );
}

export function usingEmulators(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

function parseServiceAccount(raw: string) {
  const trimmed = raw.trim();
  const json = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  const parsed = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new ServerConfigError("FIREBASE_SERVICE_ACCOUNT_KEY is missing client_email or private_key");
  }
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

let app: App | null = null;
let db: Firestore | null = null;

export function adminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw && raw.trim()) {
    let sa;
    try {
      sa = parseServiceAccount(raw);
    } catch (e) {
      if (e instanceof ServerConfigError) throw e;
      throw new ServerConfigError("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON or base64 JSON");
    }
    app = initializeApp({ credential: cert(sa), projectId: sa.projectId ?? projectId() });
    return app;
  }
  if (usingEmulators()) {
    app = initializeApp({ projectId: projectId() ?? "demo-study-quest" });
    return app;
  }
  throw new ServerConfigError(
    "Server is not configured: set FIREBASE_SERVICE_ACCOUNT_KEY (or run against the Firebase emulators).",
  );
}

export function adminDb(): Firestore {
  if (db) return db;
  db = getFirestore(adminApp());
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}
