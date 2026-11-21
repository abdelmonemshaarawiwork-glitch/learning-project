import type { MessageKey } from "@/lib/i18n/types";

/** Map Firebase Auth error codes to friendly, translated messages. */
export function authErrorKey(e: unknown): MessageKey {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "auth.errors.invalidEmail";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "auth.errors.wrongCredentials";
    case "auth/email-already-in-use":
      return "auth.errors.emailInUse";
    case "auth/weak-password":
      return "auth.errors.weakPassword";
    case "auth/too-many-requests":
      return "auth.errors.tooManyRequests";
    case "auth/network-request-failed":
      return "auth.errors.network";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "auth.errors.popupClosed";
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    case "auth/operation-not-allowed":
      return "auth.errors.notConfigured";
    default:
      return "auth.errors.generic";
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}
