import type { SupabaseClient } from "@supabase/supabase-js";

import { effortHoursForSundayWeek } from "@/lib/home-actuals-vs-forecast";
import type { EffortSessionInput } from "@/lib/integration-effort-buckets";
import { currentSundayWeekYmd } from "@/lib/project-forecast";
import { addDaysYmd } from "@/lib/zoned-datetime";

export type WorkForecastTrackActual = {
  projectId: string;
  trackId: string;
  hours: number;
};

/**
 * This-week (Sunday) actual hours by project track for the Work Forecast vs Actuals overlay.
 * Uses the same session sources and Sunday proration as Home actuals.
 */
export async function loadWorkForecastTrackActuals(
  supabase: SupabaseClient,
  ownerId: string,
  todayIso: string,
): Promise<WorkForecastTrackActual[]> {
  const weekStartYmd = currentSundayWeekYmd(todayIso);
  const weekEndExclusiveYmd = addDaysYmd(weekStartYmd, 7);
  const windowStartIso = `${weekStartYmd}T00:00:00.000Z`;
  const windowEndExclusiveIso = `${weekEndExclusiveYmd}T00:00:00.000Z`;

  const { data: projectRows, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", ownerId)
    .is("completed_at", null);

  if (projErr) {
    console.error("[work-forecast-track-actuals] projects load failed", projErr);
    return [];
  }

  const projectIds = (projectRows ?? []).map((p) => p.id as string);
  if (projectIds.length === 0) return [];

  const { data: trackRows, error: trackErr } = await supabase
    .from("project_tracks")
    .select("id, project_id")
    .in("project_id", projectIds);

  if (trackErr) {
    console.error("[work-forecast-track-actuals] tracks load failed", trackErr);
    return [];
  }

  const trackIds = (trackRows ?? []).map((t) => t.id as string);
  const projectIdByTrackId = new Map<string, string>();
  for (const t of trackRows ?? []) {
    projectIdByTrackId.set(t.id as string, t.project_id as string);
  }

  if (trackIds.length === 0) return [];

  const [wsRes, meRes] = await Promise.all([
    supabase
      .from("integration_task_work_sessions")
      .select(
        "id, started_at, finished_at, duration_hours, integration_tasks!inner(project_track_id)",
      )
      .in("integration_tasks.project_track_id", trackIds)
      .not("finished_at", "is", null)
      .lt("started_at", windowEndExclusiveIso)
      .gt("finished_at", windowStartIso),
    supabase
      .from("integration_manual_effort_entries")
      .select("id, started_at, finished_at, duration_hours, project_track_id")
      .in("project_track_id", trackIds)
      .not("finished_at", "is", null)
      .lt("started_at", windowEndExclusiveIso)
      .gt("finished_at", windowStartIso),
  ]);

  if (wsRes.error) {
    console.error("[work-forecast-track-actuals] work sessions load failed", wsRes.error);
  }
  if (meRes.error) {
    console.error("[work-forecast-track-actuals] manual effort load failed", meRes.error);
  }

  const sessionsByTrack = new Map<string, EffortSessionInput[]>();

  const pushSession = (
    trackId: string | undefined,
    row: {
      id: string;
      started_at: string;
      finished_at: string;
      duration_hours: number | string;
    },
    source: "task_work_session" | "manual",
  ) => {
    if (!trackId || !row.finished_at) return;
    if (!projectIdByTrackId.has(trackId)) return;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) return;
    const list = sessionsByTrack.get(trackId) ?? [];
    list.push({
      source,
      source_id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: dh,
      integration_task_id: null,
      title: "Task",
      work_accomplished: null,
    });
    sessionsByTrack.set(trackId, list);
  };

  for (const row of (wsRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number;
    integration_tasks:
      | { project_track_id: string }
      | { project_track_id: string }[]
      | null;
  }>) {
    const taskJoin = row.integration_tasks;
    const trackId = Array.isArray(taskJoin)
      ? taskJoin[0]?.project_track_id
      : taskJoin?.project_track_id;
    pushSession(trackId, row, "task_work_session");
  }

  for (const row of (meRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number;
    project_track_id: string;
  }>) {
    pushSession(row.project_track_id, row, "manual");
  }

  const out: WorkForecastTrackActual[] = [];
  for (const [trackId, sessions] of sessionsByTrack.entries()) {
    const projectId = projectIdByTrackId.get(trackId);
    if (!projectId) continue;
    const hours = effortHoursForSundayWeek(sessions, weekStartYmd);
    if (hours <= 0) continue;
    out.push({ projectId, trackId, hours });
  }

  return out.sort((a, b) => b.hours - a.hours);
}
