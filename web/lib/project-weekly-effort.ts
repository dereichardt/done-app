/**
 * Pure helpers for project-level Sunday–Saturday weekly actual effort matrices.
 * Calendar boundaries use the caller's local timezone (pass Dates / YMD from the client).
 */

import {
  type EffortSessionInput,
  effortProratedHoursByLocalDay,
  formatLocalYmd,
  localDayStart,
  parseLocalYmd,
  startOfLocalWeekSunday,
} from "@/lib/integration-effort-buckets";
import { sundayWeekWindowFromAnchorYmd } from "@/lib/timesheet-week";

export type ProjectEffortRowKind = "integration" | "project_management";

export type ProjectEffortRowDef = {
  key: string;
  label: string;
  kind: ProjectEffortRowKind;
  /** Estimated hours for the row (integration or project management); null when unset. */
  estimatedEffortHours?: number | null;
};

/** Session carrying which effort card row it belongs to. */
export type ProjectEffortSessionInput = EffortSessionInput & {
  rowKey: string;
};

export type ProjectWeeklyEffortWeek = {
  startYmd: string;
  label: string;
};

export type ProjectWeeklyEffortRow = {
  key: string;
  label: string;
  kind: ProjectEffortRowKind;
  /** Hours keyed by week-start `YYYY-MM-DD` (Sunday). */
  hoursByWeekYmd: Record<string, number>;
};

export type ProjectWeeklyEffortMatrix = {
  weeks: ProjectWeeklyEffortWeek[];
  rows: ProjectWeeklyEffortRow[];
  totalsByWeekYmd: Record<string, number>;
};

