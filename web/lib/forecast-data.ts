import type { SupabaseClient } from "@supabase/supabase-js";
import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import {
  currentSundayWeekYmd,
  type ForecastPhaseInput,
} from "@/lib/project-forecast";
import type { ProjectEffortSessionInput } from "@/lib/project-weekly-effort";
import { timelineSpanFromPhases } from "@/lib/project-weekly-effort";
import { zonedLocalMidnightUtcMs } from "@/lib/zoned-datetime";

export type ForecastHeaderDTO = {
  start_date: string;
  spread_mode: "even" | "bell";
  /** Hours held off the grid (under estimate / past-phase reserve). */
  reserve_hours: number;
  /** When true, past-phase hours were included in the generate spread. */
  include_past_phases_in_spread: boolean;
  generated_at: string;
};

export type ForecastHoursCellDTO = {
  week_start_date: string;
  hours: number;
};

export type ForecastIntegrationDTO = {
  key: string;
  label: string;
  estimatedEffortHours: number | null;
};

export type ForecastProjectDTO = {
  kind: "project" | "initiative";
  forecastModel: "phased_integrations" | "single_track";
  id: string;
  customer_name: string;
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationDTO[];
  timelineStartYmd: string | null;
  timelineEndYmd: string | null;
  /** Completed effort from Sunday–Saturday weeks before the current week. */
  actualHours: number;
  forecast: ForecastHeaderDTO | null;
  hours: ForecastHoursCellDTO[];
  /** Sunday week starts whose complete project column is protected. */
  lockedWeekStarts: string[];
  /** Project-level forecast hours keyed by Sunday week start. */
  hoursByWeek: Record<string, number>;
};

export type ForecastActualsContext = {
  /** User-local calendar date. */
  todayIso: string;
  /** User's saved IANA timezone; UTC when unset. */
  timeZone: string | null | undefined;
};

/** UTC cutoff at the start of the current Sunday–Saturday forecast week. */
export function forecastActualsCutoffIso(context: ForecastActualsContext): string {
  const currentSunday = currentSundayWeekYmd(context.todayIso);
  const cutoffMs = zonedLocalMidnightUtcMs(currentSunday, context.timeZone ?? "UTC");
  if (Number.isFinite(cutoffMs)) return new Date(cutoffMs).toISOString();
  return new Date(`${currentSunday}T00:00:00.000Z`).toISOString();
}

export function isActualBeforeForecastCutoff(
  finishedAt: string | null | undefined,
  cutoffIso: string,
): boolean {
  if (!finishedAt) return false;
  const finishedMs = new Date(finishedAt).getTime();
  const cutoffMs = new Date(cutoffIso).getTime();
  return Number.isFinite(finishedMs) && Number.isFinite(cutoffMs) && finishedMs < cutoffMs;
}

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

function hoursByWeekFromCells(cells: ForecastHoursCellDTO[]): Record<string, number> {
  return Object.fromEntries(cells.map((cell) => [cell.week_start_date, cell.hours]));
}

async function loadActualHours(
  supabase: SupabaseClient,
  projectId: string,
  actualsContext: ForecastActualsContext,
): Promise<number> {
  const { data: tracks } = await supabase
    .from("project_tracks")
    .select("id")
    .eq("project_id", projectId);

  const trackIds = (tracks ?? []).map((t) => t.id);
  if (trackIds.length === 0) return 0;
  const cutoffIso = forecastActualsCutoffIso(actualsContext);

  const [wsRes, meRes] = await Promise.all([
    supabase
      .from("integration_task_work_sessions")
      .select(
        "id, duration_hours, finished_at, integration_tasks!inner(project_track_id)",
      )
      .in("integration_tasks.project_track_id", trackIds)
      .not("finished_at", "is", null)
      .lt("finished_at", cutoffIso),
    supabase
      .from("integration_manual_effort_entries")
      .select("id, duration_hours, finished_at, project_track_id")
      .in("project_track_id", trackIds)
      .not("finished_at", "is", null)
      .lt("finished_at", cutoffIso),
  ]);

  let actualHours = 0;
  for (const row of wsRes.data ?? []) {
    if (!isActualBeforeForecastCutoff(row.finished_at, cutoffIso)) continue;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    actualHours += dh;
  }
  for (const row of meRes.data ?? []) {
    if (!isActualBeforeForecastCutoff(row.finished_at, cutoffIso)) continue;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    actualHours += dh;
  }

  return actualHours;
}

