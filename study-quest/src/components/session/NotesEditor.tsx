"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Textarea } from "@/components/ui/Field";
import { actions } from "@/lib/client/actions";
import { useNote } from "@/lib/hooks/data";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Personal notes for a mission, saved automatically while typing. */
export function NotesEditor({ questId, missionId }: { questId: string; missionId: string }) {
  const { t } = useI18n();
  const { data: note, loading } = useNote(questId, missionId);
  const [text, setText] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const loaded = useRef(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !loaded.current) {
      loaded.current = true;
      setText(note?.text ?? "");
    }
  }, [loading, note]);

  const flush = async () => {
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    setState("saving");
    try {
      await actions.saveNote(questId, missionId, value);
      setState(pending.current === null ? "saved" : "saving");
    } catch {
      setState("error");
      pending.current = pending.current ?? value;
    }
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) {
        actions.saveNote(questId, missionId, pending.current).catch(() => undefined);
      }
    },
    [questId, missionId],
  );

  const label = { idle: "", saving: t("session.notesSaving"), saved: t("session.notesSaved"), error: t("session.notesError") }[state];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="mission-notes" className="text-[13px] font-semibold text-ink">
          {t("session.notes")}
        </label>
        <span className={cn("text-[12px]", state === "error" ? "text-danger" : "text-ink-3")} aria-live="polite">
          {label}
        </span>
      </div>
      <Textarea
        id="mission-notes"
        value={text}
        disabled={loading}
        onChange={(e) => {
          setText(e.target.value);
          pending.current = e.target.value;
          setState("idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 1000);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          flush();
        }}
        placeholder={t("session.notesPlaceholder")}
        maxLength={20000}
        dir="auto"
        className="min-h-48 bg-surface text-[15px] leading-relaxed"
      />
    </div>
  );
}
