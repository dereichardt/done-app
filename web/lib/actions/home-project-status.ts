"use server";

import { createClient } from "@/lib/supabase/server";
import {
  deliveryProgressIndex,
  type HomeProjectStatusIntegration,
  type HomeProjectStatusPayload,
  type HomeProjectStatusPhase,
} from "@/lib/home-project-status";
import { serializeProjectIntegrationRow } from "@/lib/project-integration-row";
import { getUserTodayIso } from "@/lib/user-preferences";
import { loadUserPreferences } from "@/lib/actions/user-preferences";

export async function loadHomeProjectStatus(
  projectId: string,
): Promise<{ payload?: HomeProjectStatusPayload; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError) return { error: projectError.message };
  if (!project) return { error: "Project not found" };

  const prefsRes = await loadUserPreferences();
  const todayYmd = getUserTodayIso(prefsRes.preferences.timezone);

  const [{ data: phaseRows, error: phaseErr }, { data: trackRows, error: trackErr }, { data: piRows, error: piErr }] =
    await Promise.all([
      supabase
        .from("project_phases")
        .select("name, sort_order, start_date, end_date")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("project_tracks")
        .select("id, kind, project_integration_id")
        .eq("project_id", projectId),
      supabase
        .from("project_integrations")
        .select(
          `
      id,
      delivery_progress,
      integration_state,
      integration_id,
      estimated_effort_hours,
      integrations (
        id,
        name,
        integration_code,
        integrating_with,
        direction,
        catalog_visibility,
        integration_types ( name ),
        functional_areas ( name ),
        integration_domains ( name )
      )
    `,
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
    ]);

  if (phaseErr) return { error: phaseErr.message };
  if (trackErr) return { error: trackErr.message };
  if (piErr) return { error: piErr.message };

  const phases: HomeProjectStatusPhase[] = (phaseRows ?? []).map((p) => ({
    name: p.name,
    sort_order: p.sort_order,
    start_date: p.start_date,
    end_date: p.end_date,
  }));

  const tracks = trackRows ?? [];
  const trackIds = tracks.map((t) => t.id).filter(Boolean);

  const hoursByTrack = new Map<string, number>();

  if (trackIds.length > 0) {
    const [wsRes, meRes] = await Promise.all([
      supabase
        .from("integration_task_work_sessions")
        .select("duration_hours, integration_tasks!inner(project_track_id)")
        .in("integration_tasks.project_track_id", trackIds)
        .not("finished_at", "is", null),
      supabase
        .from("integration_manual_effort_entries")
        .select("project_track_id, duration_hours")
        .in("project_track_id", trackIds)
        .not("finished_at", "is", null),
    ]);

    if (wsRes.error) return { error: wsRes.error.message };
    if (meRes.error) return { error: meRes.error.message };

    for (const row of wsRes.data ?? []) {
      const task = row.integration_tasks as { project_track_id?: string } | null;
      const tid = task?.project_track_id;
      if (!tid) continue;
      const dh = Number(row.duration_hours);
      if (!Number.isFinite(dh) || dh <= 0) continue;
      hoursByTrack.set(tid, (hoursByTrack.get(tid) ?? 0) + dh);
    }

    for (const row of meRes.data ?? []) {
      const tid = row.project_track_id;
      if (!tid) continue;
      const dh = Number(row.duration_hours);
      if (!Number.isFinite(dh) || dh <= 0) continue;
      hoursByTrack.set(tid, (hoursByTrack.get(tid) ?? 0) + dh);
    }
  }

  const hoursByIntegration = new Map<string, number>();
  let projectActualTotal = 0;
  for (const [tid, hrs] of hoursByTrack) {
    projectActualTotal += hrs;
    const tr = tracks.find((t) => t.id === tid);
    if (tr?.kind === "integration" && tr.project_integration_id) {
      const pid = tr.project_integration_id;
      hoursByIntegration.set(pid, (hoursByIntegration.get(pid) ?? 0) + hrs);
    }
  }

  const serialized = (piRows ?? []).map((row) => serializeProjectIntegrationRow(row));

  let estimatedSum = 0;
  const integrations: HomeProjectStatusIntegration[] = serialized.map((s) => {
    const eh = s.estimatedEffortHours;
    if (eh != null && Number.isFinite(eh) && eh > 0) estimatedSum += eh;
    return {
      id: s.id,
      title: s.title,
      delivery_progress: s.delivery_progress,
      deliveryProgressLabel: s.deliveryProgressLabel,
      deliveryProgressIndex: deliveryProgressIndex(s.delivery_progress),
      estimatedHours: eh,
      actualHours: hoursByIntegration.get(s.id) ?? 0,
    };
  });

  const payload: HomeProjectStatusPayload = {
    todayYmd,
    phases,
    projectTotals: {
      actualHours: projectActualTotal,
      estimatedHours: estimatedSum,
    },
    integrations,
  };

  return { payload };
}
