/**
 * Fiscal quarter labeling and Sunday-week helpers for Utilization.
 * Quarters use Settings `effort_quarter_start_month` (default February).
 * Fiscal year is named by the calendar year in which it ends
 * (Feb 2026–Jan 2027 = FY27).
 */

import {
  formatLocalYmd,
  localDayStart,
  parseLocalYmd,
  startOfLocalWeekSunday,
} from "@/lib/integration-effort-buckets";
import {
  DEFAULT_EFFORT_QUARTER_CONFIG,
  effortQuarterBounds,
  type EffortQuarterConfig,
  type EffortLocalPeriodBounds,
} from "@/lib/project-weekly-effort";
import { addDaysYmd } from "@/lib/zoned-datetime";

export type FiscalQuarterIdentity = {
  /** First day of the fiscal quarter (local midnight Date). */
  start: Date;
  /** Exclusive end of the fiscal quarter. */
  endExclusive: Date;
  /** Calendar year in which the FY ends (e.g. 2027 for FY27). */
  fiscalYear: number;
  /** 1–4 */
  quarter: number;
  /** e.g. "FY27 Q3" */
  label: string;
  /** YYYY-MM-DD of quarter start (stable DB key). */
  quarterStartYmd: string;
  /** YYYY-MM-DD exclusive end. */
  endExclusiveYmd: string;
};

/** 0-based quarter index (0–3) for the quarter containing `anchor`. */
export function effortQuarterIndex0(
  anchor: Date,
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): number {
  const startMonth = ((Math.trunc(config.startMonth) % 12) + 12) % 12;
  const day = localDayStart(anchor);
  const m = day.getMonth();
  const offset = (m - startMonth + 12) % 12;
  return Math.floor(offset / 3);
}

/** 1-based quarter number (1–4). */
export function effortQuarterIndex(
  anchor: Date,
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): number {
  return effortQuarterIndex0(anchor, config) + 1;
}

/**
 * Fiscal year label year for a quarter starting on `quarterStart`.
 * Named by the calendar year in which the FY ends.
 * Jan-start (startMonth 0): FY ends Dec of same year → FY = Q1 calendar year.
 * Feb/Mar start: FY ends in the following calendar year → FY = Q1 year + 1.
 */
export function fiscalYearForQuarterStart(
  quarterStart: Date,
  startMonth: number,
): number {
  const sm = ((Math.trunc(startMonth) % 12) + 12) % 12;
  const start = localDayStart(quarterStart);
  if (sm === 0) return start.getFullYear();

  // Q1 year: if quarter start month >= startMonth, same calendar year; else prior year.
  const q1Year =
    start.getMonth() >= sm ? start.getFullYear() : start.getFullYear() - 1;
  return q1Year + 1;
}

export function formatFiscalQuarterLabel(fiscalYear: number, quarter: number): string {
  const fyShort = Math.abs(Math.trunc(fiscalYear)) % 100;
  const q = Math.min(4, Math.max(1, Math.trunc(quarter)));
  return `FY${String(fyShort).padStart(2, "0")} Q${q}`;
}

export function resolveFiscalQuarter(
  anchor: Date,
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): FiscalQuarterIdentity {
  const bounds = effortQuarterBounds(anchor, config);
  const quarter = effortQuarterIndex(anchor, config);
  const fiscalYear = fiscalYearForQuarterStart(bounds.start, config.startMonth);
  return {
    start: bounds.start,
    endExclusive: bounds.endExclusive,
    fiscalYear,
    quarter,
    label: formatFiscalQuarterLabel(fiscalYear, quarter),
    quarterStartYmd: formatLocalYmd(bounds.start),
    endExclusiveYmd: formatLocalYmd(bounds.endExclusive),
  };
}

/** Shift a fiscal quarter by `delta` quarters (negative = past). */
export function shiftFiscalQuarter(
  identity: FiscalQuarterIdentity,
  delta: number,
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): FiscalQuarterIdentity {
  const anchor = new Date(identity.start);
  anchor.setMonth(anchor.getMonth() + delta * 3);
  // Mid-month of the shifted quarter start month avoids edge ambiguity.
  anchor.setDate(15);
  return resolveFiscalQuarter(anchor, config);
}

