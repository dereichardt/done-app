/**
 * Portfolio capacity gap synthesis for Home Insights.
 * Scans upcoming Sunday weeks (+1 … end of current effort quarter) vs weekly target.
 */

import { addDaysYmd } from "@/lib/zoned-datetime";

export const TARGET_WEEKLY_CAPACITY_HOURS = 32;
/** Sustained open capacity requires at least this many consecutive under-target weeks. */
export const MIN_POCKET_WEEKS = 2;

export type CapacityWeekGap = {
  weekStart: string;
  portfolioHours: number;
  /** Hours under the weekly target (0 when at/over capacity). */
  freeHours: number;
  /** Capacity target for this week (after time off). */
  targetHours: number;
};

export type CapacityPocket = {
  weeks: CapacityWeekGap[];
  startWeek: string;
  endWeek: string;
  freeHoursPerWeek: number;
  /** Sunday-week offset from the current week (1 = next week). */
  weeksOut: number;
};

export type CapacityGapsSynthesis = {
  /** All weeks in the scan window (+1 … quarter end). */
  weeks: CapacityWeekGap[];
  /** Sustained under-target stretches (≥ {@link MIN_POCKET_WEEKS} weeks), earliest first. */
  pockets: CapacityPocket[];
  /** e.g. FY27 Q3 — used in empty/tight copy. */
  quarterLabel: string;
  /** Earliest pocket start, or null when none. */
  freeStartingWeek: string | null;
  /** Average free hours/week for the earliest pocket. */
  freeHoursPerWeek: number | null;
  /** Default body for the earliest pocket (or empty-state copy). */
  body: string;
};

export function formatCapacityWeekLabel(weekStartYmd: string): string {
  const [y, m, d] = weekStartYmd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return weekStartYmd;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** Whole Sunday-week steps from `fromSundayYmd` to `toSundayYmd`. */
export function sundayWeekOffset(fromSundayYmd: string, toSundayYmd: string): number {
  const [y1, m1, d1] = fromSundayYmd.split("-").map(Number);
  const [y2, m2, d2] = toSundayYmd.split("-").map(Number);
  if (![y1, m1, d1, y2, m2, d2].every(Number.isFinite)) return 0;
  const a = Date.UTC(y1!, m1! - 1, d1!);
  const b = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((b - a) / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Upcoming Sunday weeks in the quarter: from next week (+1) through the last
 * Sunday week that overlaps the quarter.
 */
export function capacityWindowWeekStarts(
  currentSundayYmd: string,
  quarterWeekStarts: string[],
): string[] {
  const nextSunday = addDaysYmd(currentSundayYmd, 7);
  return quarterWeekStarts.filter((w) => w >= nextSunday);
}

export function findCapacityPockets(
  weeks: CapacityWeekGap[],
  currentSundayYmd: string,
  minWeeks: number = MIN_POCKET_WEEKS,
): CapacityPocket[] {
  const pockets: CapacityPocket[] = [];
  let i = 0;
  while (i < weeks.length) {
    if (weeks[i]!.freeHours <= 0) {
      i += 1;
      continue;
    }
    let j = i;
    let freeSum = 0;
    while (j < weeks.length && weeks[j]!.freeHours > 0) {
      freeSum += weeks[j]!.freeHours;
      j += 1;
    }
    const len = j - i;
    if (len >= minWeeks) {
      const slice = weeks.slice(i, j);
      const startWeek = slice[0]!.weekStart;
      pockets.push({
        weeks: slice,
        startWeek,
        endWeek: slice[slice.length - 1]!.weekStart,
        freeHoursPerWeek: Math.round(freeSum / len),
        weeksOut: sundayWeekOffset(currentSundayYmd, startWeek),
      });
    }
    i = j;
  }
  return pockets;
}

export function capacityPocketRangeLabel(pocket: CapacityPocket): string {
  const start = formatCapacityWeekLabel(pocket.startWeek);
  if (pocket.startWeek === pocket.endWeek) return start;
  return `${start}–${formatCapacityWeekLabel(pocket.endWeek)}`;
}

export function capacityPocketHeadline(pocket: CapacityPocket): string {
  if (pocket.weeksOut <= 1) return "Open capacity next week";
  if (pocket.weeksOut === 2) return "Open capacity in 2 weeks";
  return `Open capacity in ${pocket.weeksOut} weeks`;
}

export function capacityPocketBody(
  pocket: CapacityPocket,
  targetHours: number = TARGET_WEEKLY_CAPACITY_HOURS,
): string {
  const label = formatCapacityWeekLabel(pocket.startWeek);
  const hrs = pocket.freeHoursPerWeek;
  const nearTerm = pocket.weeksOut <= 2;
  let suggestion: string;
  if (hrs >= 8) {
    suggestion = `room for a new project (~${hrs}h/week) starting ${label}`;
  } else if (hrs >= 4) {
    suggestion = `room for more integrations and/or a light new project (~${hrs}h/week) starting ${label}`;
  } else {
    suggestion = `about ${hrs}h/week free starting ${label} — limited headroom`;
  }
  if (nearTerm) {
    return `Pick up billable work soon — you may have ${suggestion}.`;
  }
  return `You may have ${suggestion}.`;
}

export function synthesizeCapacityGaps(input: {
  weekHours: Record<string, number>;
  weekStarts: string[];
  currentSundayYmd: string;
  quarterLabel: string;
  /** Scalar weekly target when weekTargets is omitted. */
  targetHours?: number;
  /** Per-week capacity after time off (Sunday week start → hours). */
  weekTargets?: Record<string, number>;
}): CapacityGapsSynthesis {
  const defaultTarget = input.targetHours ?? TARGET_WEEKLY_CAPACITY_HOURS;
  const weeks: CapacityWeekGap[] = input.weekStarts.map((weekStart) => {
    const portfolioHours = Math.max(0, Math.round(Number(input.weekHours[weekStart]) || 0));
    const target =
      input.weekTargets != null && Number.isFinite(input.weekTargets[weekStart])
        ? Math.max(0, input.weekTargets[weekStart]!)
        : defaultTarget;
    const freeHours = Math.max(0, target - portfolioHours);
    return { weekStart, portfolioHours, freeHours, targetHours: target };
  });

  const hasAnyForecast = weeks.some((w) => w.portfolioHours > 0);
  const pockets = findCapacityPockets(weeks, input.currentSundayYmd);
  const earliest = pockets[0] ?? null;

  if (weeks.length === 0) {
    return {
      weeks,
      pockets: [],
      quarterLabel: input.quarterLabel,
      freeStartingWeek: null,
      freeHoursPerWeek: null,
      body: `No upcoming weeks left in ${input.quarterLabel}.`,
    };
  }

  if (!hasAnyForecast) {
    return {
      weeks,
      pockets: [],
      quarterLabel: input.quarterLabel,
      freeStartingWeek: null,
      freeHoursPerWeek: null,
      body: "No forecast hours in upcoming weeks. Generate project forecasts to see capacity.",
    };
  }

  if (earliest == null) {
    return {
      weeks,
      pockets: [],
      quarterLabel: input.quarterLabel,
      freeStartingWeek: null,
      freeHoursPerWeek: null,
      body: `No sustained open capacity (2+ weeks under target) through ${input.quarterLabel}.`,
    };
  }

  return {
    weeks,
    pockets,
    quarterLabel: input.quarterLabel,
    freeStartingWeek: earliest.startWeek,
    freeHoursPerWeek: earliest.freeHoursPerWeek,
    body: capacityPocketBody(earliest, defaultTarget),
  };
}
