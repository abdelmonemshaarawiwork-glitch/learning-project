"use client";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { deviceTimeZone, useAccount, useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Switch } from "@/components/ui/Field";
import { PageHeader, Segmented } from "@/components/ui/Misc";
import { actions } from "@/lib/client/actions";
import { api, ApiClientError } from "@/lib/client/api";
import { authErrorKey } from "@/lib/client/authErrors";
import { apiErrorMessage } from "@/lib/client/errors";
import { defaultSettings } from "@/lib/domain/defaults";
import type { Locale, NotificationPreferences, ThemePreference, UserSettings } from "@/lib/domain/types";
import { clientAuth } from "@/lib/firebase/client";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="grid gap-5 md:grid-cols-[220px_1fr] md:gap-8">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {hint ? <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{hint}</p> : null}
        </div>
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </Card>
  );
}

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export function SettingsView() {
  const { t, setLocale } = useI18n();
  const { setPreference } = useTheme();
  const { profile, user } = useAccount();
  const { settings: saved, signOut } = useAuth();
  const settings: UserSettings = saved ?? defaultSettings(profile.timezone, profile.locale, 0);
  const [name, setName] = useState(profile.displayName);
  const [savingName, setSavingName] = useState(false);
  const [goalMissions, setGoalMissions] = useState(String(settings.dailyGoalMissions));
  const [goalMinutes, setGoalMinutes] = useState(String(settings.dailyGoalMinutes));
  const [sessionMinutes, setSessionMinutes] = useState(String(settings.preferredSessionMinutes));
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [exporting, setExporting] = useState(false);
  const zones = useMemo(timeZones, []);
  const device = useMemo(deviceTimeZone, []);
  const isPasswordUser = user.providerData.some((p) => p.providerId === "password");
  const synced = useRef(false);

  useEffect(() => {
    if (saved && !synced.current) {
      synced.current = true;
      setGoalMissions(String(saved.dailyGoalMissions));
      setGoalMinutes(String(saved.dailyGoalMinutes));
      setSessionMinutes(String(saved.preferredSessionMinutes));
    }
  }, [saved]);

  useEffect(() => {
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);

  async function patch(p: Partial<Omit<UserSettings, "notifications" | "updatedAt">> & { notifications?: Partial<NotificationPreferences> }) {
    try {
      await actions.updateSettings(p);
      toast(t("settings.settingsSaved"), { id: "settings-saved", duration: 1500 });
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
    }
  }

  function numberPatch(raw: string, min: number, max: number, key: "dailyGoalMissions" | "dailyGoalMinutes" | "preferredSessionMinutes", reset: (v: string) => void) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < min || n > max) {
      reset(String(settings[key]));
      return;
    }
    if (n !== settings[key]) patch({ [key]: n });
  }

  async function enableBrowser(on: boolean) {
    if (on && permission !== "granted" && permission !== "unsupported") {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
    }
    patch({ notifications: { browserEnabled: on } });
  }

  async function reauth(password?: string) {
    const u = clientAuth().currentUser!;
    if (isPasswordUser) {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? "", password ?? ""));
    } else {
      await reauthenticateWithPopup(u, new GoogleAuthProvider());
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const token = await clientAuth().currentUser!.getIdToken();
      const res = await fetch("/api/account/export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new ApiClientError("server_error", res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `study-quest-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
    } finally {
      setExporting(false);
    }
  }

  const n = settings.notifications;

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <Section title={t("settings.profile")}>
        <Field label={t("settings.displayName")} htmlFor="s-name">
          <div className="flex gap-2">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} dir="auto" />
            <Button
              variant="secondary"
              loading={savingName}
              disabled={!name.trim() || name.trim() === profile.displayName}
              onClick={async () => {
                setSavingName(true);
                try {
                  await actions.updateProfile(name.trim());
                  toast(t("settings.profileSaved"));
                } catch (e) {
                  toast.error(apiErrorMessage(t, e));
                } finally {
                  setSavingName(false);
                }
              }}
            >
              {t("common.save")}
            </Button>
          </div>
        </Field>
        <Field label={t("settings.email")} htmlFor="s-email">
          <Input id="s-email" value={profile.email} readOnly disabled dir="ltr" />
        </Field>
      </Section>

      <Section title={t("settings.appearance")}>
        <Field label={t("settings.theme")}>
          <Segmented<ThemePreference>
            label={t("settings.theme")}
            value={settings.theme}
            onChange={(v) => {
              setPreference(v);
              patch({ theme: v });
            }}
            options={(["light", "dark", "system"] as const).map((v) => ({ value: v, label: t(`settings.themes.${v}`) }))}
          />
        </Field>
        <Field label={t("settings.language")}>
          <Segmented<Locale>
            label={t("settings.language")}
            value={settings.locale}
            onChange={(v) => {
              setLocale(v);
              patch({ locale: v });
            }}
            options={(["en", "ar"] as const).map((v) => ({ value: v, label: t(`settings.languages.${v}`) }))}
          />
        </Field>
      </Section>

      <Section title={t("settings.goals")} hint={t("settings.timezoneHint")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("settings.dailyGoalMissions")} htmlFor="s-gm">
            <Input
              id="s-gm"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={goalMissions}
              onChange={(e) => setGoalMissions(e.target.value)}
              onBlur={() => numberPatch(goalMissions, 1, 20, "dailyGoalMissions", setGoalMissions)}
            />
          </Field>
          <Field label={t("settings.dailyGoalMinutes")} htmlFor="s-gmin">
            <Input
              id="s-gmin"
              type="number"
              inputMode="numeric"
              min={5}
              max={600}
              step={5}
              value={goalMinutes}
              onChange={(e) => setGoalMinutes(e.target.value)}
              onBlur={() => numberPatch(goalMinutes, 5, 600, "dailyGoalMinutes", setGoalMinutes)}
            />
          </Field>
          <Field label={t("settings.preferredSession")} htmlFor="s-sess">
            <Input
              id="s-sess"
              type="number"
              inputMode="numeric"
              min={5}
              max={180}
              step={5}
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(e.target.value)}
              onBlur={() => numberPatch(sessionMinutes, 5, 180, "preferredSessionMinutes", setSessionMinutes)}
            />
          </Field>
        </div>
        <Field label={t("settings.timezone")} htmlFor="s-tz">
          <Select id="s-tz" value={settings.timezone} onChange={(e) => patch({ timezone: e.target.value })}>
            {(zones.includes(settings.timezone) ? zones : [settings.timezone, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        {device !== settings.timezone ? (
          <Button variant="link" onClick={() => patch({ timezone: device })}>
            {t("settings.detectTimezone", { tz: device })}
          </Button>
        ) : null}
      </Section>

      <Section title={t("settings.notifications")} hint={t("settings.notificationsHint")}>
        <Switch
          checked={n.browserEnabled && permission === "granted"}
          onChange={enableBrowser}
          disabled={permission === "unsupported" || permission === "denied"}
          label={t("settings.browserNotifications")}
          description={
            permission === "unsupported"
              ? t("settings.permissionUnsupported")
              : permission === "denied"
                ? t("settings.permissionDenied")
                : t("settings.browserNotificationsHint")
          }
        />
        <div className="space-y-2 border-t border-line pt-4">
          <Switch checked={n.dailyReminder} onChange={(v) => patch({ notifications: { dailyReminder: v } })} label={t("settings.dailyReminder")} />
          <Switch checked={n.goalReminder} onChange={(v) => patch({ notifications: { goalReminder: v } })} label={t("settings.goalReminder")} />
          <Switch checked={n.streakReminder} onChange={(v) => patch({ notifications: { streakReminder: v } })} label={t("settings.streakReminder")} />
          <Switch checked={n.deadlineReminder} onChange={(v) => patch({ notifications: { deadlineReminder: v } })} label={t("settings.deadlineReminder")} />
        </div>
        <Field label={t("settings.reminderTime")} htmlFor="s-rt" className="max-w-48">
          <Input
            id="s-rt"
            type="time"
            defaultValue={n.reminderTime}
            key={n.reminderTime}
            onBlur={(e) => {
              if (/^\d{2}:\d{2}$/.test(e.target.value) && e.target.value !== n.reminderTime) patch({ notifications: { reminderTime: e.target.value } });
            }}
          />
        </Field>
      </Section>

      <Section title={t("settings.account")}>
        {isPasswordUser ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setPwError(null);
              if (newPw.length < 8) {
                setPwError(t("auth.errors.passwordShort"));
                return;
              }
              setPwBusy(true);
              try {
                await reauth(currentPw);
                await updatePassword(clientAuth().currentUser!, newPw);
                setCurrentPw("");
                setNewPw("");
                toast(t("settings.passwordChanged"));
              } catch (err) {
                setPwError(t(authErrorKey(err)));
              } finally {
                setPwBusy(false);
              }
            }}
          >
            <h3 className="text-sm font-medium text-ink">{t("settings.changePassword")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="password" autoComplete="current-password" placeholder={t("settings.currentPassword")} aria-label={t("settings.currentPassword")} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} dir="ltr" />
              <Input type="password" autoComplete="new-password" placeholder={t("settings.newPassword")} aria-label={t("settings.newPassword")} value={newPw} onChange={(e) => setNewPw(e.target.value)} dir="ltr" />
            </div>
            {pwError ? <p className="text-[13px] text-danger" role="alert">{pwError}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="secondary" loading={pwBusy} disabled={!currentPw || !newPw}>
                {t("settings.changePassword")}
              </Button>
              <Button
                variant="link"
                onClick={async () => {
                  try {
                    await sendPasswordResetEmail(clientAuth(), profile.email);
                    toast(t("auth.resetSent"));
                  } catch (err) {
                    toast.error(t(authErrorKey(err)));
                  }
                }}
              >
                {t("settings.sendResetInstead")}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-ink-2">{t("settings.googleAccount")}</p>
        )}
        <div className="border-t border-line pt-4">
          <Button
            variant="ghost"
            onClick={() => signOut("/login")}
          >
            {t("nav.signOut")}
          </Button>
        </div>
      </Section>

      <Section title={t("settings.data")}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">{t("settings.export")}</h3>
            <p className="text-[13px] text-ink-3">{t("settings.exportHint")}</p>
          </div>
          <Button variant="secondary" loading={exporting} onClick={exportData}>
            <Download className="h-4 w-4" />
            {t("settings.export")}
          </Button>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">{t("settings.reset")}</h3>
            <p className="text-[13px] text-ink-3">{t("settings.resetHint")}</p>
          </div>
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            {t("settings.reset")}
          </Button>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-danger">{t("settings.deleteAccount")}</h3>
            <p className="text-[13px] text-ink-3">{t("settings.deleteHint")}</p>
          </div>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            {t("settings.deleteAccount")}
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("settings.reset")}
        description={t("settings.resetHint")}
        confirmLabel={t("settings.reset")}
        tone="danger"
        requireText="RESET"
        requireLabel={t("settings.resetConfirm")}
        onConfirm={async () => {
          try {
            await api("/api/account/reset", { method: "POST", body: { confirm: "RESET" } });
            toast(t("settings.resetDone"));
          } catch (e) {
            toast.error(apiErrorMessage(t, e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("settings.deleteAccount")}
        description={t("settings.deleteHint")}
        confirmLabel={t("settings.deleteAccount")}
        tone="danger"
        requireText="DELETE"
        requireLabel={t("settings.deleteConfirm")}
        onConfirm={async () => {
          try {
            await reauth(deletePw);
            await api("/api/account", { method: "DELETE", body: { confirm: "DELETE" } });
            toast(t("settings.deleted"));
            await signOut("/").catch(() => undefined);
          } catch (e) {
            const code = (e as { code?: string }).code;
            toast.error(code?.startsWith("auth/") ? t(authErrorKey(e)) : apiErrorMessage(t, e));
            throw e;
          }
        }}
      >
        <div className="mb-4">
          {isPasswordUser ? (
            <Field label={t("settings.reauth")} htmlFor="del-pw">
              <Input id="del-pw" type="password" autoComplete="current-password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} dir="ltr" />
            </Field>
          ) : (
            <p className="text-sm text-ink-2">{t("settings.reauthGoogle")}</p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
