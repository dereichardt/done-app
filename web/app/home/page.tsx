import { HomeActualsVsForecast } from "@/components/home-actuals-vs-forecast";
import { HomeInboxGate } from "@/components/home-inbox-gate";
import { HomeSummaryStrip } from "@/components/home-summary-strip";
import { loadHomeProjectPickerRows } from "@/lib/actions/home";
import { loadHomeProjectStatus } from "@/lib/actions/home-project-status";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadHomeActualsVsForecast } from "@/lib/home-actuals-vs-forecast";
import { loadHomeSummary } from "@/lib/home-summary";
import { loadOpenHomeInboxItems, syncHomeInboxRules } from "@/lib/home-inbox-rules";
import { createClient } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    await syncHomeInboxRules(supabase, user.id);
  } catch (err) {
    console.error("[home] syncHomeInboxRules failed", err);
  }

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const [inboxItems, projects, summary, actualsVsForecast] = await Promise.all([
    loadOpenHomeInboxItems(supabase, user.id),
    loadHomeProjectPickerRows(),
    loadHomeSummary(supabase, user.id, prefsRes.preferences),
    loadHomeActualsVsForecast(supabase, user.id, todayIso),
  ]);

  const initialStatus = projects[0] ? await loadHomeProjectStatus(projects[0].id) : undefined;

  return (
    <div>
      <HomeSummaryStrip summary={summary} />

      <HomeActualsVsForecast data={actualsVsForecast} todayYmd={todayIso} />

      <HomeInboxGate
        projects={projects}
        initialItems={inboxItems}
        timezone={prefsRes.preferences.timezone}
        initialStatus={initialStatus}
      />
    </div>
  );
}
