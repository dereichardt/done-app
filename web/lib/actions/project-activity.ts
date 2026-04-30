"use server";

import { loadProjectActivity, type ActivityEvent } from "@/lib/project-activity";
import { createClient } from "@/lib/supabase/server";

/**
 * Paginates through project activity events using a `beforeIso` cursor
 * (the `occurredAt` of the oldest already-loaded event).
 * Auth + ownership verified before fetching.
 */
export async function loadMoreProjectActivity(
  projectId: string,
  beforeIso: string,
): Promise<{ events: ActivityEvent[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { events: [], error: "Not signed in" };

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { events: [], error: "Project not found" };

  const events = await loadProjectActivity(projectId, { before: beforeIso });
  return { events };
}
