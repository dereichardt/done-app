"use server";

import { createClient } from "@/lib/supabase/server";
import {
  SUMMARY_RANGE_PRESETS,
  type ProjectSummaryRecord,
  type SummaryRangePreset,
} from "@/lib/project-summaries";

type LoadResult =
  | { ok: false; error: string }
  | {
      ok: true;
      summaries: ProjectSummaryRecord[];
      /** Latest `range_end` across unexpired rows, used to power the "Since last summary" preset. */
      sinceLastSummaryStart: string | null;
    };

/**
 * Load unexpired summaries for a project, most recent first. RLS already
 * constrains rows to the owner, but we double-filter defensively.
 */
export async function loadRecentProjectSummaries(projectId: string): Promise<LoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("project_summaries")
    .select(
      "id, project_id, range_start, range_end, range_preset, model, event_count, body, generated_at, expires_at",
    )
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .gt("expires_at", nowIso)
    .order("generated_at", { ascending: false })
    .limit(20);

  if (error) return { ok: false, error: error.message };

  const summaries: ProjectSummaryRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    rangePreset: isSummaryRangePreset(row.range_preset) ? row.range_preset : null,
    model: row.model,
    eventCount: row.event_count,
    body: row.body,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
  }));

  const sinceLastSummaryStart = summaries.length > 0 ? summaries[0].rangeEnd : null;

  return { ok: true, summaries, sinceLastSummaryStart };
}

function isSummaryRangePreset(value: unknown): value is SummaryRangePreset {
  return (
    typeof value === "string" &&
    (SUMMARY_RANGE_PRESETS as readonly string[]).includes(value)
  );
}