/**
 * Ordered Sunday YYYY-MM-DD week starts that overlap [start, endExclusive).
 * A week overlaps if its Sunday–Saturday range intersects the half-open quarter.
 */
export function sundayWeeksOverlappingRange(
  start: Date,
  endExclusive: Date,
): string[] {
  const rangeStart = localDayStart(start);
  const rangeEnd = localDayStart(endExclusive);
  if (!(rangeStart < rangeEnd)) return [];

  // First Sunday on or before range start (week that may overlap the start).
  let sunday = startOfLocalWeekSunday(rangeStart);
  const out: string[] = [];

  while (sunday < rangeEnd) {
    const weekEnd = new Date(sunday);
    weekEnd.setDate(weekEnd.getDate() + 7);
    // Overlap with [rangeStart, rangeEnd): sunday < rangeEnd && weekEnd > rangeStart
    if (sunday < rangeEnd && weekEnd > rangeStart) {
      out.push(formatLocalYmd(sunday));
    }
    sunday = new Date(sunday);
    sunday.setDate(sunday.getDate() + 7);
  }

  return out;
}

/** Preferred weekly pace for a full Mon–Fri week (matches Forecast capacity). */
export const PREFERRED_WEEKLY_PACE_HOURS = 32;

/** Even split of target across weeks; earlier weeks keep the higher share. */
export function paceHoursPerWeek(target: number, weekCount: number): number[] {
  const n = Math.max(0, Math.floor(weekCount));
  if (n === 0) return [];
  const t = Number.isFinite(target) && target > 0 ? target : 0;
  if (t === 0) return Array.from({ length: n }, () => 0);

  // Front-load remainder so later weeks step down (e.g. 32…32, 31) instead of bumping the end up.
  const totalQ = Math.round(t * 4);
  const baseQ = Math.floor(totalQ / n);
  const remainderQ = totalQ - baseQ * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = baseQ + (i < remainderQ ? 1 : 0);
    out.push(q / 4);
  }
  return out;
}

/** Half-open local day range intersection, or null if empty. */
export function clipLocalRange(
  start: Date,
  endExclusive: Date,
  boundStart: Date,
  boundEndExclusive: Date,
): { start: Date; endExclusive: Date } | null {
  const a = start.getTime() > boundStart.getTime() ? start : boundStart;
  const b =
    endExclusive.getTime() < boundEndExclusive.getTime()
      ? endExclusive
      : boundEndExclusive;
  if (!(a.getTime() < b.getTime())) return null;
  return { start: localDayStart(a), endExclusive: localDayStart(b) };
}

/** Whole local calendar days in [start, endExclusive). */
export function localDayCount(start: Date, endExclusive: Date): number {
  const ms = localDayStart(endExclusive).getTime() - localDayStart(start).getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / 86_400_000);
}

/** Mon–Fri days in [start, endExclusive). Weekends do not count toward pace. */
export function localWeekdayCount(start: Date, endExclusive: Date): number {
  let count = 0;
  const day = localDayStart(start);
  const end = localDayStart(endExclusive);
  while (day < end) {
    const dow = day.getDay(); // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) count += 1;
    day.setDate(day.getDate() + 1);
  }
  return count;
}

/**
 * Overlap of a Sunday week with the quarter for utilization pacing.
 * - `calendarDays` / `calendarFraction`: all days (actuals still use calendar clip).
 * - `weekdays` / `weekdayFraction`: Mon–Fri only (pace + forecast proration).
 * Example: week of 2026-07-26 vs FY27 Q3 → calendar 1 (Aug 1), weekdays 0.
 */
