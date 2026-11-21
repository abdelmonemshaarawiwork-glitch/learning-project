"use client";

import { ArrowLeft, ArrowRight, CircleCheck, CircleStop, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LogoMark } from "@/components/brand/Logo";
import { useAccount } from "@/components/providers/AuthProvider";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { MissionMeta } from "@/components/quest/MissionMeta";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/Misc";
import { actions, questHref, studyHref } from "@/lib/client/actions";
import { apiErrorMessage } from "@/lib/client/errors";
import { computeLevelStates, findMission } from "@/lib/domain/progression";
import { useQuest } from "@/lib/hooks/data";
import { useCompleteMission } from "@/lib/hooks/useCompleteMission";
import { useSessionTimer } from "@/lib/hooks/useSessionTimer";
import { cn } from "@/lib/utils";
import { NotesEditor } from "./NotesEditor";

function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const COUNTDOWNS = [10, 15, 20, 25, 30, 40, 45, 50, 60, 90];

export function SessionView({ questId, missionId }: { questId: string; missionId: string }) {
  const { t, formatSeconds, formatMinutes } = useI18n();
  const router = useRouter();
  const { user, settings } = useAccount();
  const { announceAchievements } = useFeedback();
  const { complete, pending } = useCompleteMission();
  const { data: quest, loading } = useQuest(questId);
  const found = quest ? findMission(quest.stages, missionId) : null;
  const defaultCountdown = found?.mission.estimatedMinutes ?? settings?.preferredSessionMinutes ?? 25;
  const timer = useSessionTimer(user.uid, questId, missionId, defaultCountdown);
  const [saving, setSaving] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const notifiedTimeUp = useRef(false);

  // Default the countdown to the mission estimate once known (if no session yet).
  const initCountdown = useRef(false);
  useEffect(() => {
    if (found && !timer.session && !initCountdown.current) {
      initCountdown.current = true;
      timer.changeCountdown(Math.min(180, found.mission.estimatedMinutes));
    }
  }, [found, timer]);

  useEffect(() => {
    if (timer.restored) toast(t("session.restored"));
  }, [timer.restored, t]);

  useEffect(() => {
    if (!timer.running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [timer.running]);

  const countdownSeconds = timer.countdownMinutes * 60;
  const remaining = countdownSeconds - timer.elapsedSeconds;
  const timeUp = timer.mode === "countdown" && timer.session !== null && remaining <= 0;

  useEffect(() => {
    if (!timeUp || notifiedTimeUp.current) return;
    notifiedTimeUp.current = true;
    if (settings?.notifications.browserEnabled && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      try {
        new Notification(t("session.countdown"), { body: t("session.timeUp"), tag: "sq-timeup" });
      } catch {
        /* ignore */
      }
    }
  }, [timeUp, settings, t]);

  const levelState = useMemo(() => (quest && found ? computeLevelStates(quest.stages).get(found.level.id) : undefined), [quest, found]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-56" />
      </div>
    );
  }
  if (!quest || !found) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <EmptyState
          title={t("errors.mission_not_found")}
          action={
            <Link href="/dashboard">
              <Button variant="secondary">{t("common.goDashboard")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { mission, level, ref } = found;
  const done = mission.status === "done";
  const locked = levelState === "locked";
  const paused = quest.status === "paused" || quest.status === "archived";
  const canComplete = !done && !locked && !paused;
  const next = quest.summary.nextMissionId && quest.summary.nextMissionId !== missionId ? findMission(quest.stages, quest.summary.nextMissionId) : null;

  async function record(data: ReturnType<typeof timer.stop>) {
    if (!data) return;
    if (data.activeSeconds < 30) {
      toast(t("session.sessionTooShort"));
      return;
    }
    try {
      const r = await actions.recordSession(data);
      if (r.recorded) toast(t("session.sessionSaved", { time: formatSeconds(r.activeSeconds) }));
      announceAchievements(r.achievements);
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
    }
  }

  async function finish() {
    setSaving(true);
    await record(timer.stop());
    setSaving(false);
    notifiedTimeUp.current = false;
  }

  async function completeMission() {
    setSaving(true);
    if (timer.session) await record(timer.stop());
    setSaving(false);
    const r = await complete(questId, missionId);
    if (r) setJustCompleted(true);
  }

  async function startSession() {
    if (timer.otherSession) await record(timer.takeOther());
    notifiedTimeUp.current = false;
    timer.start();
  }

  function exit() {
    if (timer.running && !window.confirm(t("session.leaveRunning"))) return;
    if (timer.running) timer.pause();
    router.push(questHref(questId));
  }

  const display = timer.mode === "countdown" ? (timer.session ? (remaining > 0 ? clock(remaining) : clock(-remaining)) : clock(countdownSeconds)) : clock(timer.elapsedSeconds);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={exit} className="-ms-2">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          <span className="hidden sm:inline">{t("session.exit")}</span>
        </Button>
        <nav aria-label="breadcrumb" className="min-w-0 flex-1 truncate text-center text-[12.5px] text-ink-3">
          {quest.title} <span aria-hidden>›</span> {t("map.level", { n: ref.index + 1 })}: {level.title}
        </nav>
        <LogoMark className="h-7 w-7 opacity-80" />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <div className="animate-rise pt-4 text-center sm:pt-8">
          <h1 className="font-display text-[28px] leading-tight font-medium text-ink sm:text-[36px]">{mission.title}</h1>
          <MissionMeta mission={mission} className="mt-3 justify-center" />
          {mission.description ? <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">{mission.description}</p> : null}
        </div>

        {paused ? (
          <p className="mt-6 rounded-2xl bg-honey px-4 py-3 text-center text-sm text-honey-strong">{t("session.pausedQuest")}</p>
        ) : locked ? (
          <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2">{t("session.lockedMission")}</p>
        ) : done && !justCompleted ? (
          <p className="mt-6 rounded-2xl bg-sage-soft px-4 py-3 text-center text-sm text-sage-strong">{t("session.alreadyDone")}</p>
        ) : null}

        {timer.otherSession && !timer.session ? (
          <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-3 text-center text-[13px] text-ink-2">
            {t("session.otherRunning")}{" "}
            <Link href={studyHref(timer.otherSession.questId, timer.otherSession.missionId)} className="font-medium text-sage-strong hover:underline">
              {t("session.openOther")}
            </Link>
          </p>
        ) : null}

        {justCompleted ? (
          <Card className="mt-8 animate-pop p-6 text-center sm:p-8">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage-soft text-sage-strong">
              <CircleCheck className="h-7 w-7" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-medium">{t("session.completed")}</h2>
            {next ? (
              <div className="mx-auto mt-6 max-w-md rounded-2xl bg-surface-2 p-4 text-start">
                <div className="text-[12px] font-medium text-ink-3">{t("session.nextUp")}</div>
                <div className="mt-1 text-[15px] font-medium text-ink">{next.mission.title}</div>
                <MissionMeta mission={next.mission} className="mt-1.5" />
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-2">{t("session.allDone")}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href={questHref(questId)}>
                <Button variant="secondary">{t("feedback.backToMap")}</Button>
              </Link>
              {next ? (
                <Link href={studyHref(questId, next.mission.id)}>
                  <Button>
                    {t("feedback.nextMission")}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </Link>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card className="mt-8 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Segmented
                label={t("session.countdown")}
                value={timer.mode}
                onChange={timer.changeMode}
                options={[
                  { value: "countdown", label: t("session.countdown") },
                  { value: "stopwatch", label: t("session.stopwatch") },
                ]}
              />
              {timer.mode === "countdown" ? (
                <Select
                  value={String(timer.countdownMinutes)}
                  onChange={(e) => timer.changeCountdown(Number(e.target.value))}
                  aria-label={t("session.countdownMinutes")}
                  className="h-10 w-auto text-sm"
                >
                  {[...new Set([...COUNTDOWNS, timer.countdownMinutes])].sort((a, b) => a - b).map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>

            <div className="mt-8 text-center" aria-live="off">
              <div
                className={cn(
                  "tabular font-display text-[72px] leading-none font-light tracking-tight sm:text-[96px]",
                  timeUp ? "text-honey-strong" : timer.running ? "text-ink" : "text-ink-2",
                )}
                role="timer"
              >
                {timeUp ? "+" : ""}
                {display}
              </div>
              <p className="mt-3 min-h-5 text-[13px] text-ink-3">
                {timeUp
                  ? t("session.timeUp")
                  : timer.session && timer.mode === "countdown"
                    ? t("session.trackedSoFar", { time: clock(timer.elapsedSeconds) })
                    : t("session.estimated", { time: formatMinutes(mission.estimatedMinutes) })}
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
              {!timer.session ? (
                <Button size="lg" onClick={startSession} disabled={paused}>
                  <Play className="h-4 w-4" />
                  {t("session.start")}
                </Button>
              ) : timer.running ? (
                <Button size="lg" variant="secondary" onClick={timer.pause}>
                  <Pause className="h-4 w-4" />
                  {t("session.pause")}
                </Button>
              ) : (
                <Button size="lg" onClick={timer.resume}>
                  <Play className="h-4 w-4" />
                  {t("session.resume")}
                </Button>
              )}
              {timer.session ? (
                <Button size="lg" variant="ghost" onClick={finish} loading={saving && !pending}>
                  <CircleStop className="h-4 w-4" />
                  {t("session.finish")}
                </Button>
              ) : null}
            </div>

            {canComplete ? (
              <div className="mt-6 border-t border-line pt-6 text-center">
                <Button variant="soft" size="lg" onClick={completeMission} loading={pending === missionId || (saving && Boolean(pending))}>
                  <CircleCheck className="h-4 w-4" />
                  {timer.session ? t("session.completeAndFinish") : t("session.complete")}
                </Button>
              </div>
            ) : null}
          </Card>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.4fr]">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-ink">{t("session.objectives")}</h2>
            {level.objectives.length ? (
              <ul className="space-y-1.5">
                {level.objectives.map((o) => (
                  <li key={o} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
                    {o}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-ink-3">{level.description || "—"}</p>
            )}
            {mission.actualSeconds > 0 ? (
              <p className="mt-4 text-[12.5px] text-ink-3">{t("map.trackedTime", { time: formatSeconds(mission.actualSeconds) })}</p>
            ) : null}
          </section>
          <NotesEditor questId={questId} missionId={missionId} />
        </div>
      </main>
    </div>
  );
}