type ProjectSourceRow = {
  id: string;
  customer_name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  estimated_effort_hours: number | string | null;
  project_types: { system_key?: string | null } | { system_key?: string | null }[] | null;
};

type PhaseSourceRow = {
  project_id?: string;
  phase_key: string | null;
  start_date: string | null;
  end_date: string | null;
  sort_order?: number;
};

type IntegrationSourceRow = {
  id: string;
  project_id?: string;
  estimated_effort_hours: number | string | null;
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
};

type ForecastSourceRow = {
  project_id?: string;
  start_date: string;
  spread_mode?: string | null;
  reserve_hours?: number | string | null;
  include_past_phases_in_spread?: boolean | null;
  generated_at: string;
};

type HoursSourceRow = {
  project_id?: string;
  initiative_id?: string;
  week_start_date: string;
  hours: number | string;
};

type LockSourceRow = {
  project_id?: string;
  initiative_id?: string;
  week_start_date: string;
};

function groupByParentId<T>(
  rows: T[],
  parentId: (row: T) => string | null | undefined,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const id = parentId(row);
    if (!id) continue;
    const values = grouped.get(id) ?? [];
    values.push(row);
    grouped.set(id, values);
  }
  return grouped;
}

function normalizedActualHours(rows: Array<{ duration_hours: number | string; finished_at: string | null }>, cutoffIso: string): number {
  let total = 0;
  for (const row of rows) {
    if (!isActualBeforeForecastCutoff(row.finished_at, cutoffIso)) continue;
    const hours = Number(row.duration_hours);
    if (Number.isFinite(hours) && hours > 0) total += hours;
  }
  return total;
}

