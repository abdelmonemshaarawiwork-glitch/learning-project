import { ApiClientError } from "./api";
import type { Translator } from "@/lib/i18n/core";

/** Human message for any API error. */
export function apiErrorMessage(t: Translator["t"], e: unknown): string {
  if (e instanceof ApiClientError) {
    const msg = t(`errors.${e.code}`);
    return msg === `errors.${e.code}` ? t("errors.server_error") : msg;
  }
  return t("errors.server_error");
}

/** Message for a planner error code (planner-specific first, then general API errors). */
export function plannerErrorMessage(t: Translator["t"], code: string): string {
  const specific = t(`planner.errors.${code}`);
  if (specific !== `planner.errors.${code}`) return specific;
  const general = t(`errors.${code}`);
  return general !== `errors.${code}` ? general : t("errors.server_error");
}
