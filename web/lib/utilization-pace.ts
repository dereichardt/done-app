/**
 * Per-week utilization pace for Forecast Studio (All projects target).
 * Quarters with a target contribute that week's paceHours (including 0).
 * Weeks in quarters without a target are omitted so callers can fall back to 32h.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clipLocalRange,
  paceHoursPerWeekWeighted,
  resolveFiscalQuarter,
  shiftFiscalQuarter,
  sundayWeeksOverlappingRange,
  weekOverlapInQuarter,
  type FiscalQuarterIdentity,
} from "@/lib/fiscal-quarter";
import {
  localDayStart,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import type { EffortQuarterConfig } from "@/lib/project-weekly-effort";
import { DEFAULT_EFFORT_QUARTER_CONFIG } from "@/lib/project-weekly-effort";
import {
  countTimeOffWeekdaysInRange,
  workingWeekdayWeight,
} from "@/lib/time-off";
import { sundayWeekWindowFromAnchorYmd } from "@/lib/timesheet-week";
import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/user-preferences";

export type PaceHoursByWeek = Record<string, number>;

type QuarterPaceCandidate = {
  hours: number;
  weekdays: number;
  calendarDays: number;
  quarterStartYmd: string;
};

function normalizeCapacity(weeklyCapacityHours: number): number {
  return Number.isFinite(weeklyCapacityHours) && weeklyCapacityHours > 0
    ? weeklyCapacityHours
    : DEFAULT_WEEKLY_CAPACITY_HOURS;
}

function workingWeightForWeek(
  weekStartYmd: string,
  quarterStart: Date,
  quarterEndExclusive: Date,
  timeOffYmds: ReadonlySet<string>,
): { weekdays: number; calendarDays: number; workingWeight: number } {
  const overlap = weekOverlapInQuarter(weekStartYmd, quarterStart, quarterEndExclusive);
  const { weekStart, weekEndExclusive } = sundayWeekWindowFromAnchorYmd(weekStartYmd);
  const clipped = clipLocalRange(
    weekStart,
    weekEndExclusive,
    localDayStart(quarterStart),
    localDayStart(quarterEndExclusive),
  );
  const offCount = clipped
    ? countTimeOffWeekdaysInRange(clipped.start, clipped.endExclusive, timeOffYmds)
    : 0;
  return {
    weekdays: overlap.weekdays,
    calendarDays: overlap.calendarDays,
    workingWeight: workingWeekdayWeight(overlap.days, offCount),
  };
}

function candidateIsBetter(next: QuarterPaceCandidate, current: QuarterPaceCandidate): boolean {
  if (next.weekdays !== current.weekdays) return next.weekdays > current.weekdays;
  if (next.calendarDays !== current.calendarDays) {
    return next.calendarDays > current.calendarDays;
  }
  return next.quarterStartYmd > current.quarterStartYmd;
}

/** Fiscal quarters whose Sunday-week lists intersect `weekStarts`. */
export function fiscalQuartersOverlappingWeeks(
  weekStarts: string[],
  config: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): FiscalQuarterIdentity[] {
  if (weekStarts.length === 0) return [];
  const weekSet = new Set(weekStarts);
  const byStart = new Map<string, FiscalQuarterIdentity>();

  for (const week of weekStarts) {
    const day = parseLocalYmd(week);
    if (Number.isNaN(day.getTime())) continue;
    const current = resolveFiscalQuarter(day, config);
    for (const identity of [
      shiftFiscalQuarter(current, -1, config),
      current,
      shiftFiscalQuarter(current, 1, config),
    ]) {
      byStart.set(identity.quarterStartYmd, identity);
    }
  }

  return [...byStart.values()]
    .filter((identity) =>
      sundayWeeksOverlappingRange(identity.start, identity.endExclusive).some((w) =>
        weekSet.has(w),
      ),
    )
    .sort((a, b) => a.quarterStartYmd.localeCompare(b.quarterStartYmd));
}

/**
 * Map Sunday week start → pace hours for weeks that belong to a quarter with
 * `targetHours > 0`. Exhausted weeks are `0` (not omitted). Untargeted quarters
 * are omitted so the caller can fall back to {@link DEFAULT_WEEKLY_CAPACITY_HOURS}.
 *
 * Boundary weeks that overlap two targeted quarters use the larger weekday overlap.
 */
