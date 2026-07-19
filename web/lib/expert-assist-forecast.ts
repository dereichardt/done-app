import { generateInitiativeForecastHours } from "@/lib/initiative-forecast";
import {
  type GenerateForecastResult,
  type ForecastStartMode,
} from "@/lib/project-forecast";

export function generateExpertAssistForecastHours(input: {
  startsOn: string;
  endsOn: string;
  estimatedEffortHours: number;
  actualHours: number;
  todayIso: string;
  startMode?: ForecastStartMode;
  lockedWeekStarts?: string[];
  existingHoursByWeek?: Record<string, number>;
}): GenerateForecastResult & { startDate: string } {
  const allocation = generateInitiativeForecastHours(input);
  return {
    startDate: allocation.startDate,
    weeks: allocation.weeks.map((week) => ({ startYmd: week, label: week })),
    hoursByWeek: allocation.hoursByWeek,
    reserveHours: 0,
    error: allocation.error?.replace("initiative", "Expert Assist"),
  };
}
