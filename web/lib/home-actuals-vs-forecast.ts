import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type EffortSessionInput,
  effortProratedHoursByLocalDay,
} from "@/lib/integration-effort-buckets";
import { currentSundayWeekYmd } from "@/lib/project-forecast";
import { sundayWeekWindowFromAnchorYmd } from "@/lib/timesheet-week";
import { addDaysYmd } from "@/lib/zoned-datetime";

export const HOME_VARIANCE_TREND_WEEKS = 12;

export type HomeWeekTotals = {
  forecast: number;
  actual: number;
  variance: number;
};

export type HomeActualsVsForecastProject = {
  id: string;
  name: string;
  kind: "project" | "initiative";
  isIcp: boolean;
  byWeek: Record<string, HomeWeekTotals>;
};

export type HomeActualsVsForecastDTO = {
  thisWeek: HomeWeekTotals;
  priorWeek: HomeWeekTotals;
  /** Sunday YYYY-MM-DD, oldest → newest (this week last). */
  weeks: string[];
  projects: HomeActualsVsForecastProject[];
};

export function varianceHours(forecast: number, actual: number): number {
  const f = Number.isFinite(forecast) ? forecast : 0;
  const a = Number.isFinite(actual) ? actual : 0;
  return f - a;
}

/** Absolute percent of forecast (|variance| / forecast × 100). Null when forecast is 0. */
export function variancePercentAbs(forecast: number, variance: number): number | null {
  if (!Number.isFinite(forecast) || forecast <= 0) return null;
  if (!Number.isFinite(variance)) return null;
  return (Math.abs(variance) / forecast) * 100;
}

/** Percent of forecast; positive variance → under, negative → over. */
export function variancePercentLabel(forecast: number, variance: number): string | null {
  const abs = variancePercentAbs(forecast, variance);
  if (abs == null) return null;
  const pct = Math.round(abs);
  if (variance === 0 || Math.abs(variance) < 1e-9) return "0%";
  if (variance > 0) return `${pct}% under`;
  return `${pct}% over`;
}

/** True when |variance| is within `thresholdPct` of forecast (inclusive). */
export function isVarianceWithinPercent(
  forecast: number,
  variance: number,
  thresholdPct = 5,
): boolean {
  const abs = variancePercentAbs(forecast, variance);
  if (abs == null) return false;
  return abs <= thresholdPct;
}

export function makeWeekTotals(forecast: number, actual: number): HomeWeekTotals {
  const f = Number.isFinite(forecast) && forecast > 0 ? forecast : 0;
  const a = Number.isFinite(actual) && actual > 0 ? actual : 0;
  return { forecast: f, actual: a, variance: varianceHours(f, a) };
}

/** True when a week has a forecast to compare against. */
export function hasForecastHours(forecast: number): boolean {
  return Number.isFinite(forecast) && forecast > 0;
}

/** Sum forecast/actual across weeks that have a forecast (skips weeks with no forecast). */
export function sumWeekTotals(
  byWeek: Record<string, HomeWeekTotals>,
  weeks: string[],
): HomeWeekTotals {
  let forecast = 0;
  let actual = 0;
  for (const w of weeks) {
    const t = byWeek[w];
    if (!t || !hasForecastHours(t.forecast)) continue;
    forecast += t.forecast;
    actual += t.actual;
  }
  return makeWeekTotals(forecast, actual);
}

/** Last `count` Sunday week starts ending at the week containing `todayIso` (oldest → newest). */
export function lastSundayWeeksEndingThisWeek(todayIso: string, count = HOME_VARIANCE_TREND_WEEKS): string[] {
  const currentSunday = currentSundayWeekYmd(todayIso);
  const n = Math.max(1, Math.floor(count));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(addDaysYmd(currentSunday, -7 * i));
  }
  return out;
}

/** Completed weeks for Variance Trends (drops the in-progress current week). */
export function varianceTrendWeeks(weeks: string[]): string[] {
  if (weeks.length <= 1) return [];
  return weeks.slice(0, -1);
}

