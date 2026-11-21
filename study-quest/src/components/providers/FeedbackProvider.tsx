"use client";

import { Award, Flag, Sparkles, Trophy } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { CompletionResult } from "@/lib/client/actions";
import type { MessageKey } from "@/lib/i18n/types";
import { useI18n } from "./I18nProvider";

interface Moment {
  icon: ReactNode;
  title: string;
  lines: string[];
}

interface FeedbackContextValue {
  /** Calm feedback after completing a mission; a small dialog only for milestones. */
  celebrate: (r: CompletionResult) => void;
  announceAchievements: (list: { id: string; xpReward: number }[]) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [moment, setMoment] = useState<Moment | null>(null);

  const achievementTitle = useCallback((id: string) => t(`achievements.items.${id}.title` as MessageKey), [t]);

  const announceAchievements = useCallback(
    (list: { id: string; xpReward: number }[]) => {
      for (const a of list) {
        toast(t("feedback.achievement", { title: achievementTitle(a.id) }), {
          description: t("achievements.reward", { xp: a.xpReward }),
          icon: <Award className="h-4 w-4 text-honey-strong" />,
        });
      }
    },
    [t, achievementTitle],
  );

  const celebrate = useCallback(
    (r: CompletionResult) => {
      const extras: string[] = [];
      if (r.streak.increased && r.streak.current > 1) extras.push(t("feedback.streakUp", { count: r.streak.current }));
      toast(t("feedback.missionDone", { xp: r.breakdown.mission }), {
        description: extras.join(" · ") || undefined,
        icon: <Sparkles className="h-4 w-4 text-sage" />,
      });
      announceAchievements(r.achievements);

      // Milestones get a quiet moment of their own.
      if (r.questCompleted) {
        setMoment({
          icon: <Trophy className="h-6 w-6" />,
          title: t("feedback.questDone"),
          lines: [t("achievements.reward", { xp: r.breakdown.quest + r.breakdown.stage + r.breakdown.level })],
        });
      } else if (r.levelCompleted || r.stageCompleted || r.playerLevel.after > r.playerLevel.before) {
        const lines: string[] = [];
        if (r.breakdown.level) lines.push(t("feedback.levelBonus", { xp: r.breakdown.level }));
        if (r.stageCompleted) lines.push(t("feedback.stageDone", { title: r.stageCompleted.title }));
        for (const u of r.unlockedLevels) lines.push(t("feedback.unlocked", { title: u.title }));
        if (r.playerLevel.after > r.playerLevel.before) lines.push(t("feedback.playerLevelUp", { level: r.playerLevel.after }));
        setMoment({
          icon: r.stageCompleted ? <Flag className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />,
          title: r.levelCompleted
            ? t("feedback.levelDone", { title: r.levelCompleted.title })
            : t("feedback.playerLevelUp", { level: r.playerLevel.after }),
          lines,
        });
      }
    },
    [t, announceAchievements],
  );

  const value = useMemo(() => ({ celebrate, announceAchievements }), [celebrate, announceAchievements]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Dialog
        open={moment !== null}
        onOpenChange={(o) => !o && setMoment(null)}
        title={
          <span className="flex flex-col items-center gap-3 pt-2 text-center">
            <span className="flex h-14 w-14 animate-pop items-center justify-center rounded-full bg-sage-soft text-sage-strong">
              {moment?.icon}
            </span>
            <span>{moment?.title}</span>
          </span>
        }
        footer={
          <Button className="w-full" onClick={() => setMoment(null)}>
            {t("common.continue")}
          </Button>
        }
      >
        <ul className="space-y-1.5 text-center text-sm text-ink-2">
          {moment?.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Dialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside FeedbackProvider");
  return ctx;
}
