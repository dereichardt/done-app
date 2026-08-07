/**
 * Utilization quarter loader: target vs actuals vs forecast across Sunday weeks.
 * Scope: all active projects + ICP initiatives (forecast flag not required for attainment).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clipLocalRange,
  currentSundayFromTodayYmd,
  localWeekdayCount,
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
  formatLocalYmd,
  localDayStart,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import type { EffortQuarterConfig } from "@/lib/project-weekly-effort";
import {
  countTimeOffWeekdaysInRange,
  isTimeOffType,
  workingWeekdayWeight,
  type TimeOffDay,
} from "@/lib/time-off";
import { sundayWeekWindowFromAnchorYmd } from "@/lib/timesheet-week";
import { DEFAULT_WEEKLY_CAPACITY_HOURS } from "@/lib/user-preferences";

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
  /** Owner-local today used for relative weeks and current-week forecast burn-down. */
  todayYmd: string;
  targetHours: number | null;
  actualHours: number;
  forecastHours: number;
  utilizationPct: number | null;
  weeks: UtilizationWeekRow[];
  insight: UtilizationInsight;
  timeOffDays: TimeOffDay[];
  weeklyCapacityHours: number;
};

export type BlendedQuarterProjection = {
  allActualHours: number;
  remainingCurrentForecastHours: number;
  futureForecastHours: number;
  /** allActuals + remaining current-week forecast + future forecasts */
  projectedHours: number;
  /** remaining current + future — muted pulse segment */
  planForecastHours: number;
  /**
   * Ideal hours by today: past weeks' full pace + current-week pace for
   * fully past working days only (same burn rule as forecast).
   */
  paceToDateHours: number;
};