export function weekOverlapInQuarter(
  weekStartYmd: string,
  quarterStart: Date,
  quarterEndExclusive: Date,
): {
  days: number;
  fraction: number;
  weekdays: number;
  weekdayFraction: number;
  calendarDays: number;
  calendarFraction: number;
} {
  const weekStart = startOfLocalWeekSunday(parseLocalYmd(weekStartYmd));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const clipped = clipLocalRange(
    weekStart,
    weekEnd,
    localDayStart(quarterStart),
    localDayStart(quarterEndExclusive),
  );
  if (!clipped) {
    return {
      days: 0,
      fraction: 0,
      weekdays: 0,
      weekdayFraction: 0,
      calendarDays: 0,
      calendarFraction: 0,
    };
  }
  const calendarDays = localDayCount(clipped.start, clipped.endExclusive);
  const weekdays = localWeekdayCount(clipped.start, clipped.endExclusive);
  return {
    // Prefer weekday weights for pace/forecast (5-day work week).
    days: weekdays,
    fraction: weekdays / 5,
    weekdays,
    weekdayFraction: weekdays / 5,
    calendarDays,
    calendarFraction: calendarDays / 7,
  };
}

/**
 * Spread `target` across weeks using a preferred ~32h full work week.
 * Fills from the start of the quarter at that rate, then steps down at the end
 * with whatever remains (instead of bumping the last week up).
 * `dayWeights` are Mon–Fri day counts per week (0 for weekend-only stubs).
 */
export function paceHoursPerWeekWeighted(
  target: number,
  dayWeights: number[],
  preferredWeeklyHours: number = PREFERRED_WEEKLY_PACE_HOURS,
): number[] {
  const n = dayWeights.length;
  if (n === 0) return [];
  const t = Number.isFinite(target) && target > 0 ? target : 0;
  if (t === 0) return Array.from({ length: n }, () => 0);

  const preferred = Number.isFinite(preferredWeeklyHours) && preferredWeeklyHours > 0
    ? preferredWeeklyHours
    : PREFERRED_WEEKLY_PACE_HOURS;

  let remainingQ = Math.round(t * 4);
  const out: number[] = Array.from({ length: n }, () => 0);

  for (let i = 0; i < n; i++) {
    const w = Math.max(0, dayWeights[i] ?? 0);
    if (w <= 0 || remainingQ <= 0) continue;
    // Full Mon–Fri week → preferred hours; partial weeks scale by weekdays/5.
    const idealQ = Math.round(preferred * (w / 5) * 4);
    const takeQ = Math.min(idealQ, remainingQ);
    out[i] = takeQ / 4;
    remainingQ -= takeQ;
  }

  // Target above preferred×weeks: add leftover from the front (keep early weeks higher).
  if (remainingQ > 0) {
    for (let i = 0; i < n && remainingQ > 0; i++) {
      const w = Math.max(0, dayWeights[i] ?? 0);
      if (w <= 0) continue;
      out[i] = ((out[i] ?? 0) * 4 + 1) / 4;
      remainingQ -= 1;
      // Restart from front if we still have leftovers after one pass.
      if (i === n - 1 && remainingQ > 0) i = -1;
    }
  }

  return out;
}

export function parseQuarterStartYmd(
  ymd: string,
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): FiscalQuarterIdentity | null {
  const d = parseLocalYmd(ymd);
  if (Number.isNaN(d.getTime())) return null;
  const resolved = resolveFiscalQuarter(d, config);
  // Require the ymd to be the canonical quarter start (reject mid-quarter anchors as keys).
  if (resolved.quarterStartYmd !== ymd.slice(0, 10)) {
    // Still allow resolving from any day in the quarter when used as navigation anchor.
    return resolved;
  }
  return resolved;
}

/** Current Sunday week YMD containing todayYmd (local parse). */
export function currentSundayFromTodayYmd(todayYmd: string): string {
  const d = parseLocalYmd(todayYmd);
  if (Number.isNaN(d.getTime())) return todayYmd;
  return formatLocalYmd(startOfLocalWeekSunday(d));
}

export function weekRelativeToToday(
  weekStartYmd: string,
  todayYmd: string,
): "past" | "current" | "future" {
  const current = currentSundayFromTodayYmd(todayYmd);
  if (weekStartYmd < current) return "past";
  if (weekStartYmd > current) return "future";
  return "current";
}

/** Re-export bounds type for consumers. */
export type { EffortLocalPeriodBounds };

/** Next Sunday after a week start (for exclusive end of last week window). */
export function weekEndExclusiveYmd(weekStartYmd: string): string {
  return addDaysYmd(weekStartYmd, 7);
}