function dateOnlyYmd(iso: string | null | undefined): string | null {
  if (iso == null || iso.trim() === "") return null;
  const s = iso.trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Engagement span from ordered phases: first phase start → last phase end.
 * Returns null unless both ends are dated (matches project list engagement span).
 */
export function timelineSpanFromPhases(
  phases: { start_date: string | null; end_date: string | null }[],
): { startYmd: string; endYmd: string } | null {
  if (phases.length === 0) return null;
  const firstStart = dateOnlyYmd(phases[0].start_date);
  const lastEnd = dateOnlyYmd(phases[phases.length - 1].end_date);
  if (!firstStart || !lastEnd) return null;
  return { startYmd: firstStart, endYmd: lastEnd };
}

/** Compact week header, e.g. `Apr 6–12` or `Apr 28–May 4`. */
export function formatSundayWeekLabel(weekStartYmd: string): string {
  const weekStart = parseLocalYmd(weekStartYmd);
  if (Number.isNaN(weekStart.getTime())) return weekStartYmd;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const a = weekStart.toLocaleDateString(undefined, startOpts);
  const sameMonth =
    weekStart.getFullYear() === weekEnd.getFullYear() &&
    weekStart.getMonth() === weekEnd.getMonth();
  const b = sameMonth
    ? weekEnd.toLocaleDateString(undefined, { day: "numeric" })
    : weekEnd.toLocaleDateString(undefined, startOpts);
  return `${a}–${b}`;
}

/** Sundays from the week containing `startYmd` through the week containing `endYmd`, inclusive. */
export function sundayWeekStartsInclusive(startYmd: string, endYmd: string): string[] {
  const first = startOfLocalWeekSunday(parseLocalYmd(startYmd));
  const last = startOfLocalWeekSunday(parseLocalYmd(endYmd));
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return [];
  const out: string[] = [];
  const cursor = new Date(first);
  while (cursor.getTime() <= last.getTime()) {
    out.push(formatLocalYmd(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

function sessionWallBoundsMs(sessions: ProjectEffortSessionInput[]): {
  minMs: number;
  maxMs: number;
} | null {
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const s of sessions) {
    const a = new Date(s.started_at).getTime();
    const b = new Date(s.finished_at).getTime();
    if (!Number.isNaN(a)) minMs = Math.min(minMs, a);
    if (!Number.isNaN(b)) maxMs = Math.max(maxMs, b);
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return null;
  return { minMs, maxMs };
}

/** Unique Sunday week starts for local days that carry any prorated hours. */
export function discoverWorkWeekStarts(sessions: ProjectEffortSessionInput[]): string[] {
  const bounds = sessionWallBoundsMs(sessions);
  if (!bounds) return [];
  const windowStart = localDayStart(new Date(bounds.minMs));
  const windowEndExclusive = localDayStart(new Date(bounds.maxMs));
  windowEndExclusive.setDate(windowEndExclusive.getDate() + 1);
  const byDay = effortProratedHoursByLocalDay(sessions, windowStart, windowEndExclusive);
  const sundays = new Set<string>();
  for (const [ymd, hours] of byDay) {
    if (hours <= 0.001) continue;
    const day = parseLocalYmd(ymd);
    if (Number.isNaN(day.getTime())) continue;
    sundays.add(formatLocalYmd(startOfLocalWeekSunday(day)));
  }
  return [...sundays].sort();
}

function hoursForWeek(
  sessions: EffortSessionInput[],
  weekStartYmd: string,
): number {
  const { weekStart, weekEndExclusive } = sundayWeekWindowFromAnchorYmd(weekStartYmd);
  const byDay = effortProratedHoursByLocalDay(sessions, weekStart, weekEndExclusive);
  let sum = 0;
  for (const v of byDay.values()) sum += v;
  return sum;
}

/**
 * Build the weekly actuals matrix.
 * - With `timelineStartYmd` + `timelineEndYmd`: all Sunday weeks in that span (including zeros).
 * - Otherwise: only weeks where work was performed.
 */
export function buildWeeklyEffortMatrix(input: {
  rows: ProjectEffortRowDef[];
  sessions: ProjectEffortSessionInput[];
  timelineStartYmd?: string | null;
  timelineEndYmd?: string | null;
}): ProjectWeeklyEffortMatrix {
  const { rows, sessions } = input;
  const timelineStart = input.timelineStartYmd?.trim() || null;
  const timelineEnd = input.timelineEndYmd?.trim() || null;

  const weekStarts =
    timelineStart && timelineEnd
      ? sundayWeekStartsInclusive(timelineStart, timelineEnd)
      : discoverWorkWeekStarts(sessions);

  const weeks: ProjectWeeklyEffortWeek[] = weekStarts.map((startYmd) => ({
    startYmd,
    label: formatSundayWeekLabel(startYmd),
  }));

  const sessionsByRow = new Map<string, ProjectEffortSessionInput[]>();
  for (const s of sessions) {
    const list = sessionsByRow.get(s.rowKey) ?? [];
    list.push(s);
    sessionsByRow.set(s.rowKey, list);
  }

  const matrixRows: ProjectWeeklyEffortRow[] = rows.map((row) => {
    const subset = sessionsByRow.get(row.key) ?? [];
    const hoursByWeekYmd: Record<string, number> = {};
    for (const startYmd of weekStarts) {
      hoursByWeekYmd[startYmd] = hoursForWeek(subset, startYmd);
    }
    return {
      key: row.key,
      label: row.label,
      kind: row.kind,
      hoursByWeekYmd,
    };
  });

  const totalsByWeekYmd: Record<string, number> = {};
  for (const startYmd of weekStarts) {
    let sum = 0;
    for (const row of matrixRows) {
      sum += row.hoursByWeekYmd[startYmd] ?? 0;
    }
    totalsByWeekYmd[startYmd] = sum;
  }

  return { weeks, rows: matrixRows, totalsByWeekYmd };
}

/**
 * Fiscal-style effort quarters. Default starts in February:
 * Feb–Apr, May–Jul, Aug–Oct, Nov–Jan.
 * Intended to become a Settings preference later — keep consumers keyed off this config.
 */
export type EffortQuarterConfig = {
  /** 0-based calendar month when Q1 begins (default `1` = February). */
  startMonth: number;
};

export const DEFAULT_EFFORT_QUARTER_CONFIG: EffortQuarterConfig = {
  startMonth: 1,
};

export type EffortLocalPeriodBounds = {
  start: Date;
  endExclusive: Date;
};

/** Sum of prorated session hours in [start, endExclusive). */
export function effortHoursInLocalRange(
  sessions: EffortSessionInput[],
  start: Date,
  endExclusive: Date,
): number {
  const byDay = effortProratedHoursByLocalDay(sessions, start, endExclusive);
  let sum = 0;
  for (const v of byDay.values()) sum += v;
  return sum;
}

export function effortTodayBounds(anchor: Date): EffortLocalPeriodBounds {
  const start = localDayStart(anchor);
  const endExclusive = new Date(start);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { start, endExclusive };
}

/** Sunday–Saturday week containing `anchor` (matches project effort week columns). */
export function effortSundayWeekBounds(anchor: Date): EffortLocalPeriodBounds {
  const start = startOfLocalWeekSunday(anchor);
  const endExclusive = new Date(start);
  endExclusive.setDate(endExclusive.getDate() + 7);
  return { start, endExclusive };
}

export function effortMonthBounds(anchor: Date): EffortLocalPeriodBounds {
  const day = localDayStart(anchor);
  const start = new Date(day.getFullYear(), day.getMonth(), 1);
  const endExclusive = new Date(day.getFullYear(), day.getMonth() + 1, 1);
  return { start, endExclusive };
}

/**
 * Quarter containing `anchor` using `config.startMonth` as Q1 start.
 * With the default (February), quarters are Feb–Apr, May–Jul, Aug–Oct, Nov–Jan.
 */
export function effortQuarterBounds(
  anchor: Date,
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): EffortLocalPeriodBounds {
  const startMonth = ((Math.trunc(config.startMonth) % 12) + 12) % 12;
  const day = localDayStart(anchor);
  const m = day.getMonth();
  const offset = (m - startMonth + 12) % 12;
  const qIndex = Math.floor(offset / 3);
  const monthsFromQuarterStart = qIndex * 3;
  const start = new Date(day.getFullYear(), m - (offset - monthsFromQuarterStart), 1);
  const endExclusive = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  return { start, endExclusive };
}

export type ProjectEffortPeriodTotals = {
  todayHours: number;
  weekHours: number;
  monthHours: number;
  quarterHours: number;
};

export function buildProjectEffortPeriodTotals(
  sessions: EffortSessionInput[],
  todayIso: string,
  quarterConfig: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): ProjectEffortPeriodTotals {
  const anchor = todayIso.trim() ? parseLocalYmd(todayIso.trim()) : new Date();
  const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;

  const today = effortTodayBounds(safeAnchor);
  const week = effortSundayWeekBounds(safeAnchor);
  const month = effortMonthBounds(safeAnchor);
  const quarter = effortQuarterBounds(safeAnchor, quarterConfig);

  return {
    todayHours: effortHoursInLocalRange(sessions, today.start, today.endExclusive),
    weekHours: effortHoursInLocalRange(sessions, week.start, week.endExclusive),
    monthHours: effortHoursInLocalRange(sessions, month.start, month.endExclusive),
    quarterHours: effortHoursInLocalRange(sessions, quarter.start, quarter.endExclusive),
  };
}
