export const WEEKDAY_VALUES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayValue = (typeof WEEKDAY_VALUES)[number];

export const DEFAULT_ACTIVITY_SUMMARY_DAY: WeekdayValue = "friday";
export const DEFAULT_FORECAST_REVIEW_DAY: WeekdayValue = "monday";

export type UserPreferences = {
  timezone: string | null;
  activity_summary_day: WeekdayValue;
  forecast_review_day: WeekdayValue;
};

export function isWeekdayValue(value: string): value is WeekdayValue {
  return WEEKDAY_VALUES.includes(value as WeekdayValue);
}

export function normalizeTimezone(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getUserTodayIso(timezone: string | null | undefined): string {
  if (!timezone) return new Date().toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to UTC date when an unsupported timezone is encountered.
  }
  return new Date().toISOString().slice(0, 10);
}
