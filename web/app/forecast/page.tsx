import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadAllActiveForecastItems } from "@/lib/forecast-data";
import { todayISO } from "@/lib/project-phase-status";
import { sundayWeekStartsInclusive } from "@/lib/project-weekly-effort";
import { loadPaceHoursByWeek } from "@/lib/utilization-pace";
import { ForecastStudio } from "./forecast-studio";

type PageProps = {
  searchParams: Promise<{ project?: string }>;
};

function studioWeekStarts(
  projects: Array<{ timelineStartYmd: string | null; timelineEndYmd: string | null }>,
): string[] {
  let min: string | null = null;
  let max: string | null = null;
  for (const p of projects) {
    if (p.timelineStartYmd && (!min || p.timelineStartYmd < min)) min = p.timelineStartYmd;
    if (p.timelineEndYmd && (!max || p.timelineEndYmd > max)) max = p.timelineEndYmd;
  }
  if (!min || !max) return [];
  return sundayWeekStartsInclusive(min, max);
}

export default async function ForecastPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const focusProjectId = typeof params.project === "string" ? params.project.trim() : null;

  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const prefsRes = await loadUserPreferences();
  const todayIso = todayISO(prefsRes.preferences.timezone);
  const projects = await loadAllActiveForecastItems(supabase, user.id, {
    todayIso,
    timeZone: prefsRes.preferences.timezone,
  });
  const paceHoursByWeek = await loadPaceHoursByWeek(
    supabase,
    user.id,
    studioWeekStarts(projects),
    { startMonth: prefsRes.preferences.effort_quarter_start_month },
    prefsRes.preferences.weekly_capacity_hours,
  );

  return (
    <ForecastStudio
      projects={projects}
      todayIso={todayIso}
      deploymentEffortByPhase={prefsRes.preferences.deployment_effort_by_phase}
      paceHoursByWeek={paceHoursByWeek}
      focusProjectId={
        focusProjectId && projects.some((p) => p.id === focusProjectId) ? focusProjectId : null
      }
    />
  );
}
