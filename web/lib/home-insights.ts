/**
 * Home Insights: quarter pulse (utilization) + upcoming capacity availability
 * + Tasks/Meetings and Billable/Internal effort breakdowns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  capacityGapWeekStarts,
  synthesizeCapacityGaps,
  TARGET_WEEKLY_CAPACITY_HOURS,
  type CapacityGapsSynthesis,
} from "@/lib/home-capacity-gaps";
import {
  loadHomeEffortBreakdowns,
  type HomeEffortBreakdownsDTO,
} from "@/lib/home-effort-breakdowns";
import { currentSundayWeekYmd } from "@/lib/project-forecast";
import type { UserPreferences } from "@/lib/user-preferences";
import { getUserTodayIso } from "@/lib/user-preferences";
import {
  loadUtilizationQuarter,
  type UtilizationQuarterDTO,
} from "@/lib/utilization-data";

export type HomeInsightsDTO = {
  quarter: UtilizationQuarterDTO;
  capacity: CapacityGapsSynthesis;
  weeklyCapacityTarget: number;
  breakdowns: HomeEffortBreakdownsDTO;
};

/**
 * Portfolio forecast hours for capacity-gap weeks (+4…+8), then synthesize availability.
 */
export async function loadCapacityGapsSynthesis(
  supabase: SupabaseClient,
  ownerId: string,
  todayIso: string,
): Promise<CapacityGapsSynthesis> {
  const currentSunday = currentSundayWeekYmd(todayIso);
  const gapWeeks = capacityGapWeekStarts(currentSunday);

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", ownerId)
    .is("completed_at", null);

  const projectIds = (projects ?? []).map((p) => p.id as string);
  const { data: initiatives } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("include_in_forecast", true)
    .is("completed_at", null);
  const initiativeIds = (initiatives ?? []).map((row) => row.id as string);

  if (projectIds.length === 0 && initiativeIds.length === 0) {
    return synthesizeCapacityGaps({ weekHours: {}, weekStarts: gapWeeks });
  }

  const gapStart = gapWeeks[0]!;
  const gapEnd = gapWeeks[gapWeeks.length - 1]!;
  const [{ data: hoursRows }, { data: initiativeHoursRows }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ week_start_date: string; hours: number }> })
      : supabase
          .from("project_forecast_hours")
          .select("week_start_date, hours")
          .in("project_id", projectIds)
          .gte("week_start_date", gapStart)
          .lte("week_start_date", gapEnd),
    initiativeIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ week_start_date: string; hours: number }> })
      : supabase
          .from("initiative_forecast_hours")
          .select("week_start_date, hours")
          .in("initiative_id", initiativeIds)
          .gte("week_start_date", gapStart)
          .lte("week_start_date", gapEnd),
  ]);

  const weekHours: Record<string, number> = {};
  for (const w of gapWeeks) weekHours[w] = 0;
  for (const row of [...(hoursRows ?? []), ...(initiativeHoursRows ?? [])]) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!(week in weekHours)) continue;
    weekHours[week] = (weekHours[week] ?? 0) + Math.max(0, Math.round(Number(row.hours) || 0));
  }

  return synthesizeCapacityGaps({ weekHours, weekStarts: gapWeeks });
}

export async function loadHomeInsights(
  supabase: SupabaseClient,
  ownerId: string,
  preferences: UserPreferences,
): Promise<HomeInsightsDTO> {
  const todayIso = getUserTodayIso(preferences.timezone);
  const quarterConfig = {
    startMonth: preferences.effort_quarter_start_month,
  };

  const [quarter, capacity, breakdowns] = await Promise.all([
    loadUtilizationQuarter(supabase, ownerId, todayIso, quarterConfig),
    loadCapacityGapsSynthesis(supabase, ownerId, todayIso),
    loadHomeEffortBreakdowns(supabase, ownerId, todayIso, quarterConfig),
  ]);

  return {
    quarter,
    capacity,
    weeklyCapacityTarget: TARGET_WEEKLY_CAPACITY_HOURS,
    breakdowns,
  };
}
