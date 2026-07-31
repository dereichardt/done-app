import { HomeActualsVsForecast } from "@/components/home-actuals-vs-forecast";
import { HomeInboxGate } from "@/components/home-inbox-gate";
import { HomeTopDashboard } from "@/components/home-top-dashboard";
import { loadHomeProjectPickerRows } from "@/lib/actions/home";
import { loadTasksPageSnapshot } from "@/lib/actions/tasks-page";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadHomeActualsVsForecast } from "@/lib/home-actuals-vs-forecast";
import { loadHomeSummary } from "@/lib/home-summary";
import { loadOpenHomeInboxItems } from "@/lib/home-inbox-rules";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const [inboxItems, projects, summary, actualsVsForecast, tasksRes] = await Promise.all([
    loadOpenHomeInboxItems(supabase, user.id),
    loadHomeProjectPickerRows(),
    loadHomeSummary(supabase, user.id, prefsRes.preferences),
    loadHomeActualsVsForecast(supabase, user.id, todayIso),
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

      <HomeInboxGate
        projects={projects}
        initialItems={inboxItems}
        timezone={prefsRes.preferences.timezone}
      />
    </div>
  );
}
