"use client";

import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { authErrorKey } from "@/lib/client/authErrors";
import { clientAuth } from "@/lib/firebase/client";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2H12v4h6c-.2 1.3-1 2.4-2.2 3.1v2.6h3.5c2.1-1.9 3.3-4.7 3.3-7.7z" />
      <path fill="#34A853" d="M12 23c3 0 5.4-1 7.3-2.7l-3.5-2.6c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.7C3.9 20.5 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.7 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.7z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.1-3.1C17.4 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.7C6.6 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}

export function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const { t } = useI18n();
  const { bootstrap } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          const cred = await signInWithPopup(clientAuth(), provider);
          await bootstrap(cred.user.displayName ?? undefined).catch(() => undefined);
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === "auth/popup-blocked") {
            await signInWithRedirect(clientAuth(), new GoogleAuthProvider());
            return;
          }
          onError(t(authErrorKey(e)));
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy ? <GoogleIcon /> : null}
      {t("auth.google")}
    </Button>
  );
}
