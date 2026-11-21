"use client";

import { Archive, ArchiveArrowUp, Ellipsis, Pause, Pencil, Play, RefreshCw, Settings2, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/providers/I18nProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { actions } from "@/lib/client/actions";
import { apiErrorMessage } from "@/lib/client/errors";
import type { Quest } from "@/lib/domain/types";

export const MINUTE_OPTIONS = [15, 20, 30, 45, 60, 90, 120, 180];

export function QuestDetailsDialog({ quest, open, onOpenChange }: { quest: Quest; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(quest.title);
  const [description, setDescription] = useState(quest.description);
  const [deadline, setDeadline] = useState(quest.deadline ?? "");
  const [minutes, setMinutes] = useState(quest.minutesPerDay ? String(quest.minutesPerDay) : "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setTitle(quest.title);
          setDescription(quest.description);
          setDeadline(quest.deadline ?? "");
          setMinutes(quest.minutesPerDay ? String(quest.minutesPerDay) : "");
        }
        onOpenChange(o);
      }}
      title={t("quests.detailsTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            loading={busy}
            disabled={!title.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.updateMeta(quest.id, {
                  title: title.trim(),
                  description: description.trim(),
                  deadline: deadline || null,
                  minutesPerDay: minutes ? Number(minutes) : null,
                });
                toast(t("quests.detailsSaved"));
                onOpenChange(false);
              } catch (e) {
                toast.error(apiErrorMessage(t, e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("quests.fieldTitle")} htmlFor="q-title">
          <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} dir="auto" />
        </Field>
        <Field label={t("quests.fieldDescription")} htmlFor="q-desc">
          <Textarea id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} dir="auto" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("quests.fieldDeadline")} htmlFor="q-deadline">
            <Input id="q-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label={t("quests.fieldMinutesPerDay")} htmlFor="q-min">
            <Select id="q-min" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              <option value="">{t("planner.noPreference")}</option>
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t("planner.minutesOption", { count: m })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

export function QuestMenu({ quest, onRegenerate }: { quest: Quest; onRegenerate?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [details, setDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function status(action: "pause" | "resume" | "archive" | "unarchive") {
    try {
      await actions.setStatus(quest.id, action);
      const msg = { pause: "quests.paused", resume: "quests.resumed", archive: "quests.archived", unarchive: "quests.unarchived" } as const;
      toast(t(msg[action]));
    } catch (e) {
      toast.error(apiErrorMessage(t, e));
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("common.more")}>
            <Ellipsis className="h-4 w-4" />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {quest.status !== "archived" ? (
            <MenuItem icon={<Pencil />} onSelect={() => router.push(`/quests/${quest.id}/edit`)}>
              {t("quests.actions.edit")}
            </MenuItem>
          ) : null}
          <MenuItem icon={<Settings2 />} onSelect={() => setDetails(true)}>
            {t("quests.actions.details")}
          </MenuItem>
          {onRegenerate && quest.status !== "archived" && quest.status !== "completed" ? (
            <MenuItem icon={<RefreshCw />} onSelect={onRegenerate}>
              {t("quests.actions.regenerate")}
            </MenuItem>
          ) : null}
          <MenuSeparator />
          {quest.status === "active" ? (
            <MenuItem icon={<Pause />} onSelect={() => status("pause")}>
              {t("quests.actions.pause")}
            </MenuItem>
          ) : null}
          {quest.status === "paused" ? (
            <MenuItem icon={<Play />} onSelect={() => status("resume")}>
              {t("quests.actions.resume")}
            </MenuItem>
          ) : null}
          {quest.status !== "archived" ? (
            <MenuItem icon={<Archive />} onSelect={() => status("archive")}>
              {t("quests.actions.archive")}
            </MenuItem>
          ) : (
            <MenuItem icon={<ArchiveArrowUp />} onSelect={() => status("unarchive")}>
              {t("quests.actions.unarchive")}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Trash />} tone="danger" onSelect={() => setConfirmDelete(true)}>
            {t("quests.actions.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
      <QuestDetailsDialog quest={quest} open={details} onOpenChange={setDetails} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("quests.deleteTitle")}
        description={t("quests.deleteBody", { title: quest.title })}
        confirmLabel={t("common.delete")}
        tone="danger"
        requireText={quest.title}
        requireLabel={t("quests.deleteConfirmLabel")}
        onConfirm={async () => {
          try {
            await actions.deleteQuest(quest.id);
            toast(t("quests.deleted"));
            router.push("/quests");
          } catch (e) {
            toast.error(apiErrorMessage(t, e));
            throw e;
          }
        }}
      />
    </>
  );
}
