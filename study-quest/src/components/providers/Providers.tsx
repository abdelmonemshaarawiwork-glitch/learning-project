"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import type { Locale, ThemePreference } from "@/lib/domain/types";
import { AuthProvider } from "./AuthProvider";
import { FeedbackProvider } from "./FeedbackProvider";
import { I18nProvider } from "./I18nProvider";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-center"
      gap={8}
      toastOptions={{
        classNames: {
          toast: "!rounded-[14px] !border !border-line !bg-surface !text-ink !shadow-float !font-sans",
          description: "!text-ink-2",
        },
      }}
    />
  );
}

export function Providers({
  initialLocale,
  initialTheme,
  children,
}: {
  initialLocale: Locale;
  initialTheme: ThemePreference;
  children: ReactNode;
}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <ThemeProvider initialPreference={initialTheme}>
        <AuthProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
        </AuthProvider>
        <ThemedToaster />
      </ThemeProvider>
    </I18nProvider>
  );
}
