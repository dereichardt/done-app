import { createClient } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadAllActiveForecastProjects } from "@/lib/forecast-data";
import { todayISO } from "@/lib/project-phase-status";
import { ForecastStudio } from "./forecast-studio";

type PageProps = {
  searchParams: Promise<{ project?: string }>;
};

export default async function ForecastPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const focusProjectId = typeof params.project === "string" ? params.project.trim() : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const prefsRes = await loadUserPreferences();
  const todayIso = todayISO(prefsRes.preferences.timezone);
  const projects = await loadAllActiveForecastProjects(supabase, user.id, {
    todayIso,
    timeZone: prefsRes.preferences.timezone,
  });

  return (
    <ForecastStudio
      projects={projects}
      todayIso={todayIso}
      deploymentEffortByPhase={prefsRes.preferences.deployment_effort_by_phase}
      focusProjectId={
        focusProjectId && projects.some((p) => p.id === focusProjectId) ? focusProjectId : null
      }
    />
  );
}
