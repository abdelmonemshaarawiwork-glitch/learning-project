"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { authErrorKey, EMAIL_RE } from "@/lib/client/authErrors";
import { clientAuth } from "@/lib/firebase/client";
import { AuthLayout } from "./AuthLayout";

export function ResetForm() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError(t("auth.errors.invalidEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      clientAuth().languageCode = locale;
      await sendPasswordResetEmail(clientAuth(), email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Don't reveal whether an account exists.
      if (code === "auth/user-not-found") setSent(true);
      else setError(t(authErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("auth.resetTitle")} subtitle={t("auth.resetSubtitle")}>
      {sent ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-sage-soft p-4 text-sm text-sage-strong">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t("auth.resetSent")}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label={t("auth.email")} htmlFor="email" error={error ?? undefined}>
            <Input id="email" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("auth.sendReset")}
          </Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link href="/login" className="font-medium text-sage-strong hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </AuthLayout>
  );
}
