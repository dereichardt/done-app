import type { SupabaseClient } from "@supabase/supabase-js";
import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import {
  PM_FORECAST_ROW_KEY,
  type ForecastPhaseInput,
} from "@/lib/project-forecast";
import type { ProjectEffortSessionInput } from "@/lib/project-weekly-effort";
import { timelineSpanFromPhases } from "@/lib/project-weekly-effort";

export type ForecastHeaderDTO = {
  start_date: string;
  pm_percent: number;
  spread_mode: "even" | "bell";
  /** Hours held off the grid (under estimate / past-phase reserve). */
  reserve_hours: number;
  /** When true, past-phase hours were included in the generate spread. */
  include_past_phases_in_spread: boolean;
  generated_at: string;
};

export type ForecastHoursCellDTO = {
  row_key: string;
  week_start_date: string;
  hours: number;
};

export type ForecastIntegrationDTO = {
  key: string;
  label: string;
  estimatedEffortHours: number | null;
};

export type ForecastProjectDTO = {
  id: string;
  customer_name: string;
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationDTO[];
  pmLabel: string;
  timelineStartYmd: string | null;
  timelineEndYmd: string | null;
  actualsByRowKey: Record<string, number>;
  forecast: ForecastHeaderDTO | null;
  hours: ForecastHoursCellDTO[];
  /** Nested map rowKey → weekStart → hours for client convenience. */
  hoursByRow: Record<string, Record<string, number>>;
};

function integrationTitle(row: {
  integrations:
    | {
        name?: string | null;
        integration_code?: string | null;
        integrating_with?: string | null;
        direction?: string | null;
      }
    | {
        name?: string | null;
        integration_code?: string | null;
        integrating_with?: string | null;
        direction?: string | null;
      }[]
    | null;
}): string {
  const integ = Array.isArray(row.integrations) ? row.integrations[0] : row.integrations;
  const display = formatIntegrationDefinitionDisplayName({
    integration_code: integ?.integration_code,
    integrating_with: integ?.integrating_with,
    name: integ?.name,
    direction: integ?.direction,
  }).trim();
  return display || (integ?.name ?? "").trim() || "Integration";
}

function hoursByRowFromCells(cells: ForecastHoursCellDTO[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const c of cells) {
    if (!out[c.row_key]) out[c.row_key] = {};
    out[c.row_key][c.week_start_date] = c.hours;
  }
  return out;
}

async function loadActualsByRowKey(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ actuals: Record<string, number>; pmLabel: string }> {
  const { data: tracks } = await supabase
    .from("project_tracks")
    .select("id, name, kind, project_integration_id")
    .eq("project_id", projectId);

  const pmTrack = (tracks ?? []).find((t) => t.kind === "project_management") ?? null;
  const integrationTracks = (tracks ?? []).filter((t) => t.kind === "integration");
  const trackIds = (tracks ?? []).map((t) => t.id);
  const pmLabel = (pmTrack?.name ?? "").trim() || "Project Management";

  const rowKeyByTrackId = new Map<string, string>();
  for (const track of integrationTracks) {
    if (track.project_integration_id) {
      rowKeyByTrackId.set(track.id, track.project_integration_id);
    }
  }
  if (pmTrack) rowKeyByTrackId.set(pmTrack.id, PM_FORECAST_ROW_KEY);

  const actuals: Record<string, number> = {};
  if (trackIds.length === 0) return { actuals, pmLabel };

  const [wsRes, meRes] = await Promise.all([
    supabase
      .from("integration_task_work_sessions")
      .select(
        "id, duration_hours, finished_at, integration_tasks!inner(project_track_id)",
      )
      .in("integration_tasks.project_track_id", trackIds)
      .not("finished_at", "is", null),
    supabase
      .from("integration_manual_effort_entries")
      .select("id, duration_hours, finished_at, project_track_id")
      .in("project_track_id", trackIds)
      .not("finished_at", "is", null),
  ]);

  for (const row of wsRes.data ?? []) {
    const taskJoin = row.integration_tasks as
      | { project_track_id: string }
      | { project_track_id: string }[]
      | null;
    const trackId = Array.isArray(taskJoin)
      ? taskJoin[0]?.project_track_id
      : taskJoin?.project_track_id;
    if (!trackId) continue;
    const rowKey = rowKeyByTrackId.get(trackId);
    if (!rowKey) continue;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    actuals[rowKey] = (actuals[rowKey] ?? 0) + dh;
  }
  for (const row of meRes.data ?? []) {
    const rowKey = rowKeyByTrackId.get(row.project_track_id);
    if (!rowKey) continue;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    actuals[rowKey] = (actuals[rowKey] ?? 0) + dh;
  }

  return { actuals, pmLabel };
}

