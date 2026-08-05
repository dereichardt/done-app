/**
 * Time-off day types and helpers for capacity / pace adjustments.
 * Hours are derived from weekly capacity ÷ 5 (not stored per day).
 */

export const TIME_OFF_TYPES = ["pto", "company_holiday", "other"] as const;

export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

export type TimeOffDay = {
  dayYmd: string;
  offType: TimeOffType;
  otherLabel: string | null;
};

export const TIME_OFF_TYPE_LABELS: Record<TimeOffType, string> = {
  pto: "PTO",
  company_holiday: "Company Holiday",
  other: "Other",
};

export function isTimeOffType(value: unknown): value is TimeOffType {
  return typeof value === "string" && (TIME_OFF_TYPES as readonly string[]).includes(value);
}

/** Hours deducted for one full weekday of time off. */
export function timeOffHoursPerDay(weeklyCapacityHours: number): number {
  if (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours <= 0) return 0;
  return Math.round((weeklyCapacityHours / 5) * 4) / 4;
}

/**
 * Count Mon–Fri local days in [start, endExclusive) that appear in `timeOffYmds`.
 */
export function countTimeOffWeekdaysInRange(
  start: Date,
  endExclusive: Date,
  timeOffYmds: ReadonlySet<string>,
): number {
  if (timeOffYmds.size === 0) return 0;
  let count = 0;
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = new Date(
    endExclusive.getFullYear(),
    endExclusive.getMonth(),
    endExclusive.getDate(),
  );
  while (day < end) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = day.getFullYear();
      const m = String(day.getMonth() + 1).padStart(2, "0");
      const d = String(day.getDate()).padStart(2, "0");
      if (timeOffYmds.has(`${y}-${m}-${d}`)) count += 1;
    }
    day.setDate(day.getDate() + 1);
  }
  return count;
}

/**
 * Working weekday count after subtracting time off (floor at 0).
 * Used as dayWeights for paceHoursPerWeekWeighted.
 */
export function workingWeekdayWeight(
  weekdaysInOverlap: number,
  timeOffWeekdaysInOverlap: number,
): number {
  return Math.max(0, weekdaysInOverlap - Math.max(0, timeOffWeekdaysInOverlap));
}

/**
 * Per Sunday-week capacity after time off: weeklyCapacity * workingWeekdays / 5.
 */
export function weekCapacityAfterTimeOff(
  weeklyCapacityHours: number,
  workingWeekdays: number,
): number {
  if (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours <= 0) return 0;
  const w = Math.max(0, Math.min(5, workingWeekdays));
  return Math.round(weeklyCapacityHours * (w / 5) * 4) / 4;
}

/**
 * Build per-week capacity targets for Home availability.
 * `weekStarts` are Sunday YMD keys; each week is Sun–Sat (Mon–Fri work days).
 */
export function weekTargetsAfterTimeOff(args: {
  weekStarts: string[];
  weeklyCapacityHours: number;
  timeOffYmds: ReadonlySet<string>;
}): Record<string, number> {
  const { weekStarts, weeklyCapacityHours, timeOffYmds } = args;
  const out: Record<string, number> = {};
  for (const weekStart of weekStarts) {
    const [y, m, d] = weekStart.split("-").map(Number);
    if (![y, m, d].every(Number.isFinite)) {
      out[weekStart] = weeklyCapacityHours;
      continue;
    }
    const start = new Date(y!, m! - 1, d!);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    // Full week always has 5 Mon–Fri days; subtract time off within the week.
    const off = countTimeOffWeekdaysInRange(start, end, timeOffYmds);
    out[weekStart] = weekCapacityAfterTimeOff(weeklyCapacityHours, 5 - off);
  }
  return out;
}

export function formatTimeOffDayLabel(dayYmd: string): string {
  const [y, m, d] = dayYmd.split("-").map(Number);
  if (![y, m, d].every(Number.isFinite)) return dayYmd;
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
