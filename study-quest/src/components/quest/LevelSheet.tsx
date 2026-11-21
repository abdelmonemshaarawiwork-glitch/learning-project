"use client";

import { ArrowRight, Check, CircleCheck, Lock, LockOpen, SkipForward, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Sheet } from "@/components/ui/Dialog";
import { ProgressBar } from "@/components/ui/Progress";
import { actions, studyHref } from "@/lib/client/actions";
import { apiErrorMessage } from "@/lib/client/errors";
import {
  computeLevelStates,
  findLevel,
  gatingMissions,
  levelEstimatedMinutes,
  levelProgress,
  lockInfo,
} from "@/lib/domain/progression";
import type { Quest } from "@/lib/domain/types";
import { useCompleteMission } from "@/lib/hooks/useCompleteMission";
import { cn } from "@/lib/utils";
import { MissionMeta } from "./MissionMeta";

export function LevelSheet({ quest, levelId, onClose }: { quest: Quest; levelId: string | null; onClose: () => void }) {
  const { t, tp, formatMinutes, formatSeconds } = useI18n();
  const { complete, pending } = useCompleteMission();
  const [confirm, setConfirm] = useState<"unlock" | "skip" | null>(null);
  const ref = levelId ? findLevel(quest.stages, levelId) : null;
  const states = computeLevelStates(quest.stages);
  const state = ref ? states.get(ref.level.id)! : "locked";
  const locked = state === "locked";
  const editable = quest.status === "active" || quest.status === "completed";
  const lock = ref && locked ? lockInfo(quest.stages, ref.level.id) : null;
  const p = ref ? levelProgress(ref.level) : null;

  async function levelAction(action: "unlock" | "skip" | "unskip") {
    if (!ref) return;
    try {
      await actions.levelAction(quest.id, ref.level.id, action);
      if (action === "unlock") toast(t("map.unlocked"));
      if (action === "skip") toast(t("map.skippedToast"));
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
      throw e;
    }
  }

  return (
    <>
      <Sheet
        open={Boolean(ref)}
        onOpenChange={(o) => !o && onClose()}
        title={
          ref ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                <span>
                  {t("map.stage", { n: ref.stageIndex + 1 })} · {t("map.level", { n: ref.index + 1 })}
                </span>
                <Badge tone={state === "completed" ? "sage" : state === "locked" ? "neutral" : "olive"}>
                  {t(`map.state.${state}`)}
                </Badge>
                {ref.level.skipped && state !== "completed" ? <Badge tone="lavender">{t("map.skipped")}</Badge> : null}
              </div>
              <div className="mt-1.5 font-display text-[22px] leading-snug font-medium">{ref.level.title}</div>
            </div>
          ) : (
            ""
          )
        }
      >
        {ref && p ? (
          <div className="space-y-6">
            {ref.level.description ? <p className="text-[14.5px] leading-relaxed text-ink-2">{ref.level.description}</p> : null}

            <div>
              <div className="mb-1.5 flex justify-between text-[12.5px] text-ink-3">
                <span className="tabular">{t("quest.missionsProgress", { done: p.done, total: p.total })}</span>
                <span>{t("map.estimated", { time: formatMinutes(levelEstimatedMinutes(ref.level)) })}</span>
              </div>
              <ProgressBar value={p.percent} label={ref.level.title} />
            </div>

            {locked && lock ? (
              <div className="rounded-2xl border border-line bg-surface-2 p-4">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
                  <div className="text-sm text-ink-2">
                    {lock.blockingLevel ? (
                      <>
                        <p>{t("map.lockedHint", { title: lock.blockingLevel.title })}</p>
                        {lock.blockingRemaining > 0 ? <p className="mt-0.5 text-ink-3">{tp("map.lockedRemaining", lock.blockingRemaining)}</p> : null}
                      </>
                    ) : (
                      <p>{t("map.lockedFirstHint")}</p>
                    )}
                  </div>
                </div>
                {editable ? (
                  <div className="mt-3.5 flex flex-wrap gap-2 ps-7">
                    <Button size="sm" variant="secondary" onClick={() => setConfirm("unlock")}>
                      <LockOpen className="h-3.5 w-3.5" />
                      {t("map.unlockNow")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {ref.level.objectives.length > 0 ? (
              <section>
                <h4 className="mb-2 text-[13px] font-semibold text-ink">{t("map.objectives")}</h4>
                <ul className="space-y-1.5">
                  {ref.level.objectives.map((o) => (
                    <li key={o} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
                      {o}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {ref.level.buildsOn ? (
              <p className="text-[13px] text-ink-3">
                <span className="font-medium text-ink-2">{t("map.buildsOn")}:</span> {ref.level.buildsOn}
              </p>
            ) : null}

            <section>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">{t("map.missions")}</h4>
              <ul className="space-y-2">
                {ref.level.missions.map((m) => {
                  const done = m.status === "done";
                  const canAct = !locked && editable && !done && quest.status !== "paused";
                  return (
                    <li
                      key={m.id}
                      className={cn("rounded-2xl border p-3.5 transition-colors", done ? "border-transparent bg-sage-soft/60" : "border-line/80 bg-surface")}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            done ? "bg-sage text-white dark:text-sage-ink" : "border-2 border-line",
                          )}
                          aria-hidden
                        >
                          {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-[14.5px] leading-snug font-medium", done ? "text-ink-2" : "text-ink")}>{m.title}</div>
                          {m.description ? <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{m.description}</p> : null}
                          <MissionMeta mission={m} className="mt-1.5" />
                          {m.actualSeconds > 0 ? (
                            <div className="mt-1 text-[12px] text-ink-3">{t("map.trackedTime", { time: formatSeconds(m.actualSeconds) })}</div>
                          ) : null}
                          {!locked ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Link
                                href={studyHref(quest.id, m.id)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-sage-soft px-3 text-[13px] font-medium text-sage-strong hover:bg-[color-mix(in_oklab,var(--sage-soft),var(--sage)_14%)]"
                              >
                                {t("map.study")}
                                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                              </Link>
                              {canAct ? (
                                <Button size="sm" variant="secondary" loading={pending === m.id} onClick={() => complete(quest.id, m.id)}>
                                  <CircleCheck className="h-3.5 w-3.5" />
                                  {t("map.markDone")}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {editable && !locked && state !== "completed" && ref.index < states.size - 1 ? (
              <div className="border-t border-line pt-4">
                {ref.level.skipped ? (
                  <Button size="sm" variant="ghost" onClick={() => levelAction("unskip").catch(() => undefined)}>
                    <Undo2 className="h-3.5 w-3.5" />
                    {t("map.unskip")}
                  </Button>
                ) : gatingMissions(ref.level).some((m) => m.status !== "done") ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm("skip")}>
                    <SkipForward className="h-3.5 w-3.5" />
                    {t("map.skipLevel")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={confirm === "unlock"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("map.unlockTitle")}
        description={t("map.unlockBody")}
        confirmLabel={t("map.unlockNow")}
        onConfirm={() => levelAction("unlock")}
      />
      <ConfirmDialog
        open={confirm === "skip"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("map.skipTitle")}
        description={t("map.skipBody")}
        confirmLabel={t("map.skipLevel")}
        onConfirm={() => levelAction("skip")}
      />
    </>
  );
}
