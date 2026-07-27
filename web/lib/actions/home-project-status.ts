"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  deliveryProgressIndex,
  type HomeProjectStatusIntegration,
  type HomeProjectForecastStats,
  type HomeProjectStatusPayload,
  type HomeProjectStatusPhase,
} from "@/lib/home-project-status";
import { loadHomeActualsVsForecast, makeWeekTotals } from "@/lib/home-actuals-vs-forecast";
import { loadAllActiveForecastProjects, loadForecastProjectDTO } from "@/lib/forecast-data";
import { isIntegrationCountedInScope } from "@/lib/integration-metadata";
import {
  computeEstimateVariance,
  currentSundayWeekYmd,
  sumActualsConsumedHours,
  sumEstimatedRoundedHours,
} from "@/lib/project-forecast";
import { serializeProjectIntegrationRow } from "@/lib/project-integration-row";
import { getUserTodayIso } from "@/lib/user-preferences";
import { loadUserPreferences } from "@/lib/actions/user-preferences";

export async function loadHomeProjectStatus(
  projectId: string,
): Promise<{ payload?: HomeProjectStatusPayload; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, starts_on, ends_on, estimated_effort_hours, project_types(system_key)")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError) return { error: projectError.message };
  if (!project) return { error: "Project not found" };

  const prefsRes = await loadUserPreferences();
  const todayYmd = getUserTodayIso(prefsRes.preferences.timezone);

  const [
    { data: phaseRows, error: phaseErr },
    { data: trackRows, error: trackErr },
    { data: piRows, error: piErr },
    actualsVsForecast,
    forecastProject,
  ] = await Promise.all([
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
    loadHomeActualsVsForecast(supabase, user.id, todayYmd, { projectId }),
    loadForecastProjectDTO(supabase, projectId, user.id, {
      todayIso: todayYmd,
      timeZone: prefsRes.preferences.timezone,
    }),
  ]);

  if (phaseErr) return { error: phaseErr.message };
  if (trackErr) return { error: trackErr.message };
  if (piErr) return { error: piErr.message };

  const projectType = Array.isArray(project.project_types)
    ? project.project_types[0]
    : project.project_types;
  const isExpertAssist = projectType?.system_key === "expert_assist";
  const phases: HomeProjectStatusPhase[] = isExpertAssist
    ? [
        {
          name: "Expert Assist",
          sort_order: 0,
          start_date: project.starts_on ?? null,
          end_date: project.ends_on ?? null,
        },
      ]
    : (phaseRows ?? []).map((p) => ({
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

  const serialized = (piRows ?? [])
    .map((row) => serializeProjectIntegrationRow(row))
    .filter((s) => isIntegrationCountedInScope(s.integration_state));

  let estimatedSum =
    isExpertAssist && project.estimated_effort_hours != null
      ? Number(project.estimated_effort_hours)
      : 0;
  const integrations: HomeProjectStatusIntegration[] = serialized.map((s) => {
    const eh = s.estimatedEffortHours;
    if (!isExpertAssist && eh != null && Number.isFinite(eh) && eh > 0) estimatedSum += eh;
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

  const projectForecastStats: HomeProjectForecastStats = (() => {
    if (!forecastProject) {
      return {
        estimatedHours: Math.round(estimatedSum),
        actualHours: Math.round(projectActualTotal),
        forecastedHours: null,
        varianceKind: "unavailable",
        varianceHours: null,
        varianceLabel: "No forecast",
      };
    }

    const currentSunday = currentSundayWeekYmd(todayYmd);
    const estimatedHours = sumEstimatedRoundedHours(forecastProject.integrations);
    const actualHours = sumActualsConsumedHours(forecastProject.actualHours);
    let forecastedHours = 0;
    for (const [week, hours] of Object.entries(forecastProject.hoursByWeek)) {
      if (week < currentSunday) continue;
      if (Number.isFinite(hours) && hours > 0) forecastedHours += hours;
    }
    forecastedHours = Math.round(forecastedHours);

    if (!forecastProject.forecast) {
      return {
        estimatedHours,
        actualHours,
        forecastedHours: null,
        varianceKind: "unavailable",
        varianceHours: null,
        varianceLabel: "No forecast",
      };
    }

    const variance = computeEstimateVariance({
      estimated: estimatedHours,
      actuals: actualHours,
      forecastTotal: forecastedHours,
    });

    return {
      estimatedHours,
      actualHours,
      forecastedHours,
      varianceKind: variance.kind,
      varianceHours: variance.absHours,
      varianceLabel: variance.label,
    };
  })();

  const payload: HomeProjectStatusPayload = {
    todayYmd,
    phases,
    projectTotals: {
      actualHours: projectActualTotal,
      estimatedHours: estimatedSum,
    },
    integrations,
    actualsVsForecast: actualsVsForecast.thisWeek ?? makeWeekTotals(0, 0),
    projectForecastStats,
  };

  return { payload };
}

export type HomeProjectStatusCacheEntry = {
  payload?: HomeProjectStatusPayload;
  error?: string;
};

/** Bulk background loader for the Home Progress cache. */
export async function loadAllHomeProjectStatuses(): Promise<{
  entries: Record<string, HomeProjectStatusCacheEntry>;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { entries: {}, error: "Not signed in" };
  const supabase = await createClient();

  const prefsRes = await loadUserPreferences();
  const todayYmd = getUserTodayIso(prefsRes.preferences.timezone);
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, starts_on, ends_on, estimated_effort_hours, project_types(system_key)")
    .eq("owner_id", user.id)
    .is("completed_at", null)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (projectsError) return { entries: {}, error: projectsError.message };
  if (!projects?.length) return { entries: {} };

  const projectIds = projects.map((project) => project.id as string);
  const [phasesRes, tracksRes, integrationsRes, actuals, forecasts] = await Promise.all([
    supabase
      .from("project_phases")
      .select("project_id, name, sort_order, start_date, end_date")
      .in("project_id", projectIds)
      .order("project_id")
      .order("sort_order"),
    supabase
      .from("project_tracks")
      .select("id, project_id, kind, project_integration_id")
      .in("project_id", projectIds),
    supabase
      .from("project_integrations")
      .select(
        `
        id,
        project_id,
        delivery_progress,
        integration_state,
        integration_id,
        estimated_effort_hours,
        created_at,
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
      .in("project_id", projectIds)
      .order("project_id")
      .order("created_at", { ascending: true }),
    loadHomeActualsVsForecast(supabase, user.id, todayYmd),
    loadAllActiveForecastProjects(supabase, user.id, {
      todayIso: todayYmd,
      timeZone: prefsRes.preferences.timezone,
    }),
  ]);

  const sharedError = phasesRes.error ?? tracksRes.error ?? integrationsRes.error;
  if (sharedError) return { entries: {}, error: sharedError.message };

  const tracks = tracksRes.data ?? [];
  const trackIds = tracks.map((track) => track.id as string);
  const [workRes, manualRes] =
    trackIds.length === 0
      ? [{ data: [], error: null }, { data: [], error: null }]
      : await Promise.all([
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
  if (workRes.error || manualRes.error) {
    return { entries: {}, error: (workRes.error ?? manualRes.error)?.message };
  }

  const hoursByTrack = new Map<string, number>();
  const addHours = (trackId: string | null | undefined, value: unknown) => {
    if (!trackId) return;
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0) return;
    hoursByTrack.set(trackId, (hoursByTrack.get(trackId) ?? 0) + hours);
  };
  for (const row of workRes.data ?? []) {
    const relation = Array.isArray(row.integration_tasks)
      ? row.integration_tasks[0]
      : row.integration_tasks;
    addHours(relation?.project_track_id, row.duration_hours);
  }
  for (const row of manualRes.data ?? []) addHours(row.project_track_id, row.duration_hours);

  const forecastByProject = new Map(forecasts.map((forecast) => [forecast.id, forecast]));
  const actualsByProject = new Map(actuals.projects.map((project) => [project.id, project]));
  const currentSunday = currentSundayWeekYmd(todayYmd);
  const entries: Record<string, HomeProjectStatusCacheEntry> = {};

  for (const project of projects) {
    const projectId = project.id as string;
    const projectType = Array.isArray(project.project_types)
      ? project.project_types[0]
      : project.project_types;
    const isExpertAssist = projectType?.system_key === "expert_assist";
    const phases: HomeProjectStatusPhase[] = isExpertAssist
      ? [
          {
            name: "Expert Assist",
            sort_order: 0,
            start_date: project.starts_on ?? null,
            end_date: project.ends_on ?? null,
          },
        ]
      : (phasesRes.data ?? [])
          .filter((phase) => phase.project_id === projectId)
          .map((phase) => ({
            name: phase.name,
            sort_order: phase.sort_order,
            start_date: phase.start_date,
            end_date: phase.end_date,
          }));

    const projectTracks = tracks.filter((track) => track.project_id === projectId);
    const hoursByIntegration = new Map<string, number>();
    let projectActualTotal = 0;
    for (const track of projectTracks) {
      const hours = hoursByTrack.get(track.id) ?? 0;
      projectActualTotal += hours;
      if (track.kind === "integration" && track.project_integration_id) {
        hoursByIntegration.set(
          track.project_integration_id,
          (hoursByIntegration.get(track.project_integration_id) ?? 0) + hours,
        );
      }
    }

    const serialized = (integrationsRes.data ?? [])
      .filter((row) => row.project_id === projectId)
      .map((row) => serializeProjectIntegrationRow(row))
      .filter((integration) => isIntegrationCountedInScope(integration.integration_state));
    let estimatedSum =
      isExpertAssist && project.estimated_effort_hours != null
        ? Number(project.estimated_effort_hours)
        : 0;
    const integrations: HomeProjectStatusIntegration[] = serialized.map((integration) => {
      const estimated = integration.estimatedEffortHours;
      if (!isExpertAssist && estimated != null && Number.isFinite(estimated) && estimated > 0) {
        estimatedSum += estimated;
      }
      return {
        id: integration.id,
        title: integration.title,
        delivery_progress: integration.delivery_progress,
        deliveryProgressLabel: integration.deliveryProgressLabel,
        deliveryProgressIndex: deliveryProgressIndex(integration.delivery_progress),
        estimatedHours: estimated,
        actualHours: hoursByIntegration.get(integration.id) ?? 0,
      };
    });

    const forecast = forecastByProject.get(projectId);
    let projectForecastStats: HomeProjectForecastStats;
    if (!forecast) {
      projectForecastStats = {
        estimatedHours: Math.round(estimatedSum),
        actualHours: Math.round(projectActualTotal),
        forecastedHours: null,
        varianceKind: "unavailable",
        varianceHours: null,
        varianceLabel: "No forecast",
      };
    } else {
      const estimatedHours = sumEstimatedRoundedHours(forecast.integrations);
      const actualHours = sumActualsConsumedHours(forecast.actualHours);
      let forecastedHours = Object.entries(forecast.hoursByWeek).reduce(
        (sum, [week, hours]) =>
          week >= currentSunday && Number.isFinite(hours) && hours > 0 ? sum + hours : sum,
        0,
      );
      forecastedHours = Math.round(forecastedHours);
      if (!forecast.forecast) {
        projectForecastStats = {
          estimatedHours,
          actualHours,
          forecastedHours: null,
          varianceKind: "unavailable",
          varianceHours: null,
          varianceLabel: "No forecast",
        };
      } else {
        const variance = computeEstimateVariance({
          estimated: estimatedHours,
          actuals: actualHours,
          forecastTotal: forecastedHours,
        });
        projectForecastStats = {
          estimatedHours,
          actualHours,
          forecastedHours,
          varianceKind: variance.kind,
          varianceHours: variance.absHours,
          varianceLabel: variance.label,
        };
      }
    }

    entries[projectId] = {
      payload: {
        todayYmd,
        phases,
        projectTotals: { actualHours: projectActualTotal, estimatedHours: estimatedSum },
        integrations,
        actualsVsForecast:
          actualsByProject.get(projectId)?.byWeek[currentSunday] ?? makeWeekTotals(0, 0),
        projectForecastStats,
      },
    };
  }

  return { entries };
}
