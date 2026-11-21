"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Misc";
import { actions, questHref } from "@/lib/client/actions";
import { newClientId } from "@/lib/client/api";
import { apiErrorMessage } from "@/lib/client/errors";
import type { DraftStage } from "@/lib/domain/plan";
import { useToday } from "@/lib/hooks/data";
import { MINUTE_OPTIONS } from "./QuestMenu";
import { draftIsValid, StructureEditor } from "./StructureEditor";

export function NewQuestView() {
  const { t } = useI18n();
  const router = useRouter();
  const today = useToday();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<DraftStage[]>(() => [
    {
      id: newClientId("st"),
      title: t("editor.newStage"),
      description: "",
      levels: [
        {
          id: newClientId("lv"),
          title: t("editor.newLevel"),
          description: "",
          objectives: [],
          buildsOn: "",
          missions: [{ id: newClientId("ms"), title: t("editor.newMission"), description: "", activity: "read", estimatedMinutes: 25, difficulty: 2, required: true }],
        },
      ],
    },
  ]);

  async function create() {
    if (!title.trim() || !draftIsValid(stages)) {
      toast.error(t("editor.invalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await actions.createQuest({
        plan: {
          title: title.trim(),
          description: description.trim(),
          topic: title.trim(),
          subjectArea: "",
          complexity: "intermediate",
          prerequisites: [],
          pacingNote: "",
          stages,
        },
        source: "manual",
        deadline: deadline || null,
        minutesPerDay: minutes ? Number(minutes) : null,
      });
      router.push(questHref(res.questId));
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("quests.manualTitle")} subtitle={t("editor.subtitle")} />
      <Card className="mb-5 space-y-4 p-5 sm:p-6">
        <Field label={t("quests.fieldTitle")} htmlFor="nq-title">
          <Input id="nq-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} dir="auto" aria-invalid={!title.trim() && busy} />
        </Field>
        <Field label={`${t("quests.fieldDescription")} (${t("common.optional")})`} htmlFor="nq-desc">
          <Textarea id="nq-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} dir="auto" className="min-h-16" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t("quests.fieldDeadline")} (${t("common.optional")})`} htmlFor="nq-deadline">
            <Input id="nq-deadline" type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label={t("quests.fieldMinutesPerDay")} htmlFor="nq-min">
            <Select id="nq-min" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              <option value="">{t("planner.noPreference")}</option>
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t("planner.minutesOption", { count: m })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <StructureEditor value={stages} onChange={setStages} />
      <div className="sticky bottom-[76px] z-20 mt-6 flex justify-end gap-2 rounded-[18px] border border-line bg-surface/95 p-3 shadow-float backdrop-blur-md lg:bottom-4">
        <Button variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button onClick={create} loading={busy} disabled={!title.trim()}>
          {t("planner.start")}
        </Button>
      </div>
    </div>
  );
}