export async function loadForecastProjectDTO(
  supabase: SupabaseClient,
  projectId: string,
  ownerId: string,
): Promise<ForecastProjectDTO | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!project) return null;

  const [{ data: phases }, { data: piRows }, { data: forecast }, { data: hoursRows }, actualsBundle] =
    await Promise.all([
      supabase
        .from("project_phases")
        .select("phase_key, start_date, end_date, sort_order")
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("project_integrations")
        .select(
          `
          id,
          estimated_effort_hours,
          integrations (
            name,
            integration_code,
            integrating_with,
            direction
          )
        `,
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("project_forecasts")
        .select(
          "start_date, pm_percent, spread_mode, reserve_hours, include_past_phases_in_spread, generated_at",
        )
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_forecast_hours")
        .select("row_key, week_start_date, hours")
        .eq("project_id", projectId),
      loadActualsByRowKey(supabase, projectId),
    ]);

  const phaseInputs: ForecastPhaseInput[] = (phases ?? []).map((p) => ({
    phase_key: p.phase_key ?? null,
    start_date: p.start_date ?? null,
    end_date: p.end_date ?? null,
  }));
  const span = timelineSpanFromPhases(phaseInputs);

  const integrations: ForecastIntegrationDTO[] = (piRows ?? []).map((row) => {
    const hours = row.estimated_effort_hours != null ? Number(row.estimated_effort_hours) : null;
    return {
      key: row.id,
      label: integrationTitle(row),
      estimatedEffortHours:
        hours != null && Number.isFinite(hours) ? hours : null,
    };
  });

  const hours: ForecastHoursCellDTO[] = (hoursRows ?? []).map((h) => ({
    row_key: h.row_key,
    week_start_date: String(h.week_start_date).slice(0, 10),
    hours: Math.max(0, Math.round(Number(h.hours) || 0)),
  }));

  return {
    id: project.id,
    customer_name: (project.customer_name ?? "").trim() || "Untitled project",
    phases: phaseInputs,
    integrations,
    pmLabel: actualsBundle.pmLabel,
    timelineStartYmd: span?.startYmd ?? null,
    timelineEndYmd: span?.endYmd ?? null,
    actualsByRowKey: actualsBundle.actuals,
    forecast: forecast
      ? {
          start_date: String(forecast.start_date).slice(0, 10),
          pm_percent: Number(forecast.pm_percent),
          spread_mode:
            forecast.spread_mode === "bell" || forecast.spread_mode === "even"
              ? forecast.spread_mode
              : "even",
          reserve_hours: Math.max(0, Math.round(Number(forecast.reserve_hours) || 0)),
          include_past_phases_in_spread: Boolean(forecast.include_past_phases_in_spread),
          generated_at: forecast.generated_at,
        }
      : null,
    hours,
    hoursByRow: hoursByRowFromCells(hours),
  };
}

export async function loadAllActiveForecastProjects(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<ForecastProjectDTO[]> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", ownerId)
    .is("completed_at", null)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!projects?.length) return [];

  const results: ForecastProjectDTO[] = [];
  // Sequential batches of 4 to avoid stampedes while staying reasonably fast.
  const ids = projects.map((p) => p.id);
  const chunkSize = 4;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const loaded = await Promise.all(
      chunk.map((id) => loadForecastProjectDTO(supabase, id, ownerId)),
    );
    for (const dto of loaded) {
      if (dto) results.push(dto);
    }
  }
  return results;
}

/** Map effort sessions already loaded on the project page into actuals-by-row. */
export function actualsFromEffortSessions(
  sessions: ProjectEffortSessionInput[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    const h = Number(s.duration_hours);
    if (!Number.isFinite(h) || h <= 0) continue;
    out[s.rowKey] = (out[s.rowKey] ?? 0) + h;
  }
  return out;
}
