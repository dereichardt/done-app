import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Labels for finish-session UI and Work indicators (internal tasks). */
export async function loadInternalTaskFinishContextWithSupabase(
  supabase: Supabase,
  userId: string,
  internalTaskId: string,
): Promise<{ title: string; integrationLabel: string; projectName: string } | null> {
  const { data: task, error: taskErr } = await supabase
    .from("internal_tasks")
    .select("title, internal_track_id, internal_initiative_id")
    .eq("id", internalTaskId)
    .maybeSingle();
  if (taskErr || !task) return null;

  if (task.internal_track_id) {
    const { data: tr } = await supabase
      .from("internal_tracks")
      .select("kind, owner_id")
      .eq("id", task.internal_track_id)
      .maybeSingle();
    if (!tr || tr.owner_id !== userId) return null;
    const integrationLabel = tr.kind === "admin" ? "Admin" : "Development";
    return {
      title: task.title ?? "",
      integrationLabel,
      projectName: "Internal",
    };
  }

  if (task.internal_initiative_id) {
    const { data: inv } = await supabase
      .from("internal_initiatives")
      .select("title, owner_id")
      .eq("id", task.internal_initiative_id)
      .maybeSingle();
    if (!inv || inv.owner_id !== userId) return null;
    return {
      title: task.title ?? "",
      integrationLabel: inv.title?.trim() || "Initiative",
      projectName: "Internal",
    };
  }

  return null;
}
