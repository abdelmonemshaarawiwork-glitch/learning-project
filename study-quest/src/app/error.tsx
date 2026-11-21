"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <EmptyState
        title={t("common.somethingWrong")}
        action={
          <div className="flex gap-2">
            <Button onClick={reset}>{t("common.retry")}</Button>
            <Button variant="secondary" onClick={() => (window.location.href = "/dashboard")}>
              {t("common.goDashboard")}
            </Button>
          </div>
        }
      />
    </div>
  );
}
