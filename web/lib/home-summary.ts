import type { SupabaseClient } from "@supabase/supabase-js";

import { loadTasksCalendarSessions } from "@/lib/actions/tasks-calendar";
import { effortPeriodTotalHours } from "@/lib/integration-effort-buckets";
import type { UserPreferences } from "@/lib/user-preferences";
import { getUserTodayIso } from "@/lib/user-preferences";
import { addDaysYmd, mondayYmdOfWeekContaining, zonedMondayWeekBounds } from "@/lib/zoned-datetime";

export type HomeSummary = {
  activeProjects: number;
  integrations: number;
  activeInitiatives: number;
  weekHours: number;
};

function utcMidnightBoundsFallback(todayYmd: string): {
  weekStart: Date;
  weekEndExclusive: Date;
  weekStartIso: string;
  weekEndExclusiveIso: string;
} {
  const mon = mondayYmdOfWeekContaining(todayYmd);
  const next = addDaysYmd(mon, 7);
  const weekStart = new Date(`${mon}T00:00:00.000Z`);
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
  let bounds = zonedMondayWeekBounds(tz, todayYmd);
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
      .in("project_id", projectIds);
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

  return {
    activeProjects,
    integrations,
    activeInitiatives: initiativeCount ?? 0,
    weekHours,
  };
}
