/**
 * Utilization quarter loader: target vs actuals vs forecast across Sunday weeks.
 * Scope: all active projects + ICP initiatives (forecast flag not required for attainment).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clipLocalRange,
  currentSundayFromTodayYmd,
  paceHoursPerWeekWeighted,
  resolveFiscalQuarter,
  shiftFiscalQuarter,
  sundayWeeksOverlappingRange,
  weekOverlapInQuarter,
  weekRelativeToToday,
  type FiscalQuarterIdentity,
} from "@/lib/fiscal-quarter";
import {
  type EffortSessionInput,
  effortProratedHoursByLocalDay,
  localDayStart,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import type { EffortQuarterConfig } from "@/lib/project-weekly-effort";
import { sundayWeekWindowFromAnchorYmd } from "@/lib/timesheet-week";

export type UtilizationInsightStatus =
  | "on_track"
  | "at_risk"
  | "ahead"
  | "shortfall"
  | "no_target";

export type UtilizationWeekRow = {
  weekStartYmd: string;
  paceHours: number;
  actualHours: number;
  forecastHours: number;
  relative: "past" | "current" | "future";
};

export type UtilizationInsight = {
  status: UtilizationInsightStatus;
  message: string;
  /** Optional second line (e.g. shortfall weekly pace guidance). */
  detail?: string;
};

export type UtilizationQuarterDTO = {
  label: string;
  fiscalYear: number;
  quarter: number;
  quarterStartYmd: string;
  endExclusiveYmd: string;
  prevQuarterStartYmd: string;
  nextQuarterStartYmd: string;
  targetHours: number | null;
  actualHours: number;
  forecastHours: number;
  utilizationPct: number | null;
  weeks: UtilizationWeekRow[];
  insight: UtilizationInsight;
};

/**
 * Actual hours for a Sunday week, clipped to days inside the fiscal quarter.
 * e.g. week of Jul 26 in FY27 Q3 (Aug 1–Oct 31) only counts Saturday Aug 1.
 */
function hoursForSundayWeekInQuarter(
  sessions: EffortSessionInput[],
  weekStartYmd: string,
  quarterStart: Date,
  quarterEndExclusive: Date,
): number {
  const { weekStart, weekEndExclusive } = sundayWeekWindowFromAnchorYmd(weekStartYmd);
  const clipped = clipLocalRange(
    weekStart,
    weekEndExclusive,
    localDayStart(quarterStart),
    localDayStart(quarterEndExclusive),
  );
  if (!clipped) return 0;
  const byDay = effortProratedHoursByLocalDay(sessions, clipped.start, clipped.endExclusive);
  let sum = 0;
  for (const v of byDay.values()) sum += v;
  return sum;
}

function roundHours(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 4) / 4;
}

function buildInsight(args: {
  targetHours: number | null;
  weeks: UtilizationWeekRow[];
  todayYmd: string;
}): UtilizationInsight {
  const { targetHours, weeks, todayYmd } = args;
  if (targetHours == null || targetHours <= 0) {
    return {
      status: "no_target",
      message: "Set a target for this quarter to track attainment.",
    };
  }

  const currentSunday = currentSundayFromTodayYmd(todayYmd);
  const quarterFullyPast =
    weeks.length > 0 && weeks.every((w) => w.weekStartYmd < currentSunday);

  let cumulativePace = 0;
  let cumulativeActual = 0;
  /** Hours still expected from the plan: future forecast + current week (max of actual vs forecast). */
  let projectedHours = 0;

  for (const w of weeks) {
    if (w.weekStartYmd < currentSunday) {
      cumulativePace += w.paceHours;
      cumulativeActual += w.actualHours;
      projectedHours += w.actualHours;
    } else if (w.weekStartYmd === currentSunday) {
      cumulativePace += w.paceHours;
      cumulativeActual += w.actualHours;
      projectedHours += Math.max(w.actualHours, w.forecastHours);
    } else {
      projectedHours += w.forecastHours;
    }
  }

  const remainingToTarget = Math.max(0, targetHours - cumulativeActual);
  const aheadBy = cumulativeActual - cumulativePace;
  const utilizationPct = Math.round((cumulativeActual / targetHours) * 1000) / 10;
  const coverageShortfall = Math.max(0, targetHours - projectedHours);

  if (quarterFullyPast) {
    if (cumulativeActual + 0.25 >= targetHours) {
      return {
        status: cumulativeActual > targetHours + 1 ? "ahead" : "on_track",
        message: `Quarter complete at ${utilizationPct}% attainment (${formatShortHours(cumulativeActual)} of ${formatShortHours(targetHours)}).`,
      };
    }
    return {
      status: "at_risk",
      message: `Quarter finished at ${utilizationPct}% attainment — ${formatShortHours(remainingToTarget)} short of the ${formatShortHours(targetHours)} target.`,
    };
  }

  // Plan coverage first: actuals + remaining forecast must reach the target.
  if (coverageShortfall > 0.25) {
    const remainingWorkWeeks = weeks.filter(
      (w) => w.weekStartYmd >= currentSunday && w.paceHours > 0,
    ).length;
    const perWeek =
      remainingWorkWeeks > 0
        ? Math.round((coverageShortfall / remainingWorkWeeks) * 4) / 4
        : coverageShortfall;
    const detail =
      remainingWorkWeeks > 0
        ? `About ${formatShortHours(perWeek)}/week across the remaining ${remainingWorkWeeks} work week${remainingWorkWeeks === 1 ? "" : "s"} to close the gap.`
        : "No work weeks remain — the gap cannot be closed in this quarter.";
    return {
      status: "shortfall",
      message: `Actuals and forecast cover ${formatShortHours(projectedHours)} of the ${formatShortHours(targetHours)} target — ${formatShortHours(coverageShortfall)} short.`,
      detail,
    };
  }

  if (aheadBy >= 1) {
    return {
      status: "ahead",
      message: `Ahead of pace by ${formatShortHours(aheadBy)}.`,
      detail: `${formatShortHours(remainingToTarget)} left to hit target; forecast covers the rest.`,
    };
  }

  if (aheadBy >= -1) {
    return {
      status: "on_track",
      message: `On pace for the quarter.`,
      detail: `${formatShortHours(remainingToTarget)} left to hit target; forecast covers the plan.`,
    };
  }

  const gap = Math.abs(aheadBy);
  return {
    status: "at_risk",
    message: `Behind pace by ${formatShortHours(gap)}, but forecast still covers the ${formatShortHours(remainingToTarget)} needed for the target.`,
  };
}

function formatShortHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

async function loadProjectWeekHours(
  supabase: SupabaseClient,
  ownerId: string,
  weeks: string[],
  windowStartYmd: string,
  windowEndExclusiveYmd: string,
  quarterStart: Date,
  quarterEndExclusive: Date,
  weekFractions: Map<string, number>,
): Promise<{ actualByWeek: Map<string, number>; forecastByWeek: Map<string, number> }> {
  const actualByWeek = new Map<string, number>(weeks.map((w) => [w, 0]));
  const forecastByWeek = new Map<string, number>(weeks.map((w) => [w, 0]));

  const { data: projectRows, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", ownerId)
    .is("completed_at", null);

  if (projErr) {
    console.error("[utilization] projects load failed", projErr);
    return { actualByWeek, forecastByWeek };
  }

  const projectIds = (projectRows ?? []).map((p) => p.id as string);
  if (projectIds.length === 0) return { actualByWeek, forecastByWeek };

  const { data: trackRows } = await supabase
    .from("project_tracks")
    .select("id, project_id")
    .in("project_id", projectIds);

  const trackIds = (trackRows ?? []).map((t) => t.id as string);
  const projectIdByTrackId = new Map<string, string>();
  for (const t of trackRows ?? []) {
    projectIdByTrackId.set(t.id as string, t.project_id as string);
  }

  const windowStartIso = `${windowStartYmd}T00:00:00.000Z`;
  const windowEndExclusiveIso = `${windowEndExclusiveYmd}T00:00:00.000Z`;
  const lastWeek = weeks[weeks.length - 1]!;

  const [forecastRes, wsRes, meRes] = await Promise.all([
    supabase
      .from("project_forecast_hours")
      .select("project_id, week_start_date, hours")
      .in("project_id", projectIds)
      .gte("week_start_date", weeks[0]!)
      .lte("week_start_date", lastWeek),
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
    console.error("[utilization] project forecast load failed", forecastRes.error);
  }
  for (const row of forecastRes.data ?? []) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!forecastByWeek.has(week)) continue;
    const fraction = weekFractions.get(week) ?? 0;
    if (fraction <= 0) continue;
    const hours = Math.max(0, Number(row.hours) || 0) * fraction;
    forecastByWeek.set(week, (forecastByWeek.get(week) ?? 0) + hours);
  }

  const sessionsByProject = new Map<string, EffortSessionInput[]>();
  for (const id of projectIds) sessionsByProject.set(id, []);

  const pushSession = (
    projectId: string | undefined,
    row: { id: string; started_at: string; finished_at: string; duration_hours: number | string },
    source: "task_work_session" | "manual",
  ) => {
    if (!projectId || !row.finished_at) return;
    const duration = Number(row.duration_hours);
    if (!Number.isFinite(duration) || duration <= 0) return;
    sessionsByProject.get(projectId)?.push({
      source,
      source_id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: duration,
      integration_task_id: null,
      title: "Project effort",
      work_accomplished: null,
    });
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
    pushSession(trackId ? projectIdByTrackId.get(trackId) : undefined, row, "task_work_session");
  }

  for (const row of (meRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number;
    project_track_id: string;
  }>) {
    pushSession(projectIdByTrackId.get(row.project_track_id), row, "manual");
  }

  for (const sessions of sessionsByProject.values()) {
    for (const week of weeks) {
      const h = hoursForSundayWeekInQuarter(
        sessions,
        week,
        quarterStart,
        quarterEndExclusive,
      );
      if (h > 0) actualByWeek.set(week, (actualByWeek.get(week) ?? 0) + h);
    }
  }

  return { actualByWeek, forecastByWeek };
}

