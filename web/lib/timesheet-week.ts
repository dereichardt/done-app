/**
 * Timesheet week boundaries use **Sunday 00:00 → next Sunday 00:00 (exclusive)** in the
 * user's local calendar. Do not use `effortPeriodBounds("week", …)` here — that helper is
 * Monday-based and would misalign columns with Sun–Sat headers.
 */

import {
  formatLocalYmd,
  localWeekDayStartsSunday,
  parseLocalYmd,
  startOfLocalWeekSunday,
} from "@/lib/integration-effort-buckets";

export type SundayWeekWindow = {
  /** Local Sunday 00:00 of the week containing the anchor day. */
  weekStart: Date;
  /** Local Sunday 00:00 of the following week (exclusive end for range queries). */
  weekEndExclusive: Date;
  /** Seven local midnights, Sunday → Saturday. */
  dayDates: Date[];
  dayYmcs: string[];
};

export function sundayWeekWindowFromAnchorYmd(anchorYmd: string): SundayWeekWindow {
  const anchor = parseLocalYmd(anchorYmd);
  const weekStart = startOfLocalWeekSunday(anchor);
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);
  const dayDates = localWeekDayStartsSunday(weekStart);
  const dayYmcs = dayDates.map(formatLocalYmd);
  return { weekStart, weekEndExclusive, dayDates, dayYmcs };
}
