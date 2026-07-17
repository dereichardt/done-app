"use client";

import { useMemo } from "react";

import type { HomeProjectStatusPhase } from "@/lib/home-project-status";
import {
  calendarDaysFromTo,
  formatPhaseDateShort,
  getTimelinePhaseRowStatus,
  resolvePhaseStatus,
} from "@/lib/project-phase-status";

function dateOnly(iso: string | null | undefined): string | null {
  if (iso == null) return null;
  const t = String(iso).trim();
  if (t.length < 10) return null;
  return t.slice(0, 10);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Equal CSS gap between year row / bar / date row; extra pad under dates. */
const TRACK_H = "1.75rem";
const AXIS_GAP = "0.25rem";
const AXIS_LABEL_H = "0.65rem";
const DATE_GAP_EXTRA = "0.125rem";
const PLOT_PAD_BOTTOM = "0.75rem";

type TimelinePoint = {
  name: string;
  start: string | null;
  end: string | null;
  startRatio: number;
  isCurrent: boolean;
  isCompleted: boolean;
  isNext: boolean;
};

type StageSegment = {
  name: string;
  startRatio: number;
  endRatio: number;
};

type YearCrossing = {
  year: number;
  ratio: number;
};

type TimelineLayout = {
  points: TimelinePoint[];
  segments: StageSegment[];
  hypercareEnd: string | null;
  todayRatio: number | null;
  dated: boolean;
  spanStart: string | null;
  spanEnd: string | null;
  yearCrossings: YearCrossing[];
};

function yearCrossingsInSpan(spanStart: string, spanEnd: string, totalDays: number): YearCrossing[] {
  const startYear = Number(spanStart.slice(0, 4));
  const endYear = Number(spanEnd.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear <= startYear) {
    return [];
  }

  const crossings: YearCrossing[] = [];
  for (let year = startYear + 1; year <= endYear; year++) {
    const yearStartYmd = `${year}-01-01`;
    if (yearStartYmd <= spanStart || yearStartYmd > spanEnd) continue;
    crossings.push({
      year,
      ratio: clamp01(calendarDaysFromTo(spanStart, yearStartYmd) / totalDays),
    });
  }
  return crossings;
}

function buildSegments(points: TimelinePoint[]): StageSegment[] {
  return points.map((point, i) => ({
    name: point.name,
    startRatio: i === 0 ? 0 : point.startRatio,
    endRatio: i < points.length - 1 ? points[i + 1].startRatio : 1,
  }));
}

function buildLayout(phases: HomeProjectStatusPhase[], todayYmd: string): TimelineLayout {
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const phaseStatus = resolvePhaseStatus(sorted, todayYmd);
  const lastPhase = sorted[sorted.length - 1];
  const hypercareEnd = dateOnly(lastPhase?.end_date);

  let spanStart: string | null = null;
  let spanEnd: string | null = null;
  for (const p of sorted) {
    const s = dateOnly(p.start_date);
    const e = dateOnly(p.end_date);
    if (s && (!spanStart || s < spanStart)) spanStart = s;
    if (e && (!spanEnd || e > spanEnd)) spanEnd = e;
  }
  if (!spanEnd && hypercareEnd) spanEnd = hypercareEnd;

  const dated =
    spanStart != null &&
    spanEnd != null &&
    spanStart <= spanEnd &&
    sorted.every((p) => dateOnly(p.start_date) != null);

  const totalDays =
    dated && spanStart && spanEnd ? Math.max(1, calendarDaysFromTo(spanStart, spanEnd)) : 1;

  const ratioForDate = (ymd: string): number => {
    if (!dated || !spanStart) return 0;
    return clamp01(calendarDaysFromTo(spanStart, ymd) / totalDays);
  };

  const points: TimelinePoint[] = sorted.map((phase, index) => {
    const start = dateOnly(phase.start_date);
    const end = dateOnly(phase.end_date);
    const rowStatus = getTimelinePhaseRowStatus(todayYmd, start, end);
    const isCurrent = rowStatus.kind === "current";
    const isNext =
      !isCurrent &&
      phaseStatus.kind === "upcoming" &&
      phaseStatus.name === phase.name &&
      (phaseStatus.endDate === end || !end);
    const isCompleted = rowStatus.kind === "completed";

    let startRatio: number;
    if (dated && start) {
      startRatio = ratioForDate(start);
    } else if (sorted.length <= 1) {
      startRatio = 0;
    } else {
      startRatio = index / (sorted.length - 1);
    }

    return {
      name: phase.name,
      start,
      end,
      startRatio,
      isCurrent,
      isCompleted,
      isNext,
    };
  });

  let todayRatio: number | null = null;
  if (dated && spanStart && spanEnd) {
    todayRatio = ratioForDate(todayYmd);
  } else {
    const current = points.find((p) => p.isCurrent);
    if (current) todayRatio = current.startRatio;
    else if (points.every((p) => p.isCompleted)) todayRatio = 1;
    else {
      const next = points.find((p) => p.isNext);
      todayRatio = next ? next.startRatio : null;
    }
  }

  const yearCrossings =
    dated && spanStart && spanEnd ? yearCrossingsInSpan(spanStart, spanEnd, totalDays) : [];

  return {
    points,
    segments: buildSegments(points),
    hypercareEnd,
    todayRatio,
    dated,
    spanStart,
    spanEnd,
    yearCrossings,
  };
}

const TICK_COLOR = "color-mix(in oklab, var(--app-text) 28%, var(--app-border))";

function StageBarLabel({
  startRatio,
  endRatio,
  name,
  todayRatio,
}: {
  startRatio: number;
  endRatio: number;
  name: string;
  todayRatio: number | null;
}) {
  const widthPercent = Math.max(0, (endRatio - startRatio) * 100);
  if (widthPercent <= 0) return null;

  const hasLeadingTick = startRatio > 1e-9;
  // Label sits mostly on the filled (dark) portion when the segment start is before today.
  const onFilledTrack =
    todayRatio != null && startRatio < todayRatio - 1e-6;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-[1] flex min-w-0 items-center overflow-hidden"
      style={{
        left: `${clamp01(startRatio) * 100}%`,
        width: `${widthPercent}%`,
        paddingLeft: hasLeadingTick ? "0.375rem" : "0.625rem",
        paddingRight: "0.375rem",
      }}
      title={name}
    >
      <span
        className="min-w-0 truncate text-[0.6875rem] font-medium leading-none"
        style={{
          color: onFilledTrack ? "var(--app-surface)" : "var(--app-text)",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function StageDateLabel({
  leftPercent,
  dateLabel,
  align = "center",
  ariaLabel,
}: {
  leftPercent: number;
  dateLabel: string | null;
  align?: "start" | "center" | "end";
  ariaLabel?: string;
}) {
  const alignClass =
    align === "start"
      ? "translate-x-0 text-left"
      : align === "end"
        ? "-translate-x-full text-right"
        : "-translate-x-1/2 text-center";

  return (
    <div
      className={`absolute top-0 z-[2] ${alignClass}`}
      style={{
        left: `${clamp01(leftPercent) * 100}%`,
      }}
      aria-label={ariaLabel}
    >
      <span className="block whitespace-nowrap text-[0.65rem] leading-none tabular-nums text-muted-canvas">
        {dateLabel ?? "—"}
      </span>
    </div>
  );
}

export function HomeProgressTimeline({
  phases,
  todayYmd,
}: {
  phases: HomeProjectStatusPhase[];
  todayYmd: string;
}) {
  const layout = useMemo(() => {
    if (phases.length === 0) return null;
    return buildLayout(phases, todayYmd);
  }, [phases, todayYmd]);

  if (!layout) {
    return (
      <p className="text-sm text-muted-canvas">Add project phases to see a timeline.</p>
    );
  }

  const { points, segments, hypercareEnd, todayRatio, dated, spanStart, spanEnd, yearCrossings } =
    layout;
  const showNow =
    todayRatio != null && Number.isFinite(todayRatio) && todayRatio >= 0 && todayRatio <= 1;

  const hypercareEndLabel = hypercareEnd
    ? formatPhaseDateShort(hypercareEnd)
    : spanEnd
      ? formatPhaseDateShort(spanEnd)
      : null;

  return (
    <div aria-label="Project phase timeline" className="overflow-x-auto">
      <div
        className="relative flex min-w-[36rem] flex-col"
        style={{ gap: AXIS_GAP, paddingBottom: PLOT_PAD_BOTTOM }}
        role="img"
        aria-label={
          dated && spanStart && spanEnd
            ? `Phase timeline from ${spanStart} to ${spanEnd}`
            : `${points.length} project phases`
        }
      >
        {/* Year crossings above the bar */}
        <div className="relative" style={{ height: AXIS_LABEL_H }} aria-hidden>
          {yearCrossings.map(({ year, ratio }) => (
            <span
              key={year}
              className="absolute top-0 -translate-x-1/2 text-[0.65rem] font-medium leading-none tabular-nums"
              style={{
                left: `${ratio * 100}%`,
                color: "var(--app-text-muted)",
              }}
            >
              {year}
            </span>
          ))}
        </div>

        {/* Spine */}
        <div
          aria-hidden
          className="pointer-events-none relative overflow-hidden rounded-full"
          style={{
            height: TRACK_H,
            background: "var(--app-border)",
          }}
        >
          {showNow && todayRatio! > 0 ? (
            <div
              className="absolute inset-y-0 left-0 z-0 rounded-full motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)]"
              style={{
                width: `${clamp01(todayRatio!) * 100}%`,
                background: "var(--app-text)",
              }}
            />
          ) : null}

          {segments.map((segment, i) => (
            <StageBarLabel
              key={`${segment.name}-${i}`}
              startRatio={segment.startRatio}
              endRatio={segment.endRatio}
              name={segment.name}
              todayRatio={todayRatio}
            />
          ))}

          {/* Ticks inside bar (not at start/end) */}
          {points.map((point, i) => {
            const isFirst = i === 0;
            const leftPercent = isFirst ? 0 : point.startRatio;
            const atEnd = leftPercent >= 1 - 1e-9;
            const atStart = leftPercent <= 1e-9;
            const showTick = !atStart && !atEnd;
            if (!showTick) return null;
            return (
              <span
                key={`tick-${point.name}-${i}`}
                className="absolute inset-y-0 z-[2] w-0.5"
                style={{
                  left: `${clamp01(leftPercent) * 100}%`,
                  transform: "translateX(-50%)",
                  background: TICK_COLOR,
                }}
              />
            );
          })}
        </div>

        {/* Dates below bar — centered under ticks; start/end flush */}
        <div
          className="relative"
          style={{ height: AXIS_LABEL_H, marginTop: DATE_GAP_EXTRA }}
        >
          {points.map((point, i) => {
            const isFirst = i === 0;
            const leftPercent = isFirst ? 0 : point.startRatio;
            const align = isFirst ? "start" : "center";
            return (
              <StageDateLabel
                key={`date-${point.name}-${i}`}
                leftPercent={leftPercent}
                align={align}
                dateLabel={point.start ? formatPhaseDateShort(point.start) : null}
                ariaLabel={`${point.name}${
                  point.isCurrent
                    ? ", current stage"
                    : point.isCompleted
                      ? ", completed"
                      : point.isNext
                        ? ", next stage"
                        : ""
                }${point.start ? `, starts ${formatPhaseDateShort(point.start)}` : ""}`}
              />
            );
          })}

          <StageDateLabel
            leftPercent={1}
            align="end"
            dateLabel={hypercareEndLabel}
            ariaLabel={
              hypercareEndLabel ? `Engagement ends ${hypercareEndLabel}` : "Engagement end"
            }
          />
        </div>
      </div>
    </div>
  );
}
