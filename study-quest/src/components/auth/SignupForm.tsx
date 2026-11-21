"use client";

import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { authErrorKey, EMAIL_RE } from "@/lib/client/authErrors";
import { clientAuth } from "@/lib/firebase/client";
import { AuthLayout, Divider } from "./AuthLayout";
import { GoogleButton } from "./GoogleButton";

export function SignupForm() {
  const { t } = useI18n();
  const { bootstrap } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("auth.errors.nameRequired");
    if (!EMAIL_RE.test(email.trim())) errs.email = t("auth.errors.invalidEmail");
    if (password.length < 8) errs.password = t("auth.errors.passwordShort");
    if (confirm !== password) errs.confirm = t("auth.errors.passwordMismatch");
    setFe(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(clientAuth(), email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await bootstrap(name.trim()).catch(() => undefined);
    } catch (err) {
      setError(t(authErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("auth.createAccount")} subtitle={t("auth.signupSubtitle")}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label={t("auth.name")} htmlFor="name" error={fe.name}>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(fe.name)} maxLength={60} />
        </Field>
        <Field label={t("auth.email")} htmlFor="email" error={fe.email}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(fe.email)} />
        </Field>
        <Field label={t("auth.password")} htmlFor="password" error={fe.password} hint={t("auth.passwordHint")}>
          <Input id="password" type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(fe.password)} />
        </Field>
        <Field label={t("auth.confirmPassword")} htmlFor="confirm" error={fe.confirm}>
          <Input id="confirm" type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(fe.confirm)} />
        </Field>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {t("auth.signup")}
        </Button>
      </form>
      <Divider label={t("common.or")} />
      <GoogleButton onError={setError} />
      <p className="mt-8 text-center text-sm text-ink-2">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-medium text-sage-strong hover:underline">
          {t("auth.login")}
        </Link>
      </p>
    </AuthLayout>
  );
}
