import { InboxPageClient } from "@/components/inbox-page-client";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadOpenHomeInboxItems } from "@/lib/home-inbox-rules";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const prefsRes = await loadUserPreferences();
  const inboxItems = await loadOpenHomeInboxItems(supabase, user.id);

  return (
    <InboxPageClient initialItems={inboxItems} timezone={prefsRes.preferences.timezone} />
  );
}