function buildProjectDTO(args: {
  project: ProjectSourceRow;
  phases: PhaseSourceRow[];
  integrations: IntegrationSourceRow[];
  forecast: ForecastSourceRow | null;
  hoursRows: HoursSourceRow[];
  lockRows: LockSourceRow[];
  actualHours: number;
}): ForecastProjectDTO {
  const { project, phases, forecast, hoursRows, lockRows, actualHours } = args;
  const projectType = Array.isArray(project.project_types)
    ? project.project_types[0]
    : project.project_types;
  const isExpertAssist = projectType?.system_key === "expert_assist";
  const phaseInputs: ForecastPhaseInput[] = phases.map((phase) => ({
    phase_key: phase.phase_key ?? null,
    start_date: phase.start_date ?? null,
    end_date: phase.end_date ?? null,
  }));
  const span =
    isExpertAssist && project.starts_on && project.ends_on
      ? {
          startYmd: String(project.starts_on).slice(0, 10),
          endYmd: String(project.ends_on).slice(0, 10),
        }
      : timelineSpanFromPhases(phaseInputs);
  const integrations: ForecastIntegrationDTO[] = isExpertAssist
    ? [
        {
          key: project.id,
          label: "Expert Assist",
          estimatedEffortHours:
            project.estimated_effort_hours != null &&
            Number.isFinite(Number(project.estimated_effort_hours))
              ? Number(project.estimated_effort_hours)
              : null,
        },
      ]
    : args.integrations.map((row) => {
        const hours = row.estimated_effort_hours != null ? Number(row.estimated_effort_hours) : null;
        return {
          key: row.id,
          label: integrationTitle(row),
          estimatedEffortHours: hours != null && Number.isFinite(hours) ? hours : null,
        };
      });
  const hours: ForecastHoursCellDTO[] = hoursRows.map((row) => ({
    week_start_date: String(row.week_start_date).slice(0, 10),
    hours: Math.max(0, Math.round(Number(row.hours) || 0)),
  }));

  return {
    kind: "project",
    forecastModel: isExpertAssist ? "single_track" : "phased_integrations",
    id: project.id,
    customer_name: (project.customer_name ?? "").trim() || "Untitled project",
    phases: isExpertAssist ? [] : phaseInputs,
    integrations,
    timelineStartYmd: span?.startYmd ?? null,
    timelineEndYmd: span?.endYmd ?? null,
    actualHours,
    forecast: forecast
      ? {
          start_date: String(forecast.start_date).slice(0, 10),
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
    lockedWeekStarts: lockRows.map((row) => String(row.week_start_date).slice(0, 10)),
    hoursByWeek: hoursByWeekFromCells(hours),
  };
}

type InitiativeSourceRow = {
  id: string;
  title: string | null;
  starts_on: string;
  ends_on: string;
  estimated_effort_hours: number | string | null;
};

type InitiativeForecastSourceRow = {
  initiative_id?: string;
  start_date: string;
  generated_at: string;
};

function buildInitiativeDTO(args: {
  initiative: InitiativeSourceRow;
  forecast: InitiativeForecastSourceRow | null;
  hoursRows: HoursSourceRow[];
  lockRows: LockSourceRow[];
  actualHours: number;
}): ForecastProjectDTO {
  const { initiative, forecast, lockRows, actualHours } = args;
  const hours: ForecastHoursCellDTO[] = args.hoursRows.map((row) => ({
    week_start_date: String(row.week_start_date).slice(0, 10),
    hours: Math.max(0, Math.round(Number(row.hours) || 0)),
  }));
  const estimate = Number(initiative.estimated_effort_hours);
  return {
    kind: "initiative",
    forecastModel: "single_track",
    id: initiative.id,
    customer_name: String(initiative.title ?? "").trim() || "Untitled initiative",
    phases: [],
    integrations: [
      {
        key: initiative.id,
        label: "Initiative",
        estimatedEffortHours: Number.isFinite(estimate) ? estimate : null,
      },
    ],
    timelineStartYmd: String(initiative.starts_on).slice(0, 10),
    timelineEndYmd: String(initiative.ends_on).slice(0, 10),
    actualHours,
    forecast: forecast
      ? {
          start_date: String(forecast.start_date).slice(0, 10),
          spread_mode: "even",
          reserve_hours: 0,
          include_past_phases_in_spread: false,
          generated_at: forecast.generated_at,
        }
      : null,
    hours,
    lockedWeekStarts: lockRows.map((row) => String(row.week_start_date).slice(0, 10)),
    hoursByWeek: hoursByWeekFromCells(hours),
  };
}

export async function loadForecastProjectDTO(
  supabase: SupabaseClient,
  projectId: string,
  ownerId: string,
  actualsContext: ForecastActualsContext,
): Promise<ForecastProjectDTO | null> {
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, customer_name, starts_on, ends_on, estimated_effort_hours, project_types(system_key)",
    )
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!project) return null;

  const [
    { data: phases },
    { data: piRows },
    { data: forecast },
    { data: hoursRows },
    { data: lockRows },
    actualsBundle,
  ] = await Promise.all([
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
          "start_date, spread_mode, reserve_hours, include_past_phases_in_spread, generated_at",
        )
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_forecast_hours")
        .select("week_start_date, hours")
        .eq("project_id", projectId),
      supabase
        .from("project_forecast_week_locks")
        .select("week_start_date")
        .eq("project_id", projectId)
        .order("week_start_date"),
      loadActualHours(supabase, projectId, actualsContext),
    ]);
  return buildProjectDTO({
    project,
    phases: phases ?? [],
    integrations: piRows ?? [],
    forecast: forecast ?? null,
    hoursRows: hoursRows ?? [],
    lockRows: lockRows ?? [],
    actualHours: actualsBundle,
  });
}