async function loadIcpInitiativeWeekHours(
  supabase: SupabaseClient,
  ownerId: string,
  weeks: string[],
  windowStartYmd: string,
  windowEndExclusiveYmd: string,
  quarterStart: Date,
  quarterEndExclusive: Date,
  weekFractions: Map<string, number>,
): Promise<{ actualByWeek: Map<string, number>; forecastByWeek: Map<string, number> }> {
  const actualByWeek = new Map<string, number>(weeks.map((w) => [w, 0]));
  const forecastByWeek = new Map<string, number>(weeks.map((w) => [w, 0]));

  const { data: initiatives, error } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("icp", true)
    .is("completed_at", null);

  if (error) {
    console.error("[utilization] ICP initiatives load failed", error);
    return { actualByWeek, forecastByWeek };
  }

  const initiativeIds = (initiatives ?? []).map((row) => row.id as string);
  if (initiativeIds.length === 0) return { actualByWeek, forecastByWeek };

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
  const lastWeek = weeks[weeks.length - 1]!;

  const [forecastRes, workRes, manualRes] = await Promise.all([
    supabase
      .from("initiative_forecast_hours")
      .select("initiative_id, week_start_date, hours")
      .in("initiative_id", initiativeIds)
      .gte("week_start_date", weeks[0]!)
      .lte("week_start_date", lastWeek),
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

  if (forecastRes.error) {
    console.error("[utilization] initiative forecast load failed", forecastRes.error);
  }
  for (const row of forecastRes.data ?? []) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!forecastByWeek.has(week)) continue;
    const fraction = weekFractions.get(week) ?? 0;
    if (fraction <= 0) continue;
    const hours = Math.max(0, Number(row.hours) || 0) * fraction;
    forecastByWeek.set(week, (forecastByWeek.get(week) ?? 0) + hours);
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

  for (const sessions of sessionsByInitiative.values()) {
    for (const week of weeks) {
      const h = hoursForSundayWeekInQuarter(
        sessions,
        week,
        quarterStart,
        quarterEndExclusive,
      );
      if (h > 0) actualByWeek.set(week, (actualByWeek.get(week) ?? 0) + h);
    }
  }

  return { actualByWeek, forecastByWeek };
}

function mergeWeekMaps(
  a: Map<string, number>,
  b: Map<string, number>,
  weeks: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of weeks) {
    out.set(w, (a.get(w) ?? 0) + (b.get(w) ?? 0));
  }
  return out;
}

function emptyDto(
  identity: FiscalQuarterIdentity,
  config: EffortQuarterConfig,
  todayYmd: string,
): UtilizationQuarterDTO {
  const weeksYmcs = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
  const dayWeights = weeksYmcs.map(
    (w) => weekOverlapInQuarter(w, identity.start, identity.endExclusive).days,
  );
  const pace = paceHoursPerWeekWeighted(0, dayWeights);
  const weeks: UtilizationWeekRow[] = weeksYmcs.map((weekStartYmd, i) => ({
    weekStartYmd,
    paceHours: pace[i] ?? 0,
    actualHours: 0,
    forecastHours: 0,
    relative: weekRelativeToToday(weekStartYmd, todayYmd),
  }));
  const prev = shiftFiscalQuarter(identity, -1, config);
  const next = shiftFiscalQuarter(identity, 1, config);
  return {
    label: identity.label,
    fiscalYear: identity.fiscalYear,
    quarter: identity.quarter,
    quarterStartYmd: identity.quarterStartYmd,
    endExclusiveYmd: identity.endExclusiveYmd,
    prevQuarterStartYmd: prev.quarterStartYmd,
    nextQuarterStartYmd: next.quarterStartYmd,
    targetHours: null,
    actualHours: 0,
    forecastHours: 0,
    utilizationPct: null,
    weeks,
    insight: buildInsight({ targetHours: null, weeks, todayYmd }),
  };
}

