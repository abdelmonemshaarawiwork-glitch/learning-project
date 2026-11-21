"use client";

import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAccount, useAuth } from "@/components/providers/AuthProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { cn } from "@/lib/utils";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function UserMenu({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  const { profile } = useAccount();
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-xl text-start outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-sage",
          compact ? "p-1" : "w-full p-2",
        )}
        aria-label={profile.displayName}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-beige text-[12px] font-semibold text-ink-2">
          {initials(profile.displayName)}
        </span>
        {!compact ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{profile.displayName}</span>
            <span className="block truncate text-[12px] text-ink-3" dir="ltr">
              {profile.email}
            </span>
          </span>
        ) : null}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"}>
        <MenuItem icon={<Settings />} onSelect={() => router.push("/settings")}>
          {t("nav.settings")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<LogOut />}
          onSelect={() => signOut("/login")}
        >
          {t("nav.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