function hoursForSundayWeek(sessions: EffortSessionInput[], weekStartYmd: string): number {
  const { weekStart, weekEndExclusive } = sundayWeekWindowFromAnchorYmd(weekStartYmd);
  const byDay = effortProratedHoursByLocalDay(sessions, weekStart, weekEndExclusive);
  let sum = 0;
  for (const v of byDay.values()) sum += v;
  return sum;
}

/** Prorated hours for a Sunday week (exported for Work forecast track chips). */
export function effortHoursForSundayWeek(
  sessions: EffortSessionInput[],
  weekStartYmd: string,
): number {
  return hoursForSundayWeek(sessions, weekStartYmd);
}

function emptyByWeek(weeks: string[]): Record<string, HomeWeekTotals> {
  const out: Record<string, HomeWeekTotals> = {};
  for (const w of weeks) out[w] = makeWeekTotals(0, 0);
  return out;
}

function sumTotals(parts: HomeWeekTotals[]): HomeWeekTotals {
  let forecast = 0;
  let actual = 0;
  for (const p of parts) {
    forecast += p.forecast;
    actual += p.actual;
  }
  return makeWeekTotals(forecast, actual);
}

export function sumForecastItemsForWeek(
  items: HomeActualsVsForecastProject[],
  week: string,
): HomeWeekTotals {
  return sumTotals(items.map((item) => item.byWeek[week] ?? makeWeekTotals(0, 0)));
}

async function loadHomeInitiativeRows(
  supabase: SupabaseClient,
  ownerId: string,
  weeks: string[],
  windowStartYmd: string,
  windowEndExclusiveYmd: string,
): Promise<HomeActualsVsForecastProject[]> {
  const { data: initiatives, error } = await supabase
    .from("internal_initiatives")
    .select("id, title, icp")
    .eq("owner_id", ownerId)
    .eq("include_in_forecast", true)
    .is("completed_at", null)
    .order("starts_on", { ascending: true });
  if (error || !initiatives?.length) {
    if (error) console.error("[home-actuals-vs-forecast] initiatives load failed", error);
    return [];
  }

  const initiativeIds = initiatives.map((row) => row.id as string);
  const { data: tasks } = await supabase
    .from("internal_tasks")
    .select("id, internal_initiative_id")
    .in("internal_initiative_id", initiativeIds);
  const taskIds = (tasks ?? []).map((task) => task.id as string);
  const initiativeIdByTaskId = new Map(
    (tasks ?? []).map((task) => [task.id as string, task.internal_initiative_id as string]),
  );
  const windowStartIso = `${windowStartYmd}T00:00:00.000Z`;
  const windowEndExclusiveIso = `${windowEndExclusiveYmd}T00:00:00.000Z`;

  const [forecastRes, workRes, manualRes] = await Promise.all([
    supabase
      .from("initiative_forecast_hours")
      .select("initiative_id, week_start_date, hours")
      .in("initiative_id", initiativeIds)
      .gte("week_start_date", windowStartYmd)
      .lt("week_start_date", windowEndExclusiveYmd),
    taskIds.length === 0
      ? Promise.resolve({ data: [] as unknown[], error: null })
      : supabase
          .from("internal_task_work_sessions")
          .select("id, internal_task_id, started_at, finished_at, duration_hours")
          .in("internal_task_id", taskIds)
          .not("finished_at", "is", null)
          .lt("started_at", windowEndExclusiveIso)
          .gt("finished_at", windowStartIso),
    supabase
      .from("internal_initiative_manual_effort_entries")
      .select("id, internal_initiative_id, started_at, finished_at, duration_hours")
      .in("internal_initiative_id", initiativeIds)
      .not("finished_at", "is", null)
      .lt("started_at", windowEndExclusiveIso)
      .gt("finished_at", windowStartIso),
  ]);

  const forecastByItemWeek = new Map<string, number>();
  for (const row of forecastRes.data ?? []) {
    const key = `${row.initiative_id}|${String(row.week_start_date).slice(0, 10)}`;
    forecastByItemWeek.set(key, (forecastByItemWeek.get(key) ?? 0) + Math.max(0, Math.round(Number(row.hours) || 0)));
  }
  const sessionsByInitiative = new Map<string, EffortSessionInput[]>(
    initiativeIds.map((id) => [id, []]),
  );
  const addSession = (
    initiativeId: string | undefined,
    row: {
      id: string;
      started_at: string;
      finished_at: string;
      duration_hours: number | string;
    },
    source: "task_work_session" | "manual",
  ) => {
    if (!initiativeId || !row.finished_at) return;
    const duration = Number(row.duration_hours);
    if (!Number.isFinite(duration) || duration <= 0) return;
    sessionsByInitiative.get(initiativeId)?.push({
      source,
      source_id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: duration,
      integration_task_id: null,
      title: "Initiative effort",
      work_accomplished: null,
    });
  };
  for (const row of (workRes.data ?? []) as Array<{
    id: string;
    internal_task_id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
  }>) {
    addSession(initiativeIdByTaskId.get(row.internal_task_id), row, "task_work_session");
  }
  for (const row of (manualRes.data ?? []) as Array<{
    id: string;
    internal_initiative_id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
  }>) {
    addSession(row.internal_initiative_id, row, "manual");
  }

  return initiatives.map((initiative) => {
    const byWeek = emptyByWeek(weeks);
    const sessions = sessionsByInitiative.get(initiative.id) ?? [];
    for (const week of weeks) {
      byWeek[week] = makeWeekTotals(
        forecastByItemWeek.get(`${initiative.id}|${week}`) ?? 0,
        hoursForSundayWeek(sessions, week),
      );
    }
    return {
      id: initiative.id,
      name: String(initiative.title ?? "").trim() || "Untitled initiative",
      kind: "initiative" as const,
      isIcp: Boolean(initiative.icp),
      byWeek,
    };
  });
}

