"use client";

import { Map as MapIcon, PenLine, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/Misc";
import type { QuestStatus } from "@/lib/domain/types";
import { useQuests } from "@/lib/hooks/data";
import { QuestCard } from "./QuestCard";
import { QuestMenu } from "./QuestMenu";

const TABS: QuestStatus[] = ["active", "paused", "completed", "archived"];
const EMPTY: Record<QuestStatus, "quests.emptyActive" | "quests.emptyPaused" | "quests.emptyCompleted" | "quests.emptyArchived"> = {
  active: "quests.emptyActive",
  paused: "quests.emptyPaused",
  completed: "quests.emptyCompleted",
  archived: "quests.emptyArchived",
};

export function QuestsView() {
  const { t } = useI18n();
  const { data: quests, loading } = useQuests();
  const [tab, setTab] = useState<QuestStatus>("active");
  const [q, setQ] = useState("");
  const counts = useMemo(() => Object.fromEntries(TABS.map((s) => [s, quests.filter((x) => x.status === s).length])), [quests]);
  const shown = quests
    .filter((x) => x.status === tab)
    .filter((x) => !q.trim() || (x.title + " " + x.description).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("quests.title")}
        subtitle={t("quests.subtitle")}
        actions={
          <>
            <Link href="/quests/new" className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-line bg-surface px-4 text-sm font-medium text-ink shadow-soft hover:bg-surface-2">
              <PenLine className="h-4 w-4" />
              {t("quests.newManual")}
            </Link>
            <Link href="/planner" className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-sage-strong px-4 text-sm font-medium text-white shadow-soft hover:bg-[color-mix(in_oklab,var(--sage-strong),black_8%)] dark:text-sage-ink">
              <Sparkles className="h-4 w-4" />
              {t("quests.newWithAi")}
            </Link>
          </>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label={t("quests.title")}
          value={tab}
          onChange={setTab}
          options={TABS.map((s) => ({ value: s, label: t(`quests.tabs.${s}`), count: counts[s] }))}
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("quests.search")} aria-label={t("quests.search")} className="h-10 ps-9 text-sm" />
        </div>
      </div>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<MapIcon />}
          title={q.trim() ? t("quests.noResults") : t(EMPTY[tab])}
          action={
            tab === "active" && !q.trim() ? (
              <Link href="/planner">
                <Button>
                  <Sparkles className="h-4 w-4" />
                  {t("quests.newWithAi")}
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((quest) => (
            <QuestCard key={quest.id} quest={quest} menu={<QuestMenu quest={quest} />} />
          ))}
        </div>
      )}
    </div>
  );
}
