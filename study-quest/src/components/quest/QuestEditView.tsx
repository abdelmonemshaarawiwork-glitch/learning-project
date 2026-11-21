"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/I18nProvider";
import { PlanForming } from "@/components/planner/PlanForming";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Field";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/Misc";
import { actions, questHref } from "@/lib/client/actions";
import { apiErrorMessage, plannerErrorMessage } from "@/lib/client/errors";
import { completedMissionTitles, countDraft, keepCompletedProgress, stagesToDraft, type DraftStage } from "@/lib/domain/plan";
import { useQuest } from "@/lib/hooks/data";
import { usePlanGeneration } from "@/lib/hooks/usePlanGeneration";
import { draftIsValid, StructureEditor, withIds } from "./StructureEditor";

export function QuestEditView({ questId }: { questId: string }) {
  const { t, tp, locale, formatMinutes } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { data: quest, loading } = useQuest(questId);
  const [draft, setDraft] = useState<DraftStage[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const gen = usePlanGeneration();
  const initialised = useRef(false);

  useEffect(() => {
    if (quest && !initialised.current) {
      initialised.current = true;
      setDraft(withIds(stagesToDraft(quest.stages)));
      if (params.get("regenerate") === "1") setRegenOpen(true);
    }
  }, [quest, params]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const completed = useMemo(
    () => new Set(quest?.stages.flatMap((s) => s.levels.flatMap((l) => l.missions.filter((m) => m.status === "done").map((m) => m.id))) ?? []),
    [quest],
  );

  if (loading || (quest && !draft)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!quest || !draft) return <EmptyState title={t("errors.quest_not_found")} />;

  const counts = countDraft(draft);
  const valid = draftIsValid(draft);

  async function save() {
    if (!valid) {
      toast.error(t("editor.invalid"));
      return;
    }
    setSaving(true);
    try {
      await actions.saveStructure(questId, draft!);
      setDirty(false);
      toast(t("editor.saved"));
      router.push(questHref(questId));
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenOpen(false);
    const res = await gen.generate({
      topic: quest!.topic || quest!.title,
      deadline: quest!.deadline,
      minutesPerDay: quest!.minutesPerDay,
      familiarity: quest!.familiarity,
      feedback: feedback.trim() || undefined,
      completed: completedMissionTitles(quest!.stages),
      locale,
    });
    if (res.plan) {
      // Completed work stays first; the new plan continues from it.
      setDraft([...keepCompletedProgress(quest!.stages), ...withIds(res.plan.stages)].slice(0, 12));
      setDirty(true);
    } else if (res.error) {
      toast.error(plannerErrorMessage(t, res.error));
    }
  }

  return (
    <div className="animate-fade-in">
      <Link href={questHref(questId)} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        {quest.title}
      </Link>
      <PageHeader
        title={t("editor.title")}
        subtitle={t("editor.subtitle")}
        actions={
          <Button variant="secondary" onClick={() => setRegenOpen(true)} disabled={gen.status === "generating"}>
            <RefreshCw className="h-4 w-4" />
            {t("planner.regenerate")}
          </Button>
        }
      />
      {gen.status === "generating" ? (
        <PlanForming partial={gen.partial} onCancel={gen.cancel} />
      ) : (
        <>
          <p className="tabular mb-4 text-[13px] text-ink-3">
            {t("planner.summary", {
              stages: tp("units.stages", counts.stages),
              levels: tp("units.levels", counts.levels),
              missions: tp("units.missions", counts.missions),
              time: formatMinutes(counts.minutes),
            })}
          </p>
          <StructureEditor
            value={draft}
            completed={completed}
            onChange={(s) => {
              setDraft(s);
              setDirty(true);
            }}
          />
          <div className="sticky bottom-[76px] z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/95 p-3 shadow-float backdrop-blur-md lg:bottom-4">
            <span className="px-2 text-[13px] text-ink-3">{dirty ? t("editor.unsaved") : ""}</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  if (!dirty || window.confirm(t("editor.leaveConfirm"))) router.push(questHref(questId));
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={save} loading={saving} disabled={!dirty || !valid}>
                {t("editor.save")}
              </Button>
            </div>
          </div>
        </>
      )}
      <Dialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title={t("planner.regenerateTitle")}
        description={t("planner.regenerateKeep")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegenOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={regenerate}>
              <RefreshCw className="h-4 w-4" />
              {t("planner.regenerate")}
            </Button>
          </>
        }
      >
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={t("planner.regeneratePlaceholder")}
          aria-label={t("planner.regeneratePlaceholder")}
          maxLength={1000}
          dir="auto"
        />
      </Dialog>
    </div>
  );
}
