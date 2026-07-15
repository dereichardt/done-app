"use client";

import { useMemo } from "react";

import type { HomeProjectStatusPhase } from "@/lib/home-project-status";
import {
  calendarDaysFromTo,
  formatPhaseDate,
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

type TimelinePoint = {
  name: string;
  start: string | null;
  end: string | null;
  startRatio: number;
  isCurrent: boolean;
  isCompleted: boolean;
  isNext: boolean;
};

type TimelineLayout = {
  points: TimelinePoint[];
  hypercareEnd: string | null;
  todayRatio: number | null;
  dated: boolean;
  spanStart: string | null;
  spanEnd: string | null;
};

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

  return {
    points,
    hypercareEnd,
    todayRatio,
    dated,
    spanStart,
    spanEnd,
  };
}

type TickAlign = "start" | "center" | "end";

function StageTick({
  leftPercent,
  align,
  dateLabel,
  stageName,
  isCompleted,
  ariaLabel,
}: {
  leftPercent: number;
  align: TickAlign;
  dateLabel: string | null;
  stageName?: string;
  isCompleted?: boolean;
  ariaLabel?: string;
}) {
  const alignClass =
    align === "start"
      ? "items-start text-left"
      : align === "end"
        ? "items-end text-right"
        : "items-center text-center";
  const translateClass =
    align === "start" ? "translate-x-0" : align === "end" ? "-translate-x-full" : "-translate-x-1/2";

  const tickColor = isCompleted
    ? "var(--app-text)"
    : "color-mix(in oklab, var(--app-text) 55%, var(--app-border))";

  return (
    <div
      className={`absolute z-[2] flex w-28 flex-col ${alignClass} ${translateClass}`}
      style={{
        left: `${clamp01(leftPercent) * 100}%`,
        top: "1.35rem",
      }}
      aria-label={ariaLabel}
    >
      <span
        className="h-7 w-0.5 shrink-0 rounded-full"
        style={{ background: tickColor }}
        aria-hidden
      />
      {stageName ? (
        <span
          className={[
            "mt-2.5 inline-flex min-h-[2rem] max-w-full items-center text-[11px] font-normal leading-tight",
            align === "start"
              ? "justify-start"
              : align === "end"
                ? "justify-end"
                : "justify-center",
          ].join(" ")}
          style={{
            color: isCompleted ? "var(--app-text)" : "var(--app-text-muted)",
          }}
          title={stageName}
        >
          <span className="line-clamp-2">{stageName}</span>
        </span>
      ) : (
        <span className="mt-2.5 min-h-[2rem]" aria-hidden />
      )}
      <span className="mt-1 max-w-full truncate text-[0.65rem] tabular-nums text-muted-canvas">
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

  const { points, hypercareEnd, todayRatio, dated, spanStart, spanEnd } = layout;
  const showNow =
    todayRatio != null && Number.isFinite(todayRatio) && todayRatio >= 0 && todayRatio <= 1;

  const hypercareEndLabel = hypercareEnd
    ? formatPhaseDate(hypercareEnd)
    : spanEnd
      ? formatPhaseDate(spanEnd)
      : null;

  return (
    <div aria-label="Project phase timeline">
      <h3 className="text-sm font-medium text-muted-canvas">Timeline</h3>

      <div className="card-canvas mt-3 overflow-x-auto p-3 sm:p-4">
        <div
          className="relative mx-3 min-w-[36rem]"
          style={{ height: "7.25rem" }}
          role="img"
          aria-label={
            dated && spanStart && spanEnd
              ? `Phase timeline from ${spanStart} to ${spanEnd}`
              : `${points.length} project phases`
          }
        >
          {/* Spine */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-[1.875rem] h-3 overflow-hidden rounded-full"
            style={{ background: "var(--app-border)" }}
          >
            {showNow && todayRatio! > 0 ? (
              <div
                className="h-full rounded-full motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)]"
                style={{
                  width: `${clamp01(todayRatio!) * 100}%`,
                  background: "var(--app-text)",
                }}
              />
            ) : null}
          </div>

          {/* Now marker */}
          {showNow ? (
            <div
              className="pointer-events-none absolute z-[3] flex -translate-x-1/2 flex-col items-center"
              style={{
                left: `${clamp01(todayRatio!) * 100}%`,
                top: "0.15rem",
              }}
              aria-label={`Today at ${Math.round(clamp01(todayRatio!) * 100)}% of timeline`}
            >
              <span
                className="mb-0.5 text-[0.6rem] font-medium uppercase tracking-wide"
                style={{ color: "var(--app-action)" }}
              >
                Today
              </span>
              <span
                className="h-12 w-1 rounded-full"
                style={{
                  background: "var(--app-action)",
                  boxShadow: "0 0 0 3px color-mix(in oklab, var(--app-action) 22%, transparent)",
                }}
              />
            </div>
          ) : null}

          {/* Stage starts — all vertical ticks */}
          {points.map((point, i) => {
            const isFirst = i === 0;
            const align: TickAlign = isFirst ? "start" : "center";
            const leftPercent = isFirst ? 0 : point.startRatio;
            return (
              <StageTick
                key={`${point.name}-${i}`}
                leftPercent={leftPercent}
                align={align}
                dateLabel={point.start ? formatPhaseDate(point.start) : null}
                stageName={point.name}
                isCompleted={point.isCompleted}
                ariaLabel={`${point.name}${
                  point.isCurrent
                    ? ", current stage"
                    : point.isCompleted
                      ? ", completed"
                      : point.isNext
                        ? ", next stage"
                        : ""
                }${point.start ? `, starts ${formatPhaseDate(point.start)}` : ""}`}
              />
            );
          })}

          {/* Far-right: Hypercare end */}
          <StageTick
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