export function paceHoursByWeek(input: {
  weekStarts: string[];
  quarterConfig?: EffortQuarterConfig;
  weeklyCapacityHours?: number;
  /** quarter_start_date → target hours; non-positive values are ignored. */
  quarterTargets: Record<string, number>;
  timeOffYmds?: ReadonlySet<string>;
}): PaceHoursByWeek {
  const weekStarts = input.weekStarts.filter((w) => w.length > 0);
  if (weekStarts.length === 0) return {};

  const config = input.quarterConfig ?? DEFAULT_EFFORT_QUARTER_CONFIG;
  const capacity = normalizeCapacity(input.weeklyCapacityHours ?? DEFAULT_WEEKLY_CAPACITY_HOURS);
  const timeOffYmds = input.timeOffYmds ?? new Set<string>();

  const identities = fiscalQuartersOverlappingWeeks(weekStarts, config);
  const candidatesByWeek = new Map<string, QuarterPaceCandidate[]>();

  for (const identity of identities) {
    const raw = input.quarterTargets[identity.quarterStartYmd];
    const target = Number.isFinite(raw) && (raw as number) > 0 ? Number(raw) : 0;
    if (target <= 0) continue;

    const quarterWeeks = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
    const dayWeights: number[] = [];
    const overlapByWeek = new Map<string, { weekdays: number; calendarDays: number }>();
    for (const w of quarterWeeks) {
      const weight = workingWeightForWeek(
        w,
        identity.start,
        identity.endExclusive,
        timeOffYmds,
      );
      dayWeights.push(weight.workingWeight);
      overlapByWeek.set(w, {
        weekdays: weight.weekdays,
        calendarDays: weight.calendarDays,
      });
    }
    const pace = paceHoursPerWeekWeighted(target, dayWeights, capacity);
    quarterWeeks.forEach((weekStartYmd, i) => {
      const overlap = overlapByWeek.get(weekStartYmd);
      const list = candidatesByWeek.get(weekStartYmd) ?? [];
      list.push({
        hours: pace[i] ?? 0,
        weekdays: overlap?.weekdays ?? 0,
        calendarDays: overlap?.calendarDays ?? 0,
        quarterStartYmd: identity.quarterStartYmd,
      });
      candidatesByWeek.set(weekStartYmd, list);
    });
  }

  const out: PaceHoursByWeek = {};
  for (const weekStartYmd of weekStarts) {
    const candidates = candidatesByWeek.get(weekStartYmd);
    if (!candidates || candidates.length === 0) continue;
    let best = candidates[0]!;
    for (let i = 1; i < candidates.length; i++) {
      const next = candidates[i]!;
      if (candidateIsBetter(next, best)) best = next;
    }
    out[weekStartYmd] = best.hours;
  }
  return out;
}

/** Portfolio target for a week: utilization pace when present (including 0), else 32h. */
export function portfolioWeekTargetHours(
  weekStartYmd: string,
  paceByWeek: PaceHoursByWeek,
  fallbackHours: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): number {
  if (Object.hasOwn(paceByWeek, weekStartYmd)) {
    const n = paceByWeek[weekStartYmd];
    return Number.isFinite(n) ? n! : fallbackHours;
  }
  return fallbackHours;
}

export async function loadPaceHoursByWeek(
  supabase: SupabaseClient,
  ownerId: string,
  weekStarts: string[],
  quarterConfig: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
  weeklyCapacityHours: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): Promise<PaceHoursByWeek> {
  if (weekStarts.length === 0) return {};

  const identities = fiscalQuartersOverlappingWeeks(weekStarts, quarterConfig);
  if (identities.length === 0) return {};

  const quarterStarts = identities.map((q) => q.quarterStartYmd);
  const windowStartYmd = identities[0]!.quarterStartYmd;
  const windowEndExclusiveYmd = identities[identities.length - 1]!.endExclusiveYmd;

  const [targetRes, timeOffRes] = await Promise.all([
    supabase
      .from("utilization_quarter_targets")
      .select("quarter_start_date, target_hours")
      .eq("owner_id", ownerId)
      .in("quarter_start_date", quarterStarts),
    supabase
      .from("time_off_days")
      .select("day_date")
      .eq("owner_id", ownerId)
      .gte("day_date", windowStartYmd)
      .lt("day_date", windowEndExclusiveYmd),
  ]);

  if (targetRes.error) {
    console.error("[utilization-pace] target load failed", targetRes.error);
  }
  if (timeOffRes.error) {
    console.error("[utilization-pace] time off load failed", timeOffRes.error);
  }

  const quarterTargets: Record<string, number> = {};
  for (const row of targetRes.data ?? []) {
    const start = String(row.quarter_start_date ?? "").slice(0, 10);
    const hours = Number(row.target_hours);
    if (start && Number.isFinite(hours) && hours > 0) {
      quarterTargets[start] = hours;
    }
  }

  const timeOffYmds = new Set(
    (timeOffRes.data ?? []).map((row) => String(row.day_date).slice(0, 10)),
  );

  return paceHoursByWeek({
    weekStarts,
    quarterConfig,
    weeklyCapacityHours,
    quarterTargets,
    timeOffYmds,
  });
}
