import { HomeActualsVsForecast } from "@/components/home-actuals-vs-forecast";
import { HomeInboxGate } from "@/components/home-inbox-gate";
import { HomeSummaryStrip } from "@/components/home-summary-strip";
import { loadHomeProjectPickerRows } from "@/lib/actions/home";
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
  const [inboxItems, projects, summary, actualsVsForecast] = await Promise.all([
    loadOpenHomeInboxItems(supabase, user.id),
    loadHomeProjectPickerRows(),
    loadHomeSummary(supabase, user.id, prefsRes.preferences),
    loadHomeActualsVsForecast(supabase, user.id, todayIso),
  ]);

  return (
    <div>
      <HomeSummaryStrip summary={summary} />

      <HomeActualsVsForecast data={actualsVsForecast} />

      <HomeInboxGate
        projects={projects}
        initialItems={inboxItems}
        timezone={prefsRes.preferences.timezone}
      />
    </div>
  );
}
