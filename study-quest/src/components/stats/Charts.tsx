"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/components/providers/I18nProvider";

/** Shared chart chrome: recessive hairline grid, muted axis text, no axis lines. */
const axisTick = { fill: "var(--ink-3)", fontSize: 11 };

function TooltipCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-start shadow-float">
      <div className="tabular text-sm font-semibold text-ink">{value}</div>
      <div className="text-[12px] text-ink-3">{title}</div>
      {sub ? <div className="text-[12px] text-ink-3">{sub}</div> : null}
    </div>
  );
}

export interface ColumnDatum {
  key: string;
  label: string;
  tooltipTitle: string;
  minutes: number;
  missions: number;
}

/** Single-series column chart of study minutes (one hue; the title names the series). */
export function StudyColumns({ data, ariaLabel }: { data: ColumnDatum[]; ariaLabel: string }) {
  const { t, formatMinutes, tp } = useI18n();
  const max = Math.max(...data.map((d) => d.minutes), 0);
  return (
    <div dir="ltr" className="h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            domain={[0, max > 0 ? "auto" : 60]}
            tickFormatter={(v: number) => (v >= 60 ? `${Math.round(v / 6) / 10}${t("units.h")}` : `${v}`)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as ColumnDatum;
              return <TooltipCard value={formatMinutes(d.minutes)} title={d.tooltipTitle} sub={tp("units.missions", d.missions)} />;
            }}
          />
          <Bar dataKey="minutes" fill="var(--sage)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface XpDatum {
  date: string;
  label: string;
  tooltipTitle: string;
  xp: number;
  gained: number;
}

/** Cumulative XP line with a light area wash and a crosshair tooltip. */
export function XpArea({ data, ariaLabel }: { data: XpDatum[]; ariaLabel: string }) {
  const { t, formatNumber } = useI18n();
  return (
    <div dir="ltr" className="h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}K` : `${v}`)} />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as XpDatum;
              return (
                <TooltipCard
                  value={`${formatNumber(d.xp)} ${t("units.xp")}`}
                  title={d.tooltipTitle}
                  sub={d.gained > 0 ? `+${formatNumber(d.gained)} ${t("units.xp")}` : undefined}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="xp"
            stroke="var(--sage)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="var(--sage)"
            fillOpacity={0.1}
            activeDot={{ r: 4.5, fill: "var(--sage)", stroke: "var(--surface)", strokeWidth: 2 }}
            dot={false}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
