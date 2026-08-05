import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadAllActiveForecastItems } from "@/lib/forecast-data";
import { todayISO } from "@/lib/project-phase-status";
import { ForecastStudio } from "./forecast-studio";

type PageProps = {
  searchParams: Promise<{ project?: string }>;
};

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

  return (
    <ForecastStudio
      projects={projects}
      todayIso={todayIso}
      deploymentEffortByPhase={prefsRes.preferences.deployment_effort_by_phase}
      weeklyCapacityHours={prefsRes.preferences.weekly_capacity_hours}
      focusProjectId={
        focusProjectId && projects.some((p) => p.id === focusProjectId) ? focusProjectId : null
      }
    />
  );
}
