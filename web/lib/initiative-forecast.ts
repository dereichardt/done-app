import {
  actualsHoursConsumed,
  currentSundayWeekYmd,
  forecastStartSundayYmd,
  type ForecastStartMode,
} from "@/lib/project-forecast";
import { sundayWeekStartsInclusive } from "@/lib/project-weekly-effort";

export const INITIATIVE_FORECAST_ROW_KEY = "initiative";

export type InitiativeForecastAllocation = {
  startDate: string;
  weeks: string[];
  hoursByWeek: Record<string, number>;
  availableHours: number;
  error?: string;
};

export function generateInitiativeForecastHours(input: {
  startsOn: string;
  endsOn: string;
  estimatedEffortHours: number;
  actualHours: number;
  todayIso: string;
  startMode?: ForecastStartMode;
  lockedWeekStarts?: string[];
  existingHoursByWeek?: Record<string, number>;
}): InitiativeForecastAllocation {
  const currentSunday = currentSundayWeekYmd(input.todayIso);
  const startDate = forecastStartSundayYmd(
    input.todayIso,
    input.startMode ?? "this_week",
  );
  const allWeeks = sundayWeekStartsInclusive(input.startsOn, input.endsOn);
  const weeks = allWeeks.filter((week) => week >= startDate);
  const estimate = Math.max(0, Math.round(Number(input.estimatedEffortHours) || 0));
  const locked = new Set(input.lockedWeekStarts ?? []);
  let committedForecastHours = 0;
  for (const [week, hours] of Object.entries(input.existingHoursByWeek ?? {})) {
    const beforeRegenerationStart =
      week >= currentSunday && week < startDate;
    if (
      beforeRegenerationStart ||
      (week >= startDate && locked.has(week))
    ) {
      committedForecastHours += Math.max(0, Math.round(hours));
    }
  }
  const availableHours = Math.max(
    0,
    estimate -
      actualsHoursConsumed(input.actualHours) -
      committedForecastHours,
  );
  const hoursByWeek: Record<string, number> = {};

  if (estimate <= 0) {
    return { startDate, weeks, hoursByWeek, availableHours, error: "A positive estimate is required." };
  }
  if (weeks.length === 0) {
    return {
      startDate,
      weeks,
      hoursByWeek,
      availableHours,
      error: "The initiative has no current or future forecast weeks.",
    };
  }

  for (const week of weeks) {
    if (!locked.has(week)) continue;
    const hours = Math.max(0, Math.round(input.existingHoursByWeek?.[week] ?? 0));
    if (hours > 0) hoursByWeek[week] = hours;
  }

  const remaining = availableHours;
  const writableWeeks = weeks.filter((week) => !locked.has(week));
  if (writableWeeks.length === 0) {
    return { startDate, weeks, hoursByWeek, availableHours };
  }

  const base = Math.floor(remaining / writableWeeks.length);
  let remainder = remaining - base * writableWeeks.length;
  for (const week of writableWeeks) {
    const hours = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    if (hours > 0) hoursByWeek[week] = hours;
  }

  return { startDate, weeks, hoursByWeek, availableHours };
}
