"use client";

import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  loadTasksCalendarSessions,
  type TasksCalendarSession,
} from "@/lib/actions/tasks-calendar";
import {
  effortPeriodTotalHours,
  formatEffortHoursLabel,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import { TASKS_PAGE_INTERNAL_PROJECT_ID } from "@/lib/tasks-page-shared";
import { subscribeCalendarSessionCacheCleared } from "@/lib/tasks-calendar-session-cache";
import { addDaysYmd, sundayYmdOfWeekContaining } from "@/lib/zoned-datetime";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type HomeWeekBarProjectMeta = {
  abbreviation: string;
  name: string;
  colorVar: string | null;
};

type BreakdownRow = { label: string; hours: number; isIcp: boolean };

type BarSegment = {
  id: string;
  abbreviation: string;
  name: string;
  hours: number;
  colorVar: string | null;
  isInternal: boolean;
  /** Track / internal destination breakdown for the hover popover. */
  breakdown: BreakdownRow[];
};

function formatBarHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

function mutedSurface(colorVar: string | null): string {
  if (colorVar) {
    return `color-mix(in oklab, var(${colorVar}) 14%, var(--app-surface))`;
  }
  return "var(--app-surface-alt)";
}

function accentText(colorVar: string | null): string {
  if (colorVar) return `var(${colorVar})`;
  return "var(--app-text)";
}

function breakdownFromSessions(
  list: TasksCalendarSession[],
  rangeStart: Date,
  rangeEndExclusive: Date,
): BreakdownRow[] {
  const breakdownMap = new Map<string, { hours: number; isIcp: boolean }>();
  for (const s of list) {
    const label = (s.integration_label ?? "").trim() || "Track";
    const h = effortPeriodTotalHours([s], rangeStart, rangeEndExclusive);
    if (!Number.isFinite(h) || h <= 0) continue;
    const existing = breakdownMap.get(label);
    if (existing) {
      existing.hours += h;
      existing.isIcp = existing.isIcp || s.isIcp === true;
    } else {
      breakdownMap.set(label, { hours: h, isIcp: s.isIcp === true });
    }
  }
  return [...breakdownMap.entries()]
    .map(([label, row]) => ({ label, hours: row.hours, isIcp: row.isIcp }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
}

function buildSegments(
  sessions: TasksCalendarSession[],
  rangeStart: Date,
  rangeEndExclusive: Date,
  projectById: Map<string, HomeWeekBarProjectMeta>,
): BarSegment[] {
  const byProject = new Map<string, TasksCalendarSession[]>();
  for (const s of sessions) {
    const key = s.project_id || "unknown";
    const arr = byProject.get(key) ?? [];
    arr.push(s);
    byProject.set(key, arr);
  }

  const segments: BarSegment[] = [];
  for (const [projectId, list] of byProject) {
    const hours = effortPeriodTotalHours(list, rangeStart, rangeEndExclusive);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const breakdown = breakdownFromSessions(list, rangeStart, rangeEndExclusive);

    if (projectId === TASKS_PAGE_INTERNAL_PROJECT_ID) {
      segments.push({
        id: projectId,
        abbreviation: "INT",
        name: "Internal",
        hours,
        colorVar: null,
        isInternal: true,
        breakdown,
      });
      continue;
    }

    const meta = projectById.get(projectId);
    segments.push({
      id: projectId,
      abbreviation: meta?.abbreviation || "PRJ",
      name: meta?.name || list[0]?.project_name || "Project",
      hours,
      colorVar: meta?.colorVar ?? list[0]?.colorMeta?.colorVar ?? null,
      isInternal: false,
      breakdown,
    });
  }

  segments.sort((a, b) => {
    if (a.isInternal !== b.isInternal) return a.isInternal ? 1 : -1;
    return b.hours - a.hours || a.name.localeCompare(b.name);
  });
  return segments;
}

function SegmentBreakdownPopover({
  abbreviation,
  name,
  breakdown,
  totalHours,
  showLabel,
}: {
  abbreviation: string;
  name: string;
  breakdown: BreakdownRow[];
  totalHours: number;
  showLabel: boolean;
}) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover || !popover.matches(":popover-open")) return;
    const margin = 8;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - popoverRect.width - margin,
      Math.max(margin, triggerRect.left),
    );
    const top =
      triggerRect.bottom + gap + popoverRect.height <= window.innerHeight - margin
        ? triggerRect.bottom + gap
        : Math.max(margin, triggerRect.top - popoverRect.height - gap);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, []);

  const openPopover = useCallback(() => {
    clearCloseTimer();
    const popover = popoverRef.current;
    if (!popover) return;
    if (!popover.matches(":popover-open")) {
      try {
        popover.showPopover();
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(positionPopover);
  }, [clearCloseTimer, positionPopover]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      const popover = popoverRef.current;
      if (popover?.matches(":popover-open")) {
        try {
          popover.hidePopover();
        } catch {
          /* ignore */
        }
      }
    }, 120);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-full min-w-0 flex-1 cursor-default items-center justify-start gap-1.5 px-2.5 outline-none"
        aria-describedby={popoverId}
        aria-label={`${name}: ${formatEffortHoursLabel(totalHours)}. Hover for track breakdown.`}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClose}
        onFocus={openPopover}
        onBlur={scheduleClose}
      >
        {showLabel ? (
          <>
            <span className="truncate text-xs font-semibold tracking-wide">{abbreviation}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums">
              {formatBarHours(totalHours)}
            </span>
          </>
        ) : (
          <span className="sr-only">
            {abbreviation} {formatBarHours(totalHours)}
          </span>
        )}
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="m-0 w-[min(18rem,calc(100vw-1.5rem))] rounded-[10px] border p-3 shadow-lg"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <p className="text-xs font-medium text-muted-canvas">{name}</p>
        <ul className="mt-2 flex list-none flex-col gap-1.5">
          {breakdown.length === 0 ? (
            <li className="text-sm text-muted-canvas">No track hours</li>
          ) : (
            breakdown.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate" title={row.label}>
                    {row.label}
                  </span>
                  {row.isIcp ? <InitiativeIcpPill /> : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatBarHours(row.hours)}</span>
              </li>
            ))
          )}
        </ul>
        <p
          className="mt-2 border-t pt-2 text-sm font-semibold tabular-nums"
          style={{ borderColor: "var(--app-border)" }}
        >
          Total {formatBarHours(totalHours)}
        </p>
      </div>
    </>
  );
}

