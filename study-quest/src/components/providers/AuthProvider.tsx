"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { safeTimeZone } from "@/lib/domain/dates";
import { withStatDefaults } from "@/lib/domain/defaults";
import type { UserDoc, UserSettings } from "@/lib/domain/types";
import { clientAuth, clientDb, firebaseConfigured } from "@/lib/firebase/client";
import { useI18n } from "./I18nProvider";
import { useTheme } from "./ThemeProvider";

interface AuthContextValue {
  configured: boolean;
  /** undefined while Firebase restores the session */
  user: User | null | undefined;
  profile: UserDoc | null;
  settings: UserSettings | null;
  profileLoading: boolean;
  profileError: string | null;
  /** Sign out; the signed-in area then redirects to `redirectTo` instead of login?next=… */
  signOut: (redirectTo?: string) => Promise<void>;
  /** Where to go after an explicit sign-out (read once by the auth gate). */
  takeSignOutTarget: () => string | null;
  /** Ensure the server-side profile exists (called after sign-up / sign-in). */
  bootstrap: (displayName?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function deviceTimeZone(): string {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "UTC";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useI18n();
  const { preference, setPreference } = useTheme();
  const [user, setUser] = useState<User | null | undefined>(firebaseConfigured ? undefined : null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const bootstrapping = useRef<Promise<void> | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(clientAuth(), (u) => setUser(u));
  }, []);

  const bootstrap = useCallback(async (displayName?: string) => {
    if (!bootstrapping.current) {
      bootstrapping.current = api("/api/profile/bootstrap", {
        method: "POST",
        body: { displayName, timezone: deviceTimeZone(), locale: localeRef.current },
      })
        .then(() => undefined)
        .finally(() => {
          bootstrapping.current = null;
        });
    }
    return bootstrapping.current;
  }, []);

  // Live profile + settings for the signed-in user.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setSettings(null);
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    const db = clientDb();
    let triedBootstrap = false;
    const unsubUser = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          if (!triedBootstrap) {
            triedBootstrap = true;
            bootstrap(user.displayName ?? undefined).catch((e) => {
              setProfileError((e as Error).message || "bootstrap_failed");
              setProfileLoading(false);
            });
          }
          return;
        }
        setProfile(withStatDefaults(snap.data() as UserDoc));
        setProfileLoading(false);
      },
      (err) => {
        setProfileError(err.code ?? "read_failed");
        setProfileLoading(false);
      },
    );
    const unsubSettings = onSnapshot(
      doc(db, "users", user.uid, "settings", "preferences"),
      (snap) => setSettings(snap.exists() ? (snap.data() as UserSettings) : null),
      () => undefined,
    );
    return () => {
      unsubUser();
      unsubSettings();
    };
  }, [user, bootstrap]);

  // Apply saved preferences on this device (follows the account across devices).
  useEffect(() => {
    if (!settings) return;
    if (settings.locale && settings.locale !== locale) setLocale(settings.locale);
    if (settings.theme && settings.theme !== preference) setPreference(settings.theme);
    // Only react to saved settings changing, not to local toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.locale, settings?.theme]);

  const signOutTarget = useRef<string | null>(null);
  const signOut = useCallback(async (redirectTo = "/login") => {
    if (!firebaseConfigured) return;
    signOutTarget.current = redirectTo;
    await fbSignOut(clientAuth());
  }, []);
  const takeSignOutTarget = useCallback(() => {
    const t = signOutTarget.current;
    signOutTarget.current = null;
    return t;
  }, []);

  const value = useMemo(
    () => ({ configured: firebaseConfigured, user, profile, settings, profileLoading, profileError, signOut, takeSignOutTarget, bootstrap }),
    [user, profile, settings, profileLoading, profileError, signOut, takeSignOutTarget, bootstrap],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** The signed-in user's data; only valid inside the protected app shell. */
export function useAccount() {
  const { user, profile, settings } = useAuth();
  if (!user || !profile) throw new Error("useAccount used outside a signed-in area");
  return { user, profile, settings };
}
