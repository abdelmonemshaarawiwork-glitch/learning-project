"use client";

import { Flame, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { useAccount } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { effectiveStreak } from "@/lib/domain/streak";
import { playerLevelFromXp } from "@/lib/domain/xp";
import { useToday } from "@/lib/hooks/data";
import { cn } from "@/lib/utils";
import { isActive, NAV } from "./nav";
import { PlayerMini } from "./PlayerMini";
import { ReminderScheduler } from "./ReminderScheduler";
import { UserMenu } from "./UserMenu";

function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-[248px] flex-col border-e border-line/80 bg-canvas px-4 py-5 lg:flex">
      <Link href="/dashboard" className="px-2" aria-label={t("app.name")}>
        <Logo label={t("app.name")} />
      </Link>
      <Link
        href="/planner"
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-sage-strong px-4 text-sm font-medium text-white shadow-soft transition-colors hover:bg-[color-mix(in_oklab,var(--sage-strong),black_8%)] dark:text-sage-ink"
      >
        <Plus className="h-4 w-4" />
        {t("nav.newQuest")}
      </Link>
      <nav className="mt-6 flex flex-col gap-0.5" aria-label={t("nav.menu")}>
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-[11px] px-3 text-sm transition-colors",
                active ? "bg-surface font-medium text-ink shadow-soft" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-sage-strong" : "text-ink-3")} />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <PlayerMini />
        <UserMenu />
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { t, formatNumber } = useI18n();
  const { profile } = useAccount();
  const today = useToday();
  const level = playerLevelFromXp(profile.totalXp).level;
  const streak = effectiveStreak(profile, today);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-canvas/90 px-4 backdrop-blur-md lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2" aria-label={t("app.name")}>
        <LogoMark className="h-7 w-7" />
        <span className="font-display text-[17px] font-medium">{t("app.name")}</span>
      </Link>
      <div className="flex items-center gap-1.5">
        <span className="tabular inline-flex h-7 items-center rounded-full bg-sage-soft px-2.5 text-[12px] font-semibold text-sage-strong">
          {t("shell.level", { level })}
        </span>
        <span className="tabular inline-flex h-7 items-center gap-1 rounded-full bg-honey px-2.5 text-[12px] font-semibold text-honey-strong" aria-label={t("dashboard.currentStreak")}>
          <Flame className="h-3.5 w-3.5" />
          {formatNumber(streak)}
        </span>
        <UserMenu compact />
      </div>
    </header>
  );
}

function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("nav.menu")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {NAV.filter((n) => n.mobile).map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[60px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
                  active ? "text-sage-strong" : "text-ink-3",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-sage-soft")}>
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <span className="max-w-full truncate px-1">{t(item.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-sm shadow-float focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t("nav.skipToContent")}
      </a>
      <Sidebar />
      <MobileTopBar />
      <div className="lg:ps-[248px]">
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <MobileTabBar />
      <ReminderScheduler />
    </div>
  );
}
