import { HomeInboxSection } from "@/components/home-inbox-section";
import { HomeInsightsChat } from "@/components/home-insights-chat";
import { HomeQuickActions } from "@/components/home-quick-actions";
import { loadHomeProjectPickerRows } from "@/lib/actions/home";
import { isAiConfigured } from "@/lib/ai/client";
import { loadOpenHomeInboxItems, syncHomeInboxRules } from "@/lib/home-inbox-rules";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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
  const [inboxItems, projects] = await Promise.all([
    loadOpenHomeInboxItems(supabase, user.id),
    loadHomeProjectPickerRows(),
  ]);

  const aiConfigured = isAiConfigured();

  return (
    <div>
      <h1 className="heading-page">Home</h1>
      <p className="subheading-page mt-2">
        See what needs attention now, then continue execution on{" "}
        <Link href="/work" className="font-medium text-[var(--app-action)] underline">
          Work
        </Link>
        .
      </p>

      <HomeInsightsChat aiConfigured={aiConfigured} />

      <HomeQuickActions projects={projects} />

      <HomeInboxSection initialItems={inboxItems} />
    </div>
  );
}
