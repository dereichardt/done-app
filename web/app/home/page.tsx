import { HomeInboxSection } from "@/components/home-inbox-section";
import { HomeQuickActions } from "@/components/home-quick-actions";
import { HomeSummaryStrip } from "@/components/home-summary-strip";
import { loadHomeProjectPickerRows } from "@/lib/actions/home";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadHomeSummary } from "@/lib/home-summary";
import { loadOpenHomeInboxItems, syncHomeInboxRules } from "@/lib/home-inbox-rules";
import { createClient } from "@/lib/supabase/server";

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
  const [inboxItems, projects, summary] = await Promise.all([
    loadOpenHomeInboxItems(supabase, user.id),
    loadHomeProjectPickerRows(),
    loadHomeSummary(supabase, user.id, prefsRes.preferences),
  ]);

  return (
    <div>
      <h1 className="heading-page">Home</h1>

      <HomeSummaryStrip summary={summary} />

      <HomeInboxSection initialItems={inboxItems} timezone={prefsRes.preferences.timezone} />

      <HomeQuickActions projects={projects} />
    </div>
  );
}
