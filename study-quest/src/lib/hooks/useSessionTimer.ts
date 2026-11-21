"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newClientId } from "@/lib/client/api";

/**
 * A study timer that survives refreshes and closed tabs.
 * State lives in localStorage (one active session per user/device). If the
 * tab was closed while running, the session is restored as paused at the last
 * moment the page was open — time away from the page is never counted.
 */

export interface StoredSession {
  sessionId: string;
  questId: string;
  missionId: string;
  startedAt: number;
  accumulatedMs: number;
  runningSince: number | null;
  lastTick: number;
  mode: "stopwatch" | "countdown";
  countdownMinutes: number;
}

const key = (uid: string) => `sq_active_session_${uid}`;

export function readStoredSession(uid: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
function writeStored(uid: string, s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(key(uid), JSON.stringify(s));
    else localStorage.removeItem(key(uid));
  } catch {
    /* storage unavailable: timer still works for this page view */
  }
}

export function elapsedMs(s: StoredSession, now = Date.now()): number {
  return s.accumulatedMs + (s.runningSince ? Math.max(0, now - s.runningSince) : 0);
}

const STALE_MS = 15_000;

export function useSessionTimer(uid: string, questId: string, missionId: string, defaultCountdown: number) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [restored, setRestored] = useState(false);
  const [otherSession, setOtherSession] = useState<StoredSession | null>(null);
  const [mode, setMode] = useState<"stopwatch" | "countdown">("countdown");
  const [countdownMinutes, setCountdownMinutes] = useState(defaultCountdown);
  const sessionRef = useRef<StoredSession | null>(null);
  sessionRef.current = session;

  // Restore on mount.
  useEffect(() => {
    const stored = readStoredSession(uid);
    if (!stored) return;
    if (stored.questId !== questId || stored.missionId !== missionId) {
      setOtherSession(stored);
      return;
    }
    let s = stored;
    if (s.runningSince && Date.now() - s.lastTick > STALE_MS) {
      // The page was closed while running: pause at the last moment it was open.
      s = { ...s, accumulatedMs: s.accumulatedMs + Math.max(0, s.lastTick - s.runningSince), runningSince: null };
      writeStored(uid, s);
      setRestored(true);
    }
    setSession(s);
    setMode(s.mode);
    setCountdownMinutes(s.countdownMinutes);
  }, [uid, questId, missionId]);

  // Tick while running.
  useEffect(() => {
    if (!session?.runningSince) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const cur = sessionRef.current;
      if (cur?.runningSince) writeStored(uid, { ...cur, lastTick: t });
    }, 1000);
    return () => clearInterval(id);
  }, [session?.runningSince, uid]);

  const update = useCallback(
    (s: StoredSession | null) => {
      setSession(s);
      writeStored(uid, s);
      setNow(Date.now());
    },
    [uid],
  );

  const start = useCallback(() => {
    const t = Date.now();
    update({
      sessionId: newClientId("ses"),
      questId,
      missionId,
      startedAt: t,
      accumulatedMs: 0,
      runningSince: t,
      lastTick: t,
      mode,
      countdownMinutes,
    });
    setOtherSession(null);
  }, [update, questId, missionId, mode, countdownMinutes]);

  const pause = useCallback(() => {
    const s = sessionRef.current;
    if (!s?.runningSince) return;
    const t = Date.now();
    update({ ...s, accumulatedMs: s.accumulatedMs + (t - s.runningSince), runningSince: null, lastTick: t });
  }, [update]);

  const resume = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.runningSince) return;
    const t = Date.now();
    update({ ...s, runningSince: t, lastTick: t });
  }, [update]);

  /** Stop and return the data to record (or null if nothing to record). */
  const stop = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return null;
    const t = Date.now();
    const activeSeconds = Math.floor(elapsedMs(s, t) / 1000);
    update(null);
    return { sessionId: s.sessionId, questId: s.questId, missionId: s.missionId, startedAt: s.startedAt, endedAt: t, activeSeconds };
  }, [update]);

  /** Close out a session left running on another mission. */
  const takeOther = useCallback(() => {
    const s = otherSession;
    if (!s) return null;
    const end = s.runningSince ? Math.min(Date.now(), s.lastTick + 1000) : s.lastTick;
    const active = s.accumulatedMs + (s.runningSince ? Math.max(0, end - s.runningSince) : 0);
    writeStored(uid, null);
    setOtherSession(null);
    return { sessionId: s.sessionId, questId: s.questId, missionId: s.missionId, startedAt: s.startedAt, endedAt: Math.max(end, s.startedAt), activeSeconds: Math.floor(active / 1000) };
  }, [otherSession, uid]);

  const changeMode = useCallback(
    (m: "stopwatch" | "countdown") => {
      setMode(m);
      const s = sessionRef.current;
      if (s) update({ ...s, mode: m });
    },
    [update],
  );
  const changeCountdown = useCallback(
    (min: number) => {
      setCountdownMinutes(min);
      const s = sessionRef.current;
      if (s) update({ ...s, countdownMinutes: min });
    },
    [update],
  );

  const elapsed = session ? elapsedMs(session, now) : 0;
  return {
    session,
    running: Boolean(session?.runningSince),
    elapsedSeconds: Math.floor(elapsed / 1000),
    mode,
    countdownMinutes,
    restored,
    otherSession,
    start,
    pause,
    resume,
    stop,
    takeOther,
    changeMode,
    changeCountdown,
  };
}
