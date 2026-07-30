import type { SupabaseClient } from "@supabase/supabase-js";
import { isRemovedFromScope } from "@/lib/integration-metadata";

/**
 * Side effects when an integration first enters `removed_from_scope`:
 * stop timers on open tasks, hard-delete those open tasks.
 * Done tasks and logged hours are left intact.
 */
export async function applyEnteringRemovedFromScope(
  supabase: SupabaseClient,
  projectIntegrationId: string,
  _ownerId: string,
): Promise<{ error?: string }> {
  const { data: tracks, error: trackErr } = await supabase
    .from("project_tracks")
    .select("id")
    .eq("project_integration_id", projectIntegrationId)
    .eq("kind", "integration");

  if (trackErr) return { error: trackErr.message };

  const trackIds = (tracks ?? []).map((t) => t.id).filter(Boolean);
  if (trackIds.length > 0) {
    const { data: openTasks, error: openErr } = await supabase
      .from("integration_tasks")
      .select("id")
      .in("project_track_id", trackIds)
      .eq("status", "open");

    if (openErr) return { error: openErr.message };

    const openTaskIds = (openTasks ?? []).map((t) => t.id).filter(Boolean);
    if (openTaskIds.length > 0) {
      const { error: sessionErr } = await supabase
        .from("integration_task_active_work_sessions")
        .delete()
        .in("integration_task_id", openTaskIds);
      if (sessionErr) return { error: sessionErr.message };

      const { error: deleteErr } = await supabase
        .from("integration_tasks")
        .delete()
        .in("id", openTaskIds);
      if (deleteErr) return { error: deleteErr.message };
    }
  }

  return {};
}

/** Run side effects only when transitioning into removed_from_scope. */
export async function maybeApplyEnteringRemovedFromScope(
  supabase: SupabaseClient,
  args: {
    projectIntegrationId: string;
    ownerId: string;
    previousState: string | null | undefined;
    nextState: string;
  },
): Promise<{ error?: string }> {
  if (!isRemovedFromScope(args.nextState)) return {};
  if (isRemovedFromScope(args.previousState)) return {};
  return applyEnteringRemovedFromScope(supabase, args.projectIntegrationId, args.ownerId);
}
