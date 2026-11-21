"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/components/providers/I18nProvider";
import { addDays, keyToDisplayDate, startOfWeek } from "@/lib/domain/dates";
import { heatLevel } from "@/lib/domain/stats";
import type { DailyActivity } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const CELL = 13;
const GAP = 3;

/** Calendar heatmap of the last `weeks` weeks (Monday-first rows). */
export function Heatmap({ days, today, weeks = 26 }: { days: DailyActivity[]; today: string; weeks?: number }) {
  const { t, formatDate } = useI18n();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = addDays(startOfWeek(today), -7 * (weeks - 1));
  const columns = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, r) => addDays(first, w * 7 + r)));
  const width = weeks * (CELL + GAP);
  const height = 7 * (CELL + GAP) + 18;
  const studied = days.filter((d) => d.studySeconds > 0 || d.missionsCompleted > 0).length;

  return (
    <div className="relative">
      <div ref={scroller} dir="ltr" className="scrollbar-thin overflow-x-auto pb-1" onScroll={() => setHover(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${t("stats.calendar")}: ${t("stats.studyDays")} ${studied}`}
          className="block"
          onMouseLeave={() => setHover(null)}
        >
          {columns.map((col, w) => {
            const firstOfMonth = col.find((d) => d.endsWith("-01"));
            return (
              <g key={w} transform={`translate(${w * (CELL + GAP)}, 0)`}>
                {firstOfMonth ? (
                  <text x={0} y={10} fontSize={10} fill="var(--ink-3)">
                    {formatDate(keyToDisplayDate(firstOfMonth), { month: "short" }, "UTC")}
                  </text>
                ) : null}
                {col.map((date, r) => {
                  if (date > today) return null;
                  const d = byDate.get(date);
                  const minutes = Math.round((d?.studySeconds ?? 0) / 60);
                  const missions = d?.missionsCompleted ?? 0;
                  const level = heatLevel(minutes, missions);
                  const label = t("stats.dayTooltip", {
                    date: formatDate(keyToDisplayDate(date), { dateStyle: "medium" }, "UTC"),
                    minutes,
                    missions,
                  });
                  return (
                    <rect
                      key={date}
                      x={0}
                      y={18 + r * (CELL + GAP)}
                      width={CELL}
                      height={CELL}
                      rx={3}
                      fill={`var(--heat-${level})`}
                      stroke={date === today ? "var(--ink-3)" : "none"}
                      strokeWidth={date === today ? 1 : 0}
                      onMouseEnter={() => setHover({ x: w * (CELL + GAP) - (scroller.current?.scrollLeft ?? 0), y: 18 + r * (CELL + GAP), text: label })}
                    >
                      <title>{label}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] whitespace-nowrap text-ink shadow-float"
          style={{ left: hover.x + CELL / 2, top: hover.y - 6 }}
          dir="auto"
        >
          {hover.text}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11.5px] text-ink-3">
        {t("stats.less")}
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={cn("h-3 w-3 rounded-[3px]")} style={{ background: `var(--heat-${l})` }} aria-hidden />
        ))}
        {t("stats.more")}
      </div>
    </div>
  );
}
