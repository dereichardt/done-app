import { HomeActualsVsForecast } from "@/components/home-actuals-vs-forecast";
import { HomeCreateFab } from "@/components/home-create-fab";
import { HomeInsightsSection } from "@/components/home-insights-section";
import { HomeProgressGate } from "@/components/home-progress-gate";
import { HomeTopDashboard } from "@/components/home-top-dashboard";
import { loadHomeProjectPickerRows } from "@/lib/actions/home";
import { loadTasksPageSnapshot } from "@/lib/actions/tasks-page";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadHomeActualsVsForecast } from "@/lib/home-actuals-vs-forecast";
import { loadHomeInsights } from "@/lib/home-insights";
import { loadHomeSummary } from "@/lib/home-summary";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const [projects, summary, actualsVsForecast, insights, tasksRes] = await Promise.all([
    loadHomeProjectPickerRows(),
    loadHomeSummary(supabase, user.id, prefsRes.preferences),
    loadHomeActualsVsForecast(supabase, user.id, todayIso),
    loadHomeInsights(supabase, user.id, prefsRes.preferences),
    loadTasksPageSnapshot(),
  ]);

  return (
    <div>
      <HomeTopDashboard
        summary={summary}
        tasksSnapshot={tasksRes.snapshot ?? null}
        todayIso={todayIso}
      />

      <HomeActualsVsForecast data={actualsVsForecast} />

      <HomeInsightsSection data={insights} />

      <HomeProgressGate projects={projects} />

      <HomeCreateFab projects={projects} />
    </div>
  );
}