export async function loadForecastInitiativeDTO(
  supabase: SupabaseClient,
  initiativeId: string,
  ownerId: string,
  actualsContext: ForecastActualsContext,
): Promise<ForecastProjectDTO | null> {
  const { data: initiative } = await supabase
    .from("internal_initiatives")
    .select("id, title, starts_on, ends_on, estimated_effort_hours")
    .eq("id", initiativeId)
    .eq("owner_id", ownerId)
    .eq("include_in_forecast", true)
    .is("completed_at", null)
    .maybeSingle();
  if (!initiative) return null;

  const cutoffIso = forecastActualsCutoffIso(actualsContext);
  const [{ data: tasks }, { data: forecast }, { data: hourRows }, { data: lockRows }] =
    await Promise.all([
      supabase
        .from("internal_tasks")
        .select("id")
        .eq("internal_initiative_id", initiativeId),
      supabase
        .from("initiative_forecasts")
        .select("start_date, generated_at")
        .eq("initiative_id", initiativeId)
        .maybeSingle(),
      supabase
        .from("initiative_forecast_hours")
        .select("week_start_date, hours")
        .eq("initiative_id", initiativeId),
      supabase
        .from("initiative_forecast_week_locks")
        .select("week_start_date")
        .eq("initiative_id", initiativeId)
        .order("week_start_date"),
    ]);

  const taskIds = (tasks ?? []).map((task) => task.id as string);
  const [workRes, manualRes] = await Promise.all([
    taskIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ duration_hours: number; finished_at: string }> })
      : supabase
          .from("internal_task_work_sessions")
          .select("duration_hours, finished_at")
          .in("internal_task_id", taskIds)
          .not("finished_at", "is", null)
          .lt("finished_at", cutoffIso),
    supabase
      .from("internal_initiative_manual_effort_entries")
      .select("duration_hours, finished_at")
      .eq("internal_initiative_id", initiativeId)
      .not("finished_at", "is", null)
      .lt("finished_at", cutoffIso),
  ]);

  return buildInitiativeDTO({
    initiative,
    forecast: forecast ?? null,
    hoursRows: hourRows ?? [],
    lockRows: lockRows ?? [],
    actualHours: normalizedActualHours(
      [...(workRes.data ?? []), ...(manualRes.data ?? [])],
      cutoffIso,
    ),
  });
}