export async function loadUtilizationQuarter(
  supabase: SupabaseClient,
  ownerId: string,
  todayYmd: string,
  quarterConfig: EffortQuarterConfig,
  quarterStartYmd?: string | null,
): Promise<UtilizationQuarterDTO> {
  const anchor = quarterStartYmd?.trim()
    ? parseLocalYmd(quarterStartYmd.trim())
    : parseLocalYmd(todayYmd);
  const identity = resolveFiscalQuarter(
    Number.isNaN(anchor.getTime()) ? new Date() : anchor,
    quarterConfig,
  );

  const weeksYmcs = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
  if (weeksYmcs.length === 0) {
    return emptyDto(identity, quarterConfig, todayYmd);
  }

  // Load sessions overlapping the quarter calendar (Aug 1–Oct 31), not pre-quarter week days.
  const windowStartYmd = identity.quarterStartYmd;
  const windowEndExclusiveYmd = identity.endExclusiveYmd;

  const weekFractions = new Map<string, number>();
  const dayWeights: number[] = [];
  for (const w of weeksYmcs) {
    const overlap = weekOverlapInQuarter(w, identity.start, identity.endExclusive);
    weekFractions.set(w, overlap.fraction);
    dayWeights.push(overlap.days);
  }

  const [targetRes, projectHours, initiativeHours] = await Promise.all([
    supabase
      .from("utilization_quarter_targets")
      .select("target_hours")
      .eq("owner_id", ownerId)
      .eq("quarter_start_date", identity.quarterStartYmd)
      .maybeSingle(),
    loadProjectWeekHours(
      supabase,
      ownerId,
      weeksYmcs,
      windowStartYmd,
      windowEndExclusiveYmd,
      identity.start,
      identity.endExclusive,
      weekFractions,
    ),
    loadIcpInitiativeWeekHours(
      supabase,
      ownerId,
      weeksYmcs,
      windowStartYmd,
      windowEndExclusiveYmd,
      identity.start,
      identity.endExclusive,
      weekFractions,
    ),
  ]);

  if (targetRes.error) {
    console.error("[utilization] target load failed", targetRes.error);
  }

  const rawTarget = targetRes.data?.target_hours;
  const targetHours =
    rawTarget != null && Number.isFinite(Number(rawTarget)) ? Number(rawTarget) : null;

  const actualByWeek = mergeWeekMaps(
    projectHours.actualByWeek,
    initiativeHours.actualByWeek,
    weeksYmcs,
  );
  const forecastByWeek = mergeWeekMaps(
    projectHours.forecastByWeek,
    initiativeHours.forecastByWeek,
    weeksYmcs,
  );

  const pace = paceHoursPerWeekWeighted(targetHours ?? 0, dayWeights);
  const weeks: UtilizationWeekRow[] = weeksYmcs.map((weekStartYmd, i) => {
    const relative = weekRelativeToToday(weekStartYmd, todayYmd);
    const actualRaw = actualByWeek.get(weekStartYmd) ?? 0;
    // Future weeks: do not count actuals toward the strip fill (should be 0 anyway).
    const actualHours = relative === "future" ? 0 : roundHours(actualRaw);
    return {
      weekStartYmd,
      paceHours: pace[i] ?? 0,
      actualHours,
      forecastHours: roundHours(forecastByWeek.get(weekStartYmd) ?? 0),
      relative,
    };
  });

  let actualHours = 0;
  let forecastHours = 0;
  for (const w of weeks) {
    actualHours += w.actualHours;
    forecastHours += w.forecastHours;
  }
  actualHours = roundHours(actualHours);
  forecastHours = roundHours(forecastHours);

  const utilizationPct =
    targetHours != null && targetHours > 0
      ? Math.round((actualHours / targetHours) * 1000) / 10
      : null;

  const prev = shiftFiscalQuarter(identity, -1, quarterConfig);
  const next = shiftFiscalQuarter(identity, 1, quarterConfig);

  return {
    label: identity.label,
    fiscalYear: identity.fiscalYear,
    quarter: identity.quarter,
    quarterStartYmd: identity.quarterStartYmd,
    endExclusiveYmd: identity.endExclusiveYmd,
    prevQuarterStartYmd: prev.quarterStartYmd,
    nextQuarterStartYmd: next.quarterStartYmd,
    targetHours,
    actualHours,
    forecastHours,
    utilizationPct,
    weeks,
    insight: buildInsight({ targetHours, weeks, todayYmd }),
  };
}

/** Exported for tests / insight preview. */
export { buildInsight, formatShortHours };
