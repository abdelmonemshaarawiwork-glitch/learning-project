"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { authErrorKey, EMAIL_RE } from "@/lib/client/authErrors";
import { clientAuth } from "@/lib/firebase/client";
import { AuthLayout, Divider } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";

export function LoginForm() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErrors = {};
    if (!EMAIL_RE.test(email.trim())) fe.email = t("auth.errors.invalidEmail");
    if (!password) fe.password = t("auth.errors.passwordShort");
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(clientAuth(), email.trim(), password);
    } catch (err) {
      setError(t(authErrorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  const next = params.get("next");
  return (
    <AuthLayout title={t("auth.welcomeBack")} subtitle={t("auth.loginSubtitle")}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t("auth.email")} htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>
        <div className="flex justify-end">
          <Link href="/reset-password" className="text-[13px] text-sage-strong hover:underline">
            {t("auth.forgot")}
          </Link>
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {t("auth.login")}
        </Button>
      </form>
      <Divider label={t("common.or")} />
      <GoogleButton onError={setError} />
      <p className="mt-8 text-center text-sm text-ink-2">
        {t("auth.noAccount")}{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-medium text-sage-strong hover:underline">
          {t("auth.signup")}
        </Link>
      </p>
    </AuthLayout>
  );
}
