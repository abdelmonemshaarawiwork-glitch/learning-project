"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/providers/I18nProvider";
import { EmptyState } from "@/components/ui/Misc";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={<Compass />}
        title={t("common.notFound")}
        action={
          <Link href="/dashboard" className="text-sm font-medium text-sage-strong hover:underline">
            {t("common.goDashboard")}
          </Link>
        }
      />
    </div>
  );
}
