"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";

/** Quick language switch for signed-out pages (signed-in users use Settings). */
export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const next = locale === "en" ? "ar" : "en";
  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(next)} aria-label={t("settings.language")}>
      <Languages className="h-4 w-4" />
      {t(`settings.languages.${next}`)}
    </Button>
  );
}
