"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { FullPageLoader } from "@/components/ui/Spinner";
import { ConfigMissing } from "./ConfigMissing";

/** Gate for every signed-in route: waits for auth + profile, redirects to login otherwise. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { configured, user, profile, profileError, signOut, takeSignOutTarget } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user === null) router.replace(takeSignOutTarget() ?? `/login?next=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname, takeSignOutTarget]);

  if (!configured) return <ConfigMissing />;
  if (user === undefined || user === null) return <FullPageLoader label={t("common.loading")} />;
  if (profileError && !profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <EmptyState
          title={t("common.somethingWrong")}
          body={profileError === "server_not_configured" ? t("errors.server_not_configured") : t("errors.profile_missing")}
          action={
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
              <Button variant="secondary" onClick={() => signOut()}>
                {t("nav.signOut")}
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  if (!profile) return <FullPageLoader label={t("shell.setupProfile")} />;
  return <>{children}</>;
}
