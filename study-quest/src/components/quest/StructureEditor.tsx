"use client";

import { ChevronDown, Ellipsis, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { newClientId } from "@/lib/client/api";
import type { DraftLevel, DraftMission, DraftStage } from "@/lib/domain/plan";
import { ACTIVITY_TYPES, type ActivityType, type Difficulty } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Make sure every node has an id (stable React keys; server re-issues unknown ids). */
export function withIds(stages: DraftStage[]): DraftStage[] {
  return stages.map((s) => ({
    ...s,
    id: s.id ?? newClientId("st"),
    levels: s.levels.map((l) => ({
      ...l,
      id: l.id ?? newClientId("lv"),
      missions: l.missions.map((m) => ({ ...m, id: m.id ?? newClientId("ms") })),
    })),
  }));
}

export function draftIsValid(stages: DraftStage[]): boolean {
  return (
    stages.length > 0 &&
    stages.every(
      (s) =>
        s.title.trim() &&
        s.levels.length > 0 &&
        s.levels.every((l) => l.title.trim() && l.missions.length > 0 && l.missions.every((m) => m.title.trim())),
    )
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

const MINUTES = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120];

function ItemMenu({
  onUp,
  onDown,
  onDelete,
  deleteLabel,
  canDelete,
  extra,
}: {
  onUp?: () => void;
  onDown?: () => void;
  onDelete: () => void;
  deleteLabel: string;
  canDelete: boolean;
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("common.more")}>
          <Ellipsis className="h-4 w-4" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem disabled={!onUp} onSelect={() => onUp?.()}>
          {t("common.moveUp")}
        </MenuItem>
        <MenuItem disabled={!onDown} onSelect={() => onDown?.()}>
          {t("common.moveDown")}
        </MenuItem>
        {extra}
        <MenuSeparator />
        <MenuItem tone="danger" icon={<Trash />} disabled={!canDelete} onSelect={onDelete}>
          {deleteLabel}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function StructureEditor({
  value,
  onChange,
  completed,
}: {
  value: DraftStage[];
  onChange: (stages: DraftStage[]) => void;
  /** Ids of missions already completed (shown as done; deletion warns). */
  completed?: Set<string>;
}) {
  const { t, formatMinutes, tp } = useI18n();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openLevel, setOpenLevel] = useState<Set<string>>(new Set());

  const setStage = (si: number, fn: (s: DraftStage) => DraftStage) => onChange(value.map((s, i) => (i === si ? fn(s) : s)));
  const setLevel = (si: number, li: number, fn: (l: DraftLevel) => DraftLevel) =>
    setStage(si, (s) => ({ ...s, levels: s.levels.map((l, j) => (j === li ? fn(l) : l)) }));
  const setMission = (si: number, li: number, mi: number, fn: (m: DraftMission) => DraftMission) =>
    setLevel(si, li, (l) => ({ ...l, missions: l.missions.map((m, k) => (k === mi ? fn(m) : m)) }));

  const newMission = (): DraftMission => ({
    id: newClientId("ms"),
    title: t("editor.newMission"),
    description: "",
    activity: "read",
    estimatedMinutes: 25,
    difficulty: 2,
    required: true,
  });
  const newLevel = (): DraftLevel => ({
    id: newClientId("lv"),
    title: t("editor.newLevel"),
    description: "",
    objectives: [],
    buildsOn: "",
    missions: [newMission()],
  });

  const totalLevels = value.reduce((n, s) => n + s.levels.length, 0);
  const totalMissions = value.reduce((n, s) => n + s.levels.reduce((m, l) => m + l.missions.length, 0), 0);
  const allLevels = value.flatMap((s, si) => s.levels.map((l, li) => ({ si, li, id: l.id!, title: l.title })));
  let levelCounter = 0;

  const confirmDeleteCompleted = (ids: string[]) =>
    !completed || !ids.some((id) => completed.has(id)) || window.confirm(t("editor.deleteCompletedWarn"));

  return (
    <div className="space-y-4">
      {value.map((stage, si) => {
        const isCollapsed = collapsed.has(stage.id!);
        const stageMissions = stage.levels.reduce((n, l) => n + l.missions.length, 0);
        const stageMinutes = stage.levels.reduce((n, l) => n + l.missions.reduce((a, m) => a + m.estimatedMinutes, 0), 0);
        return (
          <section key={stage.id} className="rounded-[var(--radius-card)] border border-line/80 bg-surface shadow-soft">
            <div className="flex items-start gap-2 p-3 sm:p-4">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => {
                    const n = new Set(c);
                    if (n.has(stage.id!)) n.delete(stage.id!);
                    else n.add(stage.id!);
                    return n;
                  })
                }
                className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"
                aria-expanded={!isCollapsed}
                aria-label={stage.title}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", isCollapsed && "-rotate-90 rtl:rotate-90")} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-medium tracking-wide text-ink-3 uppercase">{t("map.stage", { n: si + 1 })}</div>
                <Input
                  value={stage.title}
                  onChange={(e) => setStage(si, (s) => ({ ...s, title: e.target.value }))}
                  aria-label={`${t("editor.stage")} ${si + 1} — ${t("editor.fieldTitle")}`}
                  aria-invalid={!stage.title.trim()}
                  maxLength={140}
                  dir="auto"
                  className="mt-0.5 h-9 border-transparent bg-transparent px-1.5 font-display text-lg font-medium hover:border-line"
                />
                <div className="tabular px-1.5 text-[12px] text-ink-3">
                  {t("editor.totals", { missions: tp("units.missions", stageMissions), time: formatMinutes(stageMinutes) })}
                </div>
              </div>
              <ItemMenu
                onUp={si > 0 ? () => onChange(move(value, si, si - 1)) : undefined}
                onDown={si < value.length - 1 ? () => onChange(move(value, si, si + 1)) : undefined}
                canDelete={value.length > 1}
                deleteLabel={t("editor.deleteStage")}
                onDelete={() => {
                  const ids = stage.levels.flatMap((l) => l.missions.map((m) => m.id!));
                  if (confirmDeleteCompleted(ids)) onChange(value.filter((_, i) => i !== si));
                }}
              />
            </div>

            {!isCollapsed ? (
              <div className="space-y-3 border-t border-line/70 p-3 sm:p-4">
                {stage.levels.map((level, li) => {
                  levelCounter++;
                  const levelOpen = openLevel.has(level.id!);
                  return (
                    <div key={level.id} className="rounded-2xl bg-surface-2/70 p-3">
                      <div className="flex items-start gap-2">
                        <span className="tabular mt-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-surface px-1.5 text-[12px] font-semibold text-sage-strong shadow-soft">
                          {levelCounter}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Input
                            value={level.title}
                            onChange={(e) => setLevel(si, li, (l) => ({ ...l, title: e.target.value }))}
                            aria-label={`${t("editor.level")} ${levelCounter} — ${t("editor.fieldTitle")}`}
                            aria-invalid={!level.title.trim()}
                            maxLength={140}
                            dir="auto"
                            className="h-10 bg-surface text-[15px] font-medium"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setOpenLevel((o) => {
                                const n = new Set(o);
                                if (n.has(level.id!)) n.delete(level.id!);
                                else n.add(level.id!);
                                return n;
                              })
                            }
                            className="mt-1.5 inline-flex items-center gap-1 px-1 text-[12.5px] text-ink-3 hover:text-ink"
                            aria-expanded={levelOpen}
                          >
                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !levelOpen && "-rotate-90 rtl:rotate-90")} />
                            {t("editor.fieldDescription")} · {t("map.objectives")}
                          </button>
                        </div>
                        <ItemMenu
                          onUp={li > 0 ? () => setStage(si, (s) => ({ ...s, levels: move(s.levels, li, li - 1) })) : undefined}
                          onDown={li < stage.levels.length - 1 ? () => setStage(si, (s) => ({ ...s, levels: move(s.levels, li, li + 1) })) : undefined}
                          canDelete={totalLevels > 1 && stage.levels.length > 1}
                          deleteLabel={t("editor.deleteLevel")}
                          onDelete={() => {
                            if (confirmDeleteCompleted(level.missions.map((m) => m.id!)))
                              setStage(si, (s) => ({ ...s, levels: s.levels.filter((_, j) => j !== li) }));
                          }}
                          extra={
                            value.length > 1 ? (
                              <>
                                <MenuSeparator />
                                {value.map((target, ti) =>
                                  ti === si ? null : (
                                    <MenuItem
                                      key={target.id}
                                      disabled={stage.levels.length <= 1}
                                      onSelect={() => {
                                        const moved = stage.levels[li];
                                        onChange(
                                          value.map((s, i) =>
                                            i === si
                                              ? { ...s, levels: s.levels.filter((_, j) => j !== li) }
                                              : i === ti
                                                ? { ...s, levels: [...s.levels, moved] }
                                                : s,
                                          ),
                                        );
                                      }}
                                    >
                                      → {t("map.stage", { n: ti + 1 })}: {target.title}
                                    </MenuItem>
                                  ),
                                )}
                              </>
                            ) : null
                          }
                        />
                      </div>

                      {levelOpen ? (
                        <div className="mt-3 grid gap-3 ps-9">
                          <Textarea
                            value={level.description}
                            onChange={(e) => setLevel(si, li, (l) => ({ ...l, description: e.target.value }))}
                            aria-label={t("editor.fieldDescription")}
                            placeholder={t("editor.fieldDescription")}
                            maxLength={1000}
                            dir="auto"
                            className="min-h-16 bg-surface text-sm"
                          />
                          <Textarea
                            value={level.objectives.join("\n")}
                            onChange={(e) =>
                              setLevel(si, li, (l) => ({ ...l, objectives: e.target.value.split("\n").slice(0, 8) }))
                            }
                            onBlur={() => setLevel(si, li, (l) => ({ ...l, objectives: l.objectives.map((o) => o.trim()).filter(Boolean) }))}
                            aria-label={t("editor.objectives")}
                            placeholder={t("editor.objectives")}
                            dir="auto"
                            className="min-h-16 bg-surface text-sm"
                          />
                          <Input
                            value={level.buildsOn}
                            onChange={(e) => setLevel(si, li, (l) => ({ ...l, buildsOn: e.target.value }))}
                            aria-label={t("editor.buildsOn")}
                            placeholder={t("editor.buildsOn")}
                            maxLength={300}
                            dir="auto"
                            className="h-10 bg-surface text-sm"
                          />
                        </div>
                      ) : null}

                      <ul className="mt-3 space-y-2 sm:ps-9">
                        {level.missions.map((m, mi) => {
                          const done = completed?.has(m.id!) ?? false;
                          return (
                            <li key={m.id} className="rounded-xl border border-line/70 bg-surface p-2.5">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={m.title}
                                      onChange={(e) => setMission(si, li, mi, (x) => ({ ...x, title: e.target.value }))}
                                      aria-label={`${t("editor.mission")} — ${t("editor.fieldTitle")}`}
                                      aria-invalid={!m.title.trim()}
                                      maxLength={140}
                                      dir="auto"
                                      className="h-9 border-transparent px-2 text-sm hover:border-line"
                                    />
                                    {done ? <Badge tone="sage">{t("editor.completedBadge")}</Badge> : null}
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
                                    <Select
                                      value={m.activity}
                                      onChange={(e) => setMission(si, li, mi, (x) => ({ ...x, activity: e.target.value as ActivityType }))}
                                      aria-label={t("editor.activity")}
                                      className="h-8 w-auto rounded-[9px] py-0 ps-2.5 text-[13px]"
                                    >
                                      {ACTIVITY_TYPES.map((a) => (
                                        <option key={a} value={a}>
                                          {t(`mission.activity.${a}`)}
                                        </option>
                                      ))}
                                    </Select>
                                    <Select
                                      value={String(m.estimatedMinutes)}
                                      onChange={(e) => setMission(si, li, mi, (x) => ({ ...x, estimatedMinutes: Number(e.target.value) }))}
                                      aria-label={t("editor.minutes")}
                                      className="h-8 w-auto rounded-[9px] py-0 ps-2.5 text-[13px]"
                                    >
                                      {[...new Set([...MINUTES, m.estimatedMinutes])].sort((a, b) => a - b).map((n) => (
                                        <option key={n} value={n}>
                                          {formatMinutes(n)}
                                        </option>
                                      ))}
                                    </Select>
                                    <Select
                                      value={String(m.difficulty)}
                                      onChange={(e) => setMission(si, li, mi, (x) => ({ ...x, difficulty: Number(e.target.value) as Difficulty }))}
                                      aria-label={t("editor.difficulty")}
                                      className="h-8 w-auto rounded-[9px] py-0 ps-2.5 text-[13px]"
                                    >
                                      {[1, 2, 3].map((d) => (
                                        <option key={d} value={d}>
                                          {t(`mission.difficulty.${d as 1 | 2 | 3}`)}
                                        </option>
                                      ))}
                                    </Select>
                                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
                                      <input
                                        type="checkbox"
                                        checked={m.required}
                                        onChange={(e) => setMission(si, li, mi, (x) => ({ ...x, required: e.target.checked }))}
                                        className="h-4 w-4 accent-[var(--sage-strong)]"
                                      />
                                      {t("common.required")}
                                    </label>
                                  </div>
                                </div>
                                <ItemMenu
                                  onUp={mi > 0 ? () => setLevel(si, li, (l) => ({ ...l, missions: move(l.missions, mi, mi - 1) })) : undefined}
                                  onDown={
                                    mi < level.missions.length - 1
                                      ? () => setLevel(si, li, (l) => ({ ...l, missions: move(l.missions, mi, mi + 1) }))
                                      : undefined
                                  }
                                  canDelete={level.missions.length > 1}
                                  deleteLabel={t("editor.deleteMission")}
                                  onDelete={() => {
                                    if (confirmDeleteCompleted([m.id!]))
                                      setLevel(si, li, (l) => ({ ...l, missions: l.missions.filter((_, k) => k !== mi) }));
                                  }}
                                  extra={
                                    allLevels.length > 1 ? (
                                      <>
                                        <MenuSeparator />
                                        {allLevels
                                          .filter((x) => x.id !== level.id)
                                          .map((target) => (
                                            <MenuItem
                                              key={target.id}
                                              disabled={level.missions.length <= 1}
                                              onSelect={() => {
                                                const moved = level.missions[mi];
                                                onChange(
                                                  value.map((s, i) => ({
                                                    ...s,
                                                    levels: s.levels.map((l, j) => {
                                                      if (i === si && j === li) return { ...l, missions: l.missions.filter((_, k) => k !== mi) };
                                                      if (i === target.si && j === target.li) return { ...l, missions: [...l.missions, moved] };
                                                      return l;
                                                    }),
                                                  })),
                                                );
                                              }}
                                            >
                                              → {target.title}
                                            </MenuItem>
                                          ))}
                                      </>
                                    ) : null
                                  }
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-2 sm:ps-9">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={level.missions.length >= 20}
                          onClick={() => setLevel(si, li, (l) => ({ ...l, missions: [...l.missions, newMission()] }))}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t("editor.addMission")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button
                  size="sm"
                  variant="soft"
                  disabled={stage.levels.length >= 15}
                  onClick={() => setStage(si, (s) => ({ ...s, levels: [...s.levels, newLevel()] }))}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("editor.addLevel")}
                </Button>
              </div>
            ) : null}
          </section>
        );
      })}
      <Button
        variant="secondary"
        disabled={value.length >= 12 || totalMissions >= 300}
        onClick={() =>
          onChange([...value, { id: newClientId("st"), title: t("editor.newStage"), description: "", levels: [newLevel()] }])
        }
      >
        <Plus className="h-4 w-4" />
        {t("editor.addStage")}
      </Button>
    </div>
  );
}
