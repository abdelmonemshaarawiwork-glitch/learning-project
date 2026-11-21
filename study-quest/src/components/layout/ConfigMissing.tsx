"use client";

import { Settings2 } from "lucide-react";
import { useI18n } from "@/components/providers/I18nProvider";
import { EmptyState } from "@/components/ui/Misc";

export function ConfigMissing() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState icon={<Settings2 />} title={t("shell.configTitle")} body={t("shell.configBody")} />
    </div>
  );
}
