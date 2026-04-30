import { SettingsForm } from "@/app/settings/settings-form";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const prefsRes = await loadUserPreferences();
  const timezoneOptions =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="heading-page">Settings</h1>
      <SettingsForm initialPreferences={prefsRes.preferences} timezoneOptions={timezoneOptions} />
    </div>
  );
}
