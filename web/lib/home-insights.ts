/**
 * Home Insights: quarter pulse (utilization) + upcoming capacity availability
 * + Tasks/Meetings and Billable/Internal effort breakdowns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  capacityWindowWeekStarts,
  synthesizeCapacityGaps,
  type CapacityGapsSynthesis,
} from "@/lib/home-capacity-gaps";
import {
  loadHomeEffortBreakdowns,
  type HomeEffortBreakdownsDTO,
} from "@/lib/home-effort-breakdowns";
import {
  resolveFiscalQuarter,
  sundayWeeksOverlappingRange,
} from "@/lib/fiscal-quarter";
import { currentSundayWeekYmd } from "@/lib/project-forecast";
import type { EffortQuarterConfig } from "@/lib/project-weekly-effort";
import { weekTargetsAfterTimeOff } from "@/lib/time-off";
import {
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  type UserPreferences,
  getUserTodayIso,
} from "@/lib/user-preferences";
import { parseLocalYmd } from "@/lib/integration-effort-buckets";
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

async function loadTimeOffYmds(
  supabase: SupabaseClient,
  ownerId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("time_off_days")
    .select("day_date")
    .eq("owner_id", ownerId)
    .gte("day_date", startYmd)
    .lt("day_date", endExclusiveYmd);

  if (error) {
    console.error("[home-insights] time off load failed", error);
    return new Set();
  }
  return new Set((data ?? []).map((row) => String(row.day_date).slice(0, 10)));
}

/**
 * Portfolio forecast hours for capacity-gap weeks (+1 … quarter end), then synthesize pockets.
 */
export async function loadCapacityGapsSynthesis(
  supabase: SupabaseClient,
  ownerId: string,
  todayIso: string,
  quarterConfig: EffortQuarterConfig,
  weeklyCapacityHours: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): Promise<CapacityGapsSynthesis> {
  const capacity =
    Number.isFinite(weeklyCapacityHours) && weeklyCapacityHours > 0
      ? weeklyCapacityHours
      : DEFAULT_WEEKLY_CAPACITY_HOURS;
  const currentSunday = currentSundayWeekYmd(todayIso);
  const anchor = parseLocalYmd(todayIso);
  const identity = resolveFiscalQuarter(
    Number.isNaN(anchor.getTime()) ? new Date() : anchor,
    quarterConfig,
  );
  const quarterWeeks = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
  const gapWeeks = capacityWindowWeekStarts(currentSunday, quarterWeeks);

  const empty = (weekTargets?: Record<string, number>) =>
    synthesizeCapacityGaps({
      weekHours: {},
      weekStarts: gapWeeks,
      currentSundayYmd: currentSunday,
      quarterLabel: identity.label,
      targetHours: capacity,
      weekTargets,
    });

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

  if (gapWeeks.length === 0) {
    return empty();
  }

  const gapStart = gapWeeks[0]!;
  const gapEnd = gapWeeks[gapWeeks.length - 1]!;
  // Time-off window: from first gap week Sunday through end of last gap week.
  const [y, m, d] = gapEnd.split("-").map(Number);
  const lastWeekEnd = new Date(y!, m! - 1, d!);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
  const gapEndExclusiveYmd = [
    lastWeekEnd.getFullYear(),
    String(lastWeekEnd.getMonth() + 1).padStart(2, "0"),
    String(lastWeekEnd.getDate()).padStart(2, "0"),
  ].join("-");

  if (projectIds.length === 0 && initiativeIds.length === 0) {
    const timeOffYmds = await loadTimeOffYmds(
      supabase,
      ownerId,
      gapStart,
      gapEndExclusiveYmd,
    );
    return empty(
      weekTargetsAfterTimeOff({
        weekStarts: gapWeeks,
        weeklyCapacityHours: capacity,
        timeOffYmds,
      }),
    );
  }

  const [{ data: hoursRows }, { data: initiativeHoursRows }, timeOffYmds] = await Promise.all([
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
    loadTimeOffYmds(supabase, ownerId, gapStart, gapEndExclusiveYmd),
  ]);

  const weekHours: Record<string, number> = {};
  for (const w of gapWeeks) weekHours[w] = 0;
  for (const row of [...(hoursRows ?? []), ...(initiativeHoursRows ?? [])]) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!(week in weekHours)) continue;
    weekHours[week] = (weekHours[week] ?? 0) + Math.max(0, Math.round(Number(row.hours) || 0));
  }

  const weekTargets = weekTargetsAfterTimeOff({
    weekStarts: gapWeeks,
    weeklyCapacityHours: capacity,
    timeOffYmds,
  });

  return synthesizeCapacityGaps({
    weekHours,
    weekStarts: gapWeeks,
    currentSundayYmd: currentSunday,
    quarterLabel: identity.label,
    targetHours: capacity,
    weekTargets,
  });
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
  const weeklyCapacity =
    preferences.weekly_capacity_hours ?? DEFAULT_WEEKLY_CAPACITY_HOURS;

  const [quarter, capacity, breakdowns] = await Promise.all([
    loadUtilizationQuarter(
      supabase,
      ownerId,
      todayIso,
      quarterConfig,
      null,
      weeklyCapacity,
    ),
    loadCapacityGapsSynthesis(
      supabase,
      ownerId,
      todayIso,
      quarterConfig,
      weeklyCapacity,
    ),
    loadHomeEffortBreakdowns(supabase, ownerId, todayIso, quarterConfig),
  ]);

  return {
    quarter,
    capacity,
    weeklyCapacityTarget: weeklyCapacity,
    breakdowns,
  };
}
