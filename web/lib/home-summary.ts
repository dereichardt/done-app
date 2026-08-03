import type { SupabaseClient } from "@supabase/supabase-js";

import { loadTasksCalendarSessions } from "@/lib/actions/tasks-calendar";
import { effortPeriodTotalHours } from "@/lib/integration-effort-buckets";
import { loadUtilizationQuarter } from "@/lib/utilization-data";
import type { UserPreferences } from "@/lib/user-preferences";
import { getUserTodayIso } from "@/lib/user-preferences";
import { addDaysYmd, sundayYmdOfWeekContaining, zonedSundayWeekBounds } from "@/lib/zoned-datetime";

export type HomeSummaryUtilization = {
  /** e.g. FY27 Q3 */
  label: string;
  targetHours: number | null;
  actualHours: number;
  forecastHours: number;
  /** Actuals ÷ target × 100; null when no target. */
  attainmentPct: number | null;
};

export type HomeSummary = {
  activeProjects: number;
  integrations: number;
  activeInitiatives: number;
  weekHours: number;
  utilization: HomeSummaryUtilization;
};

function utcMidnightBoundsFallback(todayYmd: string): {
  weekStart: Date;
  weekEndExclusive: Date;
  weekStartIso: string;
  weekEndExclusiveIso: string;
} {
  const sun = sundayYmdOfWeekContaining(todayYmd);
  const next = addDaysYmd(sun, 7);
  const weekStart = new Date(`${sun}T00:00:00.000Z`);
  const weekEndExclusive = new Date(`${next}T00:00:00.000Z`);
  return {
    weekStart,
    weekEndExclusive,
    weekStartIso: weekStart.toISOString(),
    weekEndExclusiveIso: weekEndExclusive.toISOString(),
  };
}

export async function loadHomeSummary(
  supabase: SupabaseClient,
  ownerId: string,
  preferences: UserPreferences,
): Promise<HomeSummary> {
  const tz = preferences.timezone;
  const todayYmd = getUserTodayIso(tz);
  let bounds = zonedSundayWeekBounds(tz, todayYmd);
  if (Number.isNaN(bounds.weekStart.getTime()) || Number.isNaN(bounds.weekEndExclusive.getTime())) {
    bounds = utcMidnightBoundsFallback(todayYmd);
  }

  const [{ data: activeProjectRows, error: projErr }, { count: initiativeCount, error: iniErr }] =
    await Promise.all([
      supabase.from("projects").select("id").eq("owner_id", ownerId).is("completed_at", null),
      supabase
        .from("internal_initiatives")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .is("completed_at", null),
    ]);

  if (projErr) {
    console.error("[home-summary] projects load failed", projErr);
  }
  if (iniErr) {
    console.error("[home-summary] initiatives count failed", iniErr);
  }

  const projectIds = (activeProjectRows ?? []).map((r) => r.id as string);
  const activeProjects = projectIds.length;

  let integrations = 0;
  if (projectIds.length > 0) {
    const { count: integCount, error: integErr } = await supabase
      .from("project_integrations")
      .select("*", { count: "exact", head: true })
      .in("project_id", projectIds)
      .neq("integration_state", "removed_from_scope");
    if (integErr) {
      console.error("[home-summary] integrations count failed", integErr);
    } else {
      integrations = integCount ?? 0;
    }
  }

  const cal = await loadTasksCalendarSessions(bounds.weekStartIso, bounds.weekEndExclusiveIso);
  let weekHours = 0;
  if (cal.error) {
    console.error("[home-summary] calendar sessions failed", cal.error);
  } else if (cal.sessions?.length) {
    weekHours = effortPeriodTotalHours(cal.sessions, bounds.weekStart, bounds.weekEndExclusive);
  }

  const utilizationDto = await loadUtilizationQuarter(
    supabase,
    ownerId,
    todayYmd,
    { startMonth: preferences.effort_quarter_start_month },
  );

  return {
    activeProjects,
    integrations,
    activeInitiatives: initiativeCount ?? 0,
    weekHours,
    utilization: {
      label: utilizationDto.label,
      targetHours: utilizationDto.targetHours,
      actualHours: utilizationDto.actualHours,
      forecastHours: utilizationDto.forecastHours,
      attainmentPct: utilizationDto.utilizationPct,
    },
  };
}
