import { Award, ChartColumn, House, Map, Settings, Sparkles, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/types";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  mobile: boolean;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: House, mobile: true },
  { href: "/quests", label: "nav.quests", icon: Map, mobile: true },
  { href: "/planner", label: "nav.planner", icon: Sparkles, mobile: true },
  { href: "/achievements", label: "nav.achievements", icon: Award, mobile: true },
  { href: "/statistics", label: "nav.statistics", icon: ChartColumn, mobile: true },
  { href: "/settings", label: "nav.settings", icon: Settings, mobile: false },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}