export async function loadHomeActualsVsForecast(
  supabase: SupabaseClient,
  ownerId: string,
  todayIso: string,
  options?: { projectId?: string },
): Promise<HomeActualsVsForecastDTO> {
  /** +1 week in the load window so trends can show 12 completed weeks excluding this week. */
  const weeks = lastSundayWeeksEndingThisWeek(todayIso, HOME_VARIANCE_TREND_WEEKS + 1);
  const currentSunday = weeks[weeks.length - 1]!;
  const priorSunday = weeks.length >= 2 ? weeks[weeks.length - 2]! : addDaysYmd(currentSunday, -7);
  const windowStartYmd = weeks[0]!;
  const windowEndExclusiveYmd = addDaysYmd(currentSunday, 7);
  const onlyProjectId = options?.projectId?.trim() || null;

  const empty: HomeActualsVsForecastDTO = {
    thisWeek: makeWeekTotals(0, 0),
    priorWeek: makeWeekTotals(0, 0),
    weeks,
    projects: [],
  };

  let projectQuery = supabase
    .from("projects")
    .select("id, customer_name")
    .eq("owner_id", ownerId);

  if (onlyProjectId) {
    projectQuery = projectQuery.eq("id", onlyProjectId);
  } else {
    projectQuery = projectQuery
      .is("completed_at", null)
      .order("active_dashboard_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  const { data: projectRows, error: projErr } = await projectQuery;

  if (projErr) {
    console.error("[home-actuals-vs-forecast] projects load failed", projErr);
    return empty;
  }

  const projects = (projectRows ?? []).map((p) => ({
    id: p.id as string,
    name: String(p.customer_name ?? "").trim() || "Untitled project",
  }));

  if (projects.length === 0) {
    if (onlyProjectId) return empty;
    const initiativeRows = await loadHomeInitiativeRows(
      supabase,
      ownerId,
      weeks,
      windowStartYmd,
      windowEndExclusiveYmd,
    );
    return {
      thisWeek: sumForecastItemsForWeek(initiativeRows, currentSunday),
      priorWeek: sumForecastItemsForWeek(initiativeRows, priorSunday),
      weeks,
      projects: initiativeRows,
    };
  }

  const projectIds = projects.map((p) => p.id);

  const { data: trackRows, error: trackErr } = await supabase
    .from("project_tracks")
    .select("id, project_id")
    .in("project_id", projectIds);

  if (trackErr) {
    console.error("[home-actuals-vs-forecast] tracks load failed", trackErr);
  }

  const trackIds = (trackRows ?? []).map((t) => t.id as string);
  const projectIdByTrackId = new Map<string, string>();
  for (const t of trackRows ?? []) {
    projectIdByTrackId.set(t.id as string, t.project_id as string);
  }

  const windowStartIso = `${windowStartYmd}T00:00:00.000Z`;
  const windowEndExclusiveIso = `${windowEndExclusiveYmd}T00:00:00.000Z`;

  const [forecastRes, wsRes, meRes] = await Promise.all([
    supabase
      .from("project_forecast_hours")
      .select("project_id, week_start_date, hours")
      .in("project_id", projectIds)
      .gte("week_start_date", windowStartYmd)
      .lte("week_start_date", currentSunday),
    trackIds.length === 0
      ? Promise.resolve({ data: null as unknown[] | null, error: null })
      : supabase
          .from("integration_task_work_sessions")
          .select(
            "id, started_at, finished_at, duration_hours, integration_tasks!inner(project_track_id)",
          )
          .in("integration_tasks.project_track_id", trackIds)
          .not("finished_at", "is", null)
          .lt("started_at", windowEndExclusiveIso)
          .gt("finished_at", windowStartIso),
    trackIds.length === 0
      ? Promise.resolve({ data: null as unknown[] | null, error: null })
      : supabase
          .from("integration_manual_effort_entries")
          .select("id, started_at, finished_at, duration_hours, project_track_id")
          .in("project_track_id", trackIds)
          .not("finished_at", "is", null)
          .lt("started_at", windowEndExclusiveIso)
          .gt("finished_at", windowStartIso),
  ]);

  if (forecastRes.error) {
    console.error("[home-actuals-vs-forecast] forecast hours load failed", forecastRes.error);
  }
  if (wsRes.error) {
    console.error("[home-actuals-vs-forecast] work sessions load failed", wsRes.error);
  }
  if (meRes.error) {
    console.error("[home-actuals-vs-forecast] manual effort load failed", meRes.error);
  }

  const forecastByProjectWeek = new Map<string, number>();
  for (const row of forecastRes.data ?? []) {
    const projectId = row.project_id as string;
    const week = String(row.week_start_date).slice(0, 10);
    const hours = Math.max(0, Math.round(Number(row.hours) || 0));
    if (!weeks.includes(week)) continue;
    const key = `${projectId}|${week}`;
    forecastByProjectWeek.set(key, (forecastByProjectWeek.get(key) ?? 0) + hours);
  }

  const sessionsByProject = new Map<string, EffortSessionInput[]>();
  for (const id of projectIds) sessionsByProject.set(id, []);

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
    if (!trackId || !row.finished_at) continue;
    const projectId = projectIdByTrackId.get(trackId);
    if (!projectId) continue;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    sessionsByProject.get(projectId)?.push({
      source: "task_work_session",
      source_id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: dh,
      integration_task_id: null,
      title: "Task",
      work_accomplished: null,
    });
  }

  for (const row of (meRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number;
    project_track_id: string;
  }>) {
    const projectId = projectIdByTrackId.get(row.project_track_id);
    if (!projectId) continue;
    const dh = Number(row.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    sessionsByProject.get(projectId)?.push({
      source: "manual",
      source_id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: dh,
      integration_task_id: null,
      title: "Task",
      work_accomplished: null,
    });
  }

  const resultProjects: HomeActualsVsForecastProject[] = projects.map((p) => {
    const byWeek = emptyByWeek(weeks);
    const sessions = sessionsByProject.get(p.id) ?? [];
    for (const week of weeks) {
      const forecast = forecastByProjectWeek.get(`${p.id}|${week}`) ?? 0;
      const actual = hoursForSundayWeek(sessions, week);
      byWeek[week] = makeWeekTotals(forecast, actual);
    }
    return { id: p.id, name: p.name, kind: "project" as const, isIcp: false, byWeek };
  });

  if (!onlyProjectId) {
    resultProjects.push(
      ...(await loadHomeInitiativeRows(
        supabase,
        ownerId,
        weeks,
        windowStartYmd,
        windowEndExclusiveYmd,
      )),
    );
  }

  return {
    thisWeek: sumForecastItemsForWeek(resultProjects, currentSunday),
    priorWeek: sumForecastItemsForWeek(resultProjects, priorSunday),
    weeks,
    projects: resultProjects,
  };
}
