import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers/Providers";
import { themeBootScript } from "@/components/providers/ThemeProvider";
import type { ThemePreference } from "@/lib/domain/types";
import { dirFor, isLocale, LOCALE_COOKIE, THEME_COOKIE } from "@/lib/i18n/core";

export const metadata: Metadata = {
  title: { default: "Study Quest", template: "%s · Study Quest" },
  description: "Turn any study topic into a calm, structured journey of stages, levels and missions.",
  applicationName: "Study Quest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#191b18" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const rawLocale = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const rawTheme = jar.get(THEME_COOKIE)?.value;
  const theme: ThemePreference = rawTheme === "dark" || rawTheme === "system" ? rawTheme : "light";
  return (
    <html lang={locale} dir={dirFor(locale)} data-theme={theme === "dark" ? "dark" : "light"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers initialLocale={locale} initialTheme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