/** Shared metrics for Home quarter pulse + Utilization status card. */
export type QuarterPulseMetrics = {
  allActualHours: number;
  planForecastHours: number;
  paceToDateHours: number;
  projectedHours: number;
  projectedAttainmentPct: number;
  aheadBy: number;
  hoursLeftToTarget: number;
  coverageShortfall: number;
  workingDaysLeft: number;
  actualFill: number;
  forecastFill: number;
  actualPct: number;
  forecastPct: number;
  pacePct: number;
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

/**
 * Mon–Fri days in a Sunday week that are not time off.
 * `remaining` = working days with ymd >= today (today not burned yet).
 * `past` = working days with ymd < today (fully elapsed).
 */
function currentWeekWorkingDayCounts(
  weekStartYmd: string,
  todayYmd: string,
  timeOffYmds: ReadonlySet<string>,
): { workingDays: number; remainingWorkingDays: number; pastWorkingDays: number } {
  const { weekStart, weekEndExclusive } = sundayWeekWindowFromAnchorYmd(weekStartYmd);
  let workingDays = 0;
  let remainingWorkingDays = 0;
  const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  const end = new Date(
    weekEndExclusive.getFullYear(),
    weekEndExclusive.getMonth(),
    weekEndExclusive.getDate(),
  );
  while (day < end) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = formatLocalYmd(day);
      if (!timeOffYmds.has(ymd)) {
        workingDays += 1;
        // Only fully past working days burn; today still counts as remaining.
        if (ymd >= todayYmd) remainingWorkingDays += 1;
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return {
    workingDays,
    remainingWorkingDays,
    pastWorkingDays: Math.max(0, workingDays - remainingWorkingDays),
  };
}

/**
 * Quarter pulse / coverage projection: all actuals (incl. current week) +
 * remaining current-week forecast (daily burn of fully past Mon–Fri, time-off aware) +
 * future week forecasts. Also returns pace-to-date with the same day burn rule.
 */
function blendedQuarterProjection(args: {
  weeks: UtilizationWeekRow[];
  todayYmd: string;
  timeOffYmds?: ReadonlySet<string>;
}): BlendedQuarterProjection {
  const { weeks, todayYmd } = args;
  const timeOffYmds = args.timeOffYmds ?? new Set<string>();
  const currentSunday = currentSundayFromTodayYmd(todayYmd);

  let allActualHours = 0;
  let remainingCurrentForecastHours = 0;
  let futureForecastHours = 0;
  let paceToDateHours = 0;

  for (const w of weeks) {
    if (w.weekStartYmd < currentSunday) {
      allActualHours += w.actualHours;
      paceToDateHours += w.paceHours;
    } else if (w.weekStartYmd === currentSunday) {
      allActualHours += w.actualHours;
      const { workingDays, remainingWorkingDays, pastWorkingDays } =
        currentWeekWorkingDayCounts(w.weekStartYmd, todayYmd, timeOffYmds);
      if (workingDays > 0) {
        if (w.forecastHours > 0) {
          remainingCurrentForecastHours = roundHours(
            w.forecastHours * (remainingWorkingDays / workingDays),
          );
        }
        if (w.paceHours > 0 && pastWorkingDays > 0) {
          paceToDateHours += roundHours(w.paceHours * (pastWorkingDays / workingDays));
        }
      }
    } else {
      futureForecastHours += w.forecastHours;
    }
  }

  allActualHours = roundHours(allActualHours);
  paceToDateHours = roundHours(paceToDateHours);
  futureForecastHours = roundHours(futureForecastHours);
  const planForecastHours = roundHours(
    remainingCurrentForecastHours + futureForecastHours,
  );
  const projectedHours = roundHours(allActualHours + planForecastHours);

  return {
    allActualHours,
    remainingCurrentForecastHours,
    futureForecastHours,
    projectedHours,
    planForecastHours,
    paceToDateHours,
  };
}

/**
 * Pulse / status metrics from blended projection + target.
 * Used by Home Insights quarter pulse and Utilization status card.
 */
export function quarterPulseMetrics(args: {
  weeks: UtilizationWeekRow[];
  todayYmd: string;
  targetHours: number;
  endExclusiveYmd: string;
  timeOffYmds?: ReadonlySet<string>;
}): QuarterPulseMetrics {
  const { weeks, todayYmd, targetHours, endExclusiveYmd } = args;
  const blend = blendedQuarterProjection({
    weeks,
    todayYmd,
    timeOffYmds: args.timeOffYmds,
  });
  const allActualHours = Math.max(0, blend.allActualHours);
  const planForecastHours = Math.max(0, blend.planForecastHours);
  const paceToDateHours = Math.max(0, blend.paceToDateHours);
  const projectedHours = Math.max(0, blend.projectedHours);
  const actualFill = Math.min(targetHours, allActualHours);
  const forecastFill = Math.min(
    Math.max(0, targetHours - actualFill),
    planForecastHours,
  );
  const start = parseLocalYmd(todayYmd);
  const end = parseLocalYmd(endExclusiveYmd);
  const workingDaysLeft =
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ? 0
      : localWeekdayCount(start, end);

  return {
    allActualHours,
    planForecastHours,
    paceToDateHours,
    projectedHours,
    projectedAttainmentPct:
      targetHours > 0 ? Math.round((projectedHours / targetHours) * 1000) / 10 : 0,
    aheadBy: allActualHours - paceToDateHours,
    hoursLeftToTarget: Math.max(0, targetHours - allActualHours),
    coverageShortfall: Math.max(0, targetHours - projectedHours),
    workingDaysLeft,
    actualFill,
    forecastFill,
    actualPct: targetHours > 0 ? (actualFill / targetHours) * 100 : 0,
    forecastPct: targetHours > 0 ? (forecastFill / targetHours) * 100 : 0,
    pacePct:
      targetHours > 0 ? Math.min(100, (paceToDateHours / targetHours) * 100) : 0,
  };
}

/** Pace chip label shared by Home + Utilization. */
export function paceDeltaLabel(aheadBy: number): { label: string; value: string } {
  if (aheadBy >= 1) {
    return { label: "Ahead of pace by", value: formatShortHours(aheadBy) };
  }
  if (aheadBy <= -1) {
    return { label: "Behind pace by", value: formatShortHours(Math.abs(aheadBy)) };
  }
  return { label: "On pace", value: formatShortHours(0) };
}

function buildInsight(args: {
  targetHours: number | null;
  weeks: UtilizationWeekRow[];
  todayYmd: string;
  timeOffYmds?: ReadonlySet<string>;
}): UtilizationInsight {
  const { targetHours, weeks, todayYmd } = args;
  const timeOffYmds = args.timeOffYmds ?? new Set<string>();
  if (targetHours == null || targetHours <= 0) {
    return {
      status: "no_target",
      message: "Set a target for this quarter to track attainment.",
    };
  }

  const currentSunday = currentSundayFromTodayYmd(todayYmd);
  const quarterFullyPast =
    weeks.length > 0 && weeks.every((w) => w.weekStartYmd < currentSunday);

  const { projectedHours, allActualHours, paceToDateHours } = blendedQuarterProjection({
    weeks,
    todayYmd,
    timeOffYmds,
  });

  const cumulativeActual = allActualHours;
  const cumulativePace = paceToDateHours;
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
  weeklyCapacityHours: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): UtilizationQuarterDTO {
  const weeksYmcs = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
  const dayWeights = weeksYmcs.map(
    (w) => weekOverlapInQuarter(w, identity.start, identity.endExclusive).days,
  );
  const pace = paceHoursPerWeekWeighted(0, dayWeights, weeklyCapacityHours);
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
    todayYmd,
    targetHours: null,
    actualHours: 0,
    forecastHours: 0,
    utilizationPct: null,
    weeks,
    insight: buildInsight({ targetHours: null, weeks, todayYmd }),
    timeOffDays: [],
    weeklyCapacityHours,
  };
}

async function loadTimeOffDays(
  supabase: SupabaseClient,
  ownerId: string,
  startYmd: string,
  endExclusiveYmd: string,
): Promise<TimeOffDay[]> {
  const { data, error } = await supabase
    .from("time_off_days")
    .select("day_date, off_type, other_label")
    .eq("owner_id", ownerId)
    .gte("day_date", startYmd)
    .lt("day_date", endExclusiveYmd)
    .order("day_date", { ascending: true });

  if (error) {
    console.error("[utilization] time off load failed", error);
    return [];
  }

  const out: TimeOffDay[] = [];
  for (const row of data ?? []) {
    const dayYmd = String(row.day_date).slice(0, 10);
    if (!isTimeOffType(row.off_type)) continue;
    out.push({
      dayYmd,
      offType: row.off_type,
      otherLabel:
        row.off_type === "other" && typeof row.other_label === "string"
          ? row.other_label.trim() || null
          : null,
    });
  }
  return out;
}

export async function loadUtilizationQuarter(
  supabase: SupabaseClient,
  ownerId: string,
  todayYmd: string,
  quarterConfig: EffortQuarterConfig,
  quarterStartYmd?: string | null,
  weeklyCapacityHours: number = DEFAULT_WEEKLY_CAPACITY_HOURS,
): Promise<UtilizationQuarterDTO> {
  const capacity =
    Number.isFinite(weeklyCapacityHours) && weeklyCapacityHours > 0
      ? weeklyCapacityHours
      : DEFAULT_WEEKLY_CAPACITY_HOURS;

  const anchor = quarterStartYmd?.trim()
    ? parseLocalYmd(quarterStartYmd.trim())
    : parseLocalYmd(todayYmd);
  const identity = resolveFiscalQuarter(
    Number.isNaN(anchor.getTime()) ? new Date() : anchor,
    quarterConfig,
  );

  const weeksYmcs = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
  if (weeksYmcs.length === 0) {
    return emptyDto(identity, quarterConfig, todayYmd, capacity);
  }

  // Load sessions overlapping the quarter calendar, not pre-quarter week days.
  const windowStartYmd = identity.quarterStartYmd;
  const windowEndExclusiveYmd = identity.endExclusiveYmd;

  const timeOffPromise = loadTimeOffDays(
    supabase,
    ownerId,
    windowStartYmd,
    windowEndExclusiveYmd,
  );

  // Build week fractions first so forecast proration is correct.
  const weekFractions = new Map<string, number>();
  for (const w of weeksYmcs) {
    const overlap = weekOverlapInQuarter(w, identity.start, identity.endExclusive);
    weekFractions.set(w, overlap.fraction);
  }

  const [targetRes, projectHours, initiativeHours, timeOffDays] = await Promise.all([
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
    timeOffPromise,
  ]);

  if (targetRes.error) {
    console.error("[utilization] target load failed", targetRes.error);
  }

  const timeOffYmds = new Set(timeOffDays.map((d) => d.dayYmd));
  const dayWeights: number[] = [];
  for (const w of weeksYmcs) {
    const overlap = weekOverlapInQuarter(w, identity.start, identity.endExclusive);
    const { weekStart, weekEndExclusive } = sundayWeekWindowFromAnchorYmd(w);
    const clipped = clipLocalRange(
      weekStart,
      weekEndExclusive,
      localDayStart(identity.start),
      localDayStart(identity.endExclusive),
    );
    const offCount = clipped
      ? countTimeOffWeekdaysInRange(clipped.start, clipped.endExclusive, timeOffYmds)
      : 0;
    dayWeights.push(workingWeekdayWeight(overlap.days, offCount));
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

  const pace = paceHoursPerWeekWeighted(targetHours ?? 0, dayWeights, capacity);
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
    todayYmd,
    targetHours,
    actualHours,
    forecastHours,
    utilizationPct,
    weeks,
    insight: buildInsight({ targetHours, weeks, todayYmd, timeOffYmds }),
    timeOffDays,
    weeklyCapacityHours: capacity,
  };
}

/** Exported for tests / insight preview. */
export { blendedQuarterProjection, buildInsight, formatShortHours };