export async function loadAllActiveForecastProjects(
  supabase: SupabaseClient,
  ownerId: string,
  actualsContext: ForecastActualsContext,
): Promise<ForecastProjectDTO[]> {
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select(
      "id, customer_name, starts_on, ends_on, estimated_effort_hours, project_types(system_key)",
    )
    .eq("owner_id", ownerId)
    .is("completed_at", null)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (projectsError) {
    console.error("[forecast-data] active projects load failed", projectsError);
    return [];
  }
  if (!projects?.length) return [];

  const ids = projects.map((p) => p.id);
  const [phasesRes, integrationsRes, forecastsRes, hoursRes, locksRes, tracksRes] =
    await Promise.all([
      supabase
        .from("project_phases")
        .select("project_id, phase_key, start_date, end_date, sort_order")
        .in("project_id", ids)
        .order("project_id")
        .order("sort_order"),
      supabase
        .from("project_integrations")
        .select(
          `
          id,
          project_id,
          estimated_effort_hours,
          created_at,
          integrations (
            name,
            integration_code,
            integrating_with,
            direction
          )
        `,
        )
        .in("project_id", ids)
        .order("project_id")
        .order("created_at", { ascending: true }),
      supabase
        .from("project_forecasts")
        .select(
          "project_id, start_date, spread_mode, reserve_hours, include_past_phases_in_spread, generated_at",
        )
        .in("project_id", ids)
        .order("project_id"),
      supabase
        .from("project_forecast_hours")
        .select("project_id, week_start_date, hours")
        .in("project_id", ids)
        .order("project_id")
        .order("week_start_date"),
      supabase
        .from("project_forecast_week_locks")
        .select("project_id, week_start_date")
        .in("project_id", ids)
        .order("project_id")
        .order("week_start_date"),
      supabase
        .from("project_tracks")
        .select("id, project_id")
        .in("project_id", ids)
        .order("project_id")
        .order("id"),
    ]);

  const relationError = [
    phasesRes.error,
    integrationsRes.error,
    forecastsRes.error,
    hoursRes.error,
    locksRes.error,
    tracksRes.error,
  ].find(Boolean);
  if (relationError) {
    console.error("[forecast-data] bulk project relation load failed; using legacy loaders", relationError);
    const loaded = await Promise.all(
      ids.map((id) => loadForecastProjectDTO(supabase, id, ownerId, actualsContext)),
    );
    return loaded.filter((item): item is ForecastProjectDTO => item != null);
  }

  const tracks = tracksRes.data ?? [];
  const trackIds = tracks.map((row) => row.id as string);
  const trackProjectId = new Map(tracks.map((row) => [row.id as string, row.project_id as string]));
  const cutoffIso = forecastActualsCutoffIso(actualsContext);
  const [workRes, manualRes] =
    trackIds.length > 0
      ? await Promise.all([
          supabase
            .from("integration_task_work_sessions")
            .select("duration_hours, finished_at, integration_tasks!inner(project_track_id)")
            .in("integration_tasks.project_track_id", trackIds)
            .not("finished_at", "is", null)
            .lt("finished_at", cutoffIso),
          supabase
            .from("integration_manual_effort_entries")
            .select("duration_hours, finished_at, project_track_id")
            .in("project_track_id", trackIds)
            .not("finished_at", "is", null)
            .lt("finished_at", cutoffIso),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  if (workRes.error || manualRes.error) {
    console.error(
      "[forecast-data] bulk project actuals load failed; using legacy loaders",
      workRes.error ?? manualRes.error,
    );
    const loaded = await Promise.all(
      ids.map((id) => loadForecastProjectDTO(supabase, id, ownerId, actualsContext)),
    );
    return loaded.filter((item): item is ForecastProjectDTO => item != null);
  }

  const actualRowsByProject = new Map<
    string,
    Array<{ duration_hours: number | string; finished_at: string | null }>
  >();
  const addActual = (
    projectId: string | undefined,
    row: { duration_hours: number | string; finished_at: string | null },
  ) => {
    if (!projectId) return;
    const values = actualRowsByProject.get(projectId) ?? [];
    values.push(row);
    actualRowsByProject.set(projectId, values);
  };
  for (const row of workRes.data ?? []) {
    const relation = Array.isArray(row.integration_tasks)
      ? row.integration_tasks[0]
      : row.integration_tasks;
    addActual(trackProjectId.get(relation?.project_track_id), row);
  }
  for (const row of manualRes.data ?? []) {
    addActual(trackProjectId.get(row.project_track_id), row);
  }

  const phasesByProject = groupByParentId(phasesRes.data ?? [], (row) => row.project_id);
  const integrationsByProject = groupByParentId(
    integrationsRes.data ?? [],
    (row) => row.project_id,
  );
  const forecastsByProject = groupByParentId(forecastsRes.data ?? [], (row) => row.project_id);
  const hoursByProject = groupByParentId(hoursRes.data ?? [], (row) => row.project_id);
  const locksByProject = groupByParentId(locksRes.data ?? [], (row) => row.project_id);

  return projects.map((project) =>
    buildProjectDTO({
      project,
      phases: phasesByProject.get(project.id) ?? [],
      integrations: integrationsByProject.get(project.id) ?? [],
      forecast: forecastsByProject.get(project.id)?.[0] ?? null,
      hoursRows: hoursByProject.get(project.id) ?? [],
      lockRows: locksByProject.get(project.id) ?? [],
      actualHours: normalizedActualHours(actualRowsByProject.get(project.id) ?? [], cutoffIso),
    }),
  );
}

async function loadAllActiveForecastInitiatives(
  supabase: SupabaseClient,
  ownerId: string,
  actualsContext: ForecastActualsContext,
): Promise<ForecastProjectDTO[]> {
  const { data: initiatives, error: initiativesError } = await supabase
    .from("internal_initiatives")
    .select("id, title, starts_on, ends_on, estimated_effort_hours")
    .eq("owner_id", ownerId)
    .eq("include_in_forecast", true)
    .is("completed_at", null)
    .order("starts_on", { ascending: true });

  if (initiativesError) {
    console.error("[forecast-data] active initiatives load failed", initiativesError);
    return [];
  }
  if (!initiatives?.length) return [];

  const ids = initiatives.map((row) => row.id);
  const [tasksRes, forecastsRes, hoursRes, locksRes, manualRes] = await Promise.all([
    supabase
      .from("internal_tasks")
      .select("id, internal_initiative_id")
      .in("internal_initiative_id", ids)
      .order("internal_initiative_id")
      .order("id"),
    supabase
      .from("initiative_forecasts")
      .select("initiative_id, start_date, generated_at")
      .in("initiative_id", ids)
      .order("initiative_id"),
    supabase
      .from("initiative_forecast_hours")
      .select("initiative_id, week_start_date, hours")
      .in("initiative_id", ids)
      .order("initiative_id")
      .order("week_start_date"),
    supabase
      .from("initiative_forecast_week_locks")
      .select("initiative_id, week_start_date")
      .in("initiative_id", ids)
      .order("initiative_id")
      .order("week_start_date"),
    supabase
      .from("internal_initiative_manual_effort_entries")
      .select("internal_initiative_id, duration_hours, finished_at")
      .in("internal_initiative_id", ids)
      .not("finished_at", "is", null)
      .lt("finished_at", forecastActualsCutoffIso(actualsContext)),
  ]);

  const relationError = [
    tasksRes.error,
    forecastsRes.error,
    hoursRes.error,
    locksRes.error,
    manualRes.error,
  ].find(Boolean);
  if (relationError) {
    console.error(
      "[forecast-data] bulk initiative relation load failed; using legacy loaders",
      relationError,
    );
    const loaded = await Promise.all(
      ids.map((id) => loadForecastInitiativeDTO(supabase, id, ownerId, actualsContext)),
    );
    return loaded.filter((item): item is ForecastProjectDTO => item != null);
  }

  const tasks = tasksRes.data ?? [];
  const taskIds = tasks.map((row) => row.id as string);
  const taskInitiativeId = new Map(
    tasks.map((row) => [row.id as string, row.internal_initiative_id as string]),
  );
  const cutoffIso = forecastActualsCutoffIso(actualsContext);
  const workRes =
    taskIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("internal_task_work_sessions")
          .select("internal_task_id, duration_hours, finished_at")
          .in("internal_task_id", taskIds)
          .not("finished_at", "is", null)
          .lt("finished_at", cutoffIso);
  if (workRes.error) {
    console.error(
      "[forecast-data] bulk initiative actuals load failed; using legacy loaders",
      workRes.error,
    );
    const loaded = await Promise.all(
      ids.map((id) => loadForecastInitiativeDTO(supabase, id, ownerId, actualsContext)),
    );
    return loaded.filter((item): item is ForecastProjectDTO => item != null);
  }

  const actualRowsByInitiative = groupByParentId(
    [
      ...(workRes.data ?? []).map((row) => ({
        ...row,
        initiative_id: taskInitiativeId.get(row.internal_task_id),
      })),
      ...(manualRes.data ?? []).map((row) => ({
        ...row,
        initiative_id: row.internal_initiative_id,
      })),
    ],
    (row) => row.initiative_id,
  );
  const forecastsByInitiative = groupByParentId(
    forecastsRes.data ?? [],
    (row) => row.initiative_id,
  );
  const hoursByInitiative = groupByParentId(hoursRes.data ?? [], (row) => row.initiative_id);
  const locksByInitiative = groupByParentId(locksRes.data ?? [], (row) => row.initiative_id);

  return initiatives.map((initiative) =>
    buildInitiativeDTO({
      initiative,
      forecast: forecastsByInitiative.get(initiative.id)?.[0] ?? null,
      hoursRows: hoursByInitiative.get(initiative.id) ?? [],
      lockRows: locksByInitiative.get(initiative.id) ?? [],
      actualHours: normalizedActualHours(
        actualRowsByInitiative.get(initiative.id) ?? [],
        cutoffIso,
      ),
    }),
  );
}

export async function loadAllActiveForecastItems(
  supabase: SupabaseClient,
  ownerId: string,
  actualsContext: ForecastActualsContext,
): Promise<ForecastProjectDTO[]> {
  const [projects, initiatives] = await Promise.all([
    loadAllActiveForecastProjects(supabase, ownerId, actualsContext),
    loadAllActiveForecastInitiatives(supabase, ownerId, actualsContext),
  ]);
  return [...projects, ...initiatives];
}

/** Sum effort sessions already loaded on the project page. */
export function actualsFromEffortSessions(
  sessions: ProjectEffortSessionInput[],
): number {
  let total = 0;
  for (const s of sessions) {
    const h = Number(s.duration_hours);
    if (!Number.isFinite(h) || h <= 0) continue;
    total += h;
  }
  return total;
}