/** This-week hours stacked bar — muted project tints with abbreviation + hours labels. */
export function HomeWeekHoursStackedBar({
  todayIso,
  projectById,
  reloadKey = 0,
}: {
  todayIso: string;
  projectById: Map<string, HomeWeekBarProjectMeta>;
  /** Increment to refetch week sessions (e.g. after a home calendar create). */
  reloadKey?: number;
}) {
  const [sessions, setSessions] = useState<TasksCalendarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheClearTick, setCacheClearTick] = useState(0);

  const weekStartYmd = sundayYmdOfWeekContaining(todayIso);
  const weekEndExclusiveYmd = addDaysYmd(weekStartYmd, 7);
  const rangeStart = useMemo(() => parseLocalYmd(weekStartYmd), [weekStartYmd]);
  const rangeEndExclusive = useMemo(
    () => parseLocalYmd(weekEndExclusiveYmd),
    [weekEndExclusiveYmd],
  );

  useEffect(() => subscribeCalendarSessionCacheCleared(() => setCacheClearTick((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await loadTasksCalendarSessions(
        rangeStart.toISOString(),
        rangeEndExclusive.toISOString(),
      );
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setSessions([]);
        setLoading(false);
        return;
      }
      setSessions(res.sessions ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEndExclusive, reloadKey, cacheClearTick]);

  const segments = useMemo(
    () => buildSegments(sessions, rangeStart, rangeEndExclusive, projectById),
    [sessions, rangeStart, rangeEndExclusive, projectById],
  );
  const totalHours = useMemo(
    () => effortPeriodTotalHours(sessions, rangeStart, rangeEndExclusive),
    [sessions, rangeStart, rangeEndExclusive],
  );
  const denom = segments.reduce((acc, s) => acc + s.hours, 0) || 1;

  return (
    <section aria-label="Hours this week by project" className="min-w-0">
      {/*
        No external section header — card sits gap-2 below Summary/Tasks (same as
        horizontal gutters). Title aligns to the Summary column; total hours sits
        under Tasks. Stacked bar still spans the full Summary+Tasks width.
      */}
      <div className="card-canvas flex flex-col gap-2 px-3 py-2.5">
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-8">
          <h2 className="section-heading min-w-0 truncate sm:col-span-2">Hours this week</h2>
          <p className="text-xs font-medium tabular-nums text-muted-canvas sm:col-span-6 sm:text-right">
            {loading ? "…" : formatEffortHoursLabel(totalHours)}
          </p>
        </div>
        {error ? (
          <p className="text-sm" style={{ color: "var(--app-danger)" }}>
            Could not load hours: {error}
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-canvas">Loading…</p>
        ) : segments.length === 0 ? (
          <p className="text-sm text-muted-canvas">No hours logged this week</p>
        ) : (
          <div
            className="flex h-11 w-full overflow-hidden rounded-[10px]"
            style={{ background: "var(--app-border)" }}
            role="list"
            aria-label="Hours by project"
          >
            {segments.map((seg) => {
              const pct = Math.max(0, (seg.hours / denom) * 100);
              if (pct <= 0) return null;
              const showLabel = pct >= 8;
              return (
                <div
                  key={seg.id}
                  role="listitem"
                  className="relative flex h-full min-w-[2px] items-stretch overflow-hidden"
                  style={{
                    width: `${pct}%`,
                    background: seg.isInternal
                      ? "var(--app-internal-hours-surface)"
                      : mutedSurface(seg.colorVar),
                    color: seg.isInternal
                      ? "var(--app-internal-hours-fg)"
                      : accentText(seg.colorVar),
                  }}
                >
                  <SegmentBreakdownPopover
                    abbreviation={seg.abbreviation}
                    name={seg.name}
                    breakdown={seg.breakdown}
                    totalHours={seg.hours}
                    showLabel={showLabel}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
