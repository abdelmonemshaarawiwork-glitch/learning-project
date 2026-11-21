"use client";

import { Info, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { MINUTE_OPTIONS } from "@/components/quest/QuestMenu";
import { draftIsValid, StructureEditor, withIds } from "@/components/quest/StructureEditor";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Misc";
import { actions, questHref } from "@/lib/client/actions";
import { api } from "@/lib/client/api";
import { apiErrorMessage, plannerErrorMessage } from "@/lib/client/errors";
import { achievementById } from "@/lib/domain/achievements";
import { countDraft, type PlanDraft } from "@/lib/domain/plan";
import { useToday } from "@/lib/hooks/data";
import { usePlanGeneration, type PlannerRequest } from "@/lib/hooks/usePlanGeneration";
import { PlanForming } from "./PlanForming";
import { Schedule } from "./Schedule";

const DRAFT_KEY = "sq_planner_draft_v1";

interface StoredDraft {
  request: PlannerRequest;
  plan: PlanDraft;
  provider: "ai" | "mock";
}

function loadDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}
function saveDraft(d: StoredDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable: drafts just aren't kept */
  }
}

export function PlannerView() {
  const { t, tp, locale, formatMinutes } = useI18n();
  const router = useRouter();
  const today = useToday();
  const { announceAchievements } = useFeedback();
  const gen = usePlanGeneration();
  const [topic, setTopic] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minutes, setMinutes] = useState("");
  const [familiarity, setFamiliarity] = useState("");
  const [topicError, setTopicError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [provider, setProvider] = useState<"ai" | "mock" | null>(null);
  const [lastRequest, setLastRequest] = useState<PlannerRequest | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<{ provider: "ai" | "mock" } | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    api<{ provider: "ai" | "mock" }>("/api/planner/status").then(setStatus).catch(() => undefined);
  }, []);

  // Restore an unsaved plan after a refresh.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const d = loadDraft();
    if (d) {
      setDraft({ ...d.plan, stages: withIds(d.plan.stages) });
      setProvider(d.provider);
      setLastRequest(d.request);
      setTopic(d.request.topic);
      setDeadline(d.request.deadline ?? "");
      setMinutes(d.request.minutesPerDay ? String(d.request.minutesPerDay) : "");
      setFamiliarity(d.request.familiarity ?? "");
      toast(t("planner.draftRestored"));
    }
  }, [t]);

  useEffect(() => {
    if (draft && lastRequest && provider) saveDraft({ request: lastRequest, plan: draft, provider });
  }, [draft, lastRequest, provider]);

  async function run(extra: Partial<PlannerRequest> = {}) {
    const req: PlannerRequest = {
      topic: topic.trim(),
      deadline: deadline || null,
      minutesPerDay: minutes ? Number(minutes) : null,
      familiarity: (familiarity || null) as PlannerRequest["familiarity"],
      locale,
      ...extra,
    };
    if (req.topic.length < 3) {
      setTopicError(t("planner.errors.topicShort"));
      return;
    }
    setTopicError(null);
    const res = await gen.generate(req);
    if (res.plan) {
      setLastRequest(req);
      setProvider(res.provider ?? "mock");
      setDraft({ ...res.plan, stages: withIds(res.plan.stages) });
    } else if (res.error && draft) {
      // Regeneration failed: keep the current plan and say why.
      toast.error(plannerErrorMessage(t, res.error));
    }
  }

  async function start() {
    if (!draft || !draftIsValid(draft.stages) || !draft.title.trim()) {
      toast.error(t("editor.invalid"));
      return;
    }
    setCreating(true);
    try {
      const res = await actions.createQuest({
        plan: { ...draft, topic: lastRequest?.topic ?? draft.topic },
        source: provider === "ai" ? "ai" : "mock",
        deadline: lastRequest?.deadline ?? null,
        minutesPerDay: lastRequest?.minutesPerDay ?? null,
        familiarity: lastRequest?.familiarity ?? null,
      });
      saveDraft(null);
      announceAchievements(res.achievements.map((id) => ({ id, xpReward: achievementById(id)?.xpReward ?? 0 })));
      router.push(questHref(res.questId));
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
      setCreating(false);
    }
  }

  function discard() {
    if (!window.confirm(t("planner.discardConfirm"))) return;
    saveDraft(null);
    setDraft(null);
    setProvider(null);
    gen.reset();
  }

  const counts = draft ? countDraft(draft.stages) : null;
  const generating = gen.status === "generating";

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("planner.title")}
        subtitle={t("planner.subtitle")}
        actions={
          status?.provider === "mock" ? (
            <Badge tone="lavender" title={t("common.sampleModeHint")}>
              <Info className="h-3 w-3" />
              {t("common.sampleMode")}
            </Badge>
          ) : null
        }
      />

      {!draft && !generating ? (
        <Card className="p-5 sm:p-7">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
            className="space-y-5"
          >
            <Field label={t("planner.topicLabel")} htmlFor="topic" hint={t("planner.topicHelp")} error={topicError ?? undefined}>
              <Textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("planner.topicPlaceholder")}
                maxLength={2000}
                dir="auto"
                className="min-h-32 text-[15.5px]"
                aria-invalid={Boolean(topicError)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`${t("planner.deadline")} (${t("common.optional")})`} htmlFor="deadline">
                <Input id="deadline" type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </Field>
              <Field label={t("planner.minutesPerDay")} htmlFor="minutes">
                <Select id="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                  <option value="">{t("planner.noPreference")}</option>
                  {MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {t("planner.minutesOption", { count: m })}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("planner.familiarity")} htmlFor="familiarity">
                <Select id="familiarity" value={familiarity} onChange={(e) => setFamiliarity(e.target.value)}>
                  <option value="">{t("planner.noPreference")}</option>
                  {(["new", "some", "confident"] as const).map((f) => (
                    <option key={f} value={f}>
                      {t(`planner.familiarityOptions.${f}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {gen.status === "error" && gen.error ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                {plannerErrorMessage(t, gen.error)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => router.push("/quests/new")}>
                {t("quests.newManual")}
              </Button>
              <Button type="submit" size="lg">
                <Sparkles className="h-4 w-4" />
                {t("planner.generate")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {generating ? <PlanForming partial={gen.partial} onCancel={gen.cancel} /> : null}

      {draft && !generating ? (
        <div className="space-y-5 animate-rise">
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="sage">{t(`quest.complexity.${draft.complexity}`)}</Badge>
              {provider ? <Badge tone={provider === "ai" ? "olive" : "lavender"}>{t(`quest.source.${provider}`)}</Badge> : null}
              {counts ? (
                <span className="tabular text-[13px] text-ink-3">
                  {t("planner.summary", {
                    stages: tp("units.stages", counts.stages),
                    levels: tp("units.levels", counts.levels),
                    missions: tp("units.missions", counts.missions),
                    time: formatMinutes(counts.minutes),
                  })}
                </span>
              ) : null}
            </div>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              aria-label={t("quests.fieldTitle")}
              maxLength={140}
              dir="auto"
              className="mt-3 h-12 border-transparent bg-transparent px-1 font-display text-[26px] font-medium hover:border-line"
            />
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              aria-label={t("quests.fieldDescription")}
              maxLength={1000}
              dir="auto"
              className="mt-1 min-h-16 border-transparent bg-transparent px-1 text-[15px] text-ink-2 hover:border-line"
            />
            {draft.prerequisites.length || draft.pacingNote ? (
              <div className="mt-4 grid gap-4 rounded-2xl bg-surface-2 p-4 sm:grid-cols-2">
                {draft.prerequisites.length ? (
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink">{t("quest.prerequisites")}</div>
                    <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[13.5px] text-ink-2">
                      {draft.prerequisites.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {draft.pacingNote ? (
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink">{t("quest.pacing")}</div>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{draft.pacingNote}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="mt-4 text-[13px] text-ink-3">{t("planner.previewSubtitle")}</p>
          </Card>

          <StructureEditor value={draft.stages} onChange={(stages) => setDraft({ ...draft, stages })} />

          <div className="sticky bottom-[76px] z-20 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/95 p-3 shadow-float backdrop-blur-md lg:bottom-4">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={discard}>
                {t("planner.discard")}
              </Button>
              <Button variant="secondary" onClick={() => setRegenOpen(true)}>
                <RefreshCw className="h-4 w-4" />
                {t("planner.regenerate")}
              </Button>
            </div>
            <Button size="lg" loading={creating} onClick={start}>
              {creating ? t("planner.starting") : t("planner.start")}
            </Button>
          </div>
        </div>
      ) : null}

      {!draft && !generating ? (
        <div className="mt-8">
          <Schedule />
        </div>
      ) : null}

      <Dialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title={t("planner.regenerateTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegenOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                setRegenOpen(false);
                run({ feedback: feedback.trim() || undefined });
              }}
            >
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
