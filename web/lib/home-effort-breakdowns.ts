/**
 * Home Insights: Tasks vs Meetings and Billable vs Non-billable hour breakdowns
 * for Day / Week / Month / Quarter (current periods only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveFiscalQuarter } from "@/lib/fiscal-quarter";
import {
  type EffortPeriodBounds,
  type EffortSessionInput,
  effortPeriodTotalHours,
  formatLocalYmd,
  localDayStart,
  parseLocalYmd,
  startOfLocalMonth,
  startOfLocalWeekSunday,
  startOfNextLocalMonth,
} from "@/lib/integration-effort-buckets";
import type { EffortQuarterConfig } from "@/lib/project-weekly-effort";
import { DEFAULT_EFFORT_QUARTER_CONFIG } from "@/lib/project-weekly-effort";

export type BreakdownPeriod = "day" | "week" | "month" | "quarter";

export const BREAKDOWN_PERIODS: BreakdownPeriod[] = ["day", "week", "month", "quarter"];

/** Pair of category hours; `a` is left segment, `b` is right. */
export type PairHours = {
  a: number;
  b: number;
  total: number;
};

/** One project / initiative / Admin|Development row in the billable hover summary. */
export type BillableBreakdownItem = {
  id: string;
  label: string;
  hours: number;
  billable: boolean;
  isIcp: boolean;
};

export type HomeEffortBreakdownsDTO = {
  /** a = task hours, b = meeting hours */
  taskVsMeeting: Record<BreakdownPeriod, PairHours>;
  /** a = billable (projects + ICP initiatives), b = non-billable internal */
  billableVsInternal: Record<BreakdownPeriod, PairHours>;
  /** Destination rows for billable hover summary, hours desc. */
  billableItems: Record<BreakdownPeriod, BillableBreakdownItem[]>;
};

/** Classified session used for pure aggregation (exported for tests). */
export type BreakdownSession = EffortSessionInput & {
  /** True for project work and ICP initiative work. */
  billable: boolean;
  /** Stable destination key (project / initiative / track id). */
  destId: string;
  /** Display label for hover summary. */
  destLabel: string;
  isIcp: boolean;
};

export function emptyPairHours(): PairHours {
  return { a: 0, b: 0, total: 0 };
}

export function emptyBreakdowns(): HomeEffortBreakdownsDTO {
  const emptyPairs = Object.fromEntries(BREAKDOWN_PERIODS.map((p) => [p, emptyPairHours()])) as Record<
    BreakdownPeriod,
    PairHours
  >;
  const emptyItems = Object.fromEntries(
    BREAKDOWN_PERIODS.map((p) => [p, [] as BillableBreakdownItem[]]),
  ) as Record<BreakdownPeriod, BillableBreakdownItem[]>;
  return {
    taskVsMeeting: { ...emptyPairs },
    billableVsInternal: { ...emptyPairs },
    billableItems: emptyItems,
  };
}

export function makePairHours(a: number, b: number): PairHours {
  const left = Number.isFinite(a) && a > 0 ? a : 0;
  const right = Number.isFinite(b) && b > 0 ? b : 0;
  return { a: left, b: right, total: left + right };
}

/** Meeting = manual entry with entry_type meeting; everything else is task. */
export function isMeetingSession(s: Pick<BreakdownSession, "source" | "entry_type">): boolean {
  return s.source === "manual" && s.entry_type === "meeting";
}

/**
 * Period windows for the current Day / Week (Sunday) / Month / fiscal Quarter
 * relative to `todayYmd` in local calendar.
 */
export function breakdownPeriodBounds(
  todayYmd: string,
  quarterConfig: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): Record<BreakdownPeriod, EffortPeriodBounds> {
  const today = parseLocalYmd(todayYmd);
  const dayStart = localDayStart(today);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const weekStart = startOfLocalWeekSunday(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const monthStart = startOfLocalMonth(today);
  const monthEnd = startOfNextLocalMonth(today);

  const quarter = resolveFiscalQuarter(today, quarterConfig);

  return {
    day: { start: dayStart, endExclusive: dayEnd },
    week: { start: weekStart, endExclusive: weekEnd },
    month: { start: monthStart, endExclusive: monthEnd },
    quarter: { start: quarter.start, endExclusive: quarter.endExclusive },
  };
}

/** Inclusive load window covering all current periods. */
export function breakdownLoadWindow(
  bounds: Record<BreakdownPeriod, EffortPeriodBounds>,
): EffortPeriodBounds {
  let start = bounds.day.start;
  let endExclusive = bounds.day.endExclusive;
  for (const p of BREAKDOWN_PERIODS) {
    const b = bounds[p];
    if (b.start.getTime() < start.getTime()) start = b.start;
    if (b.endExclusive.getTime() > endExclusive.getTime()) endExclusive = b.endExclusive;
  }
  return { start, endExclusive };
}

/**
 * Aggregate classified sessions into task/meeting and billable/internal pairs
 * for each period, plus per-destination billable summary rows.
 */
export function aggregateBreakdowns(
  sessions: BreakdownSession[],
  bounds: Record<BreakdownPeriod, EffortPeriodBounds>,
): HomeEffortBreakdownsDTO {
  const out = emptyBreakdowns();
  for (const period of BREAKDOWN_PERIODS) {
    const { start, endExclusive } = bounds[period];
    let task = 0;
    let meeting = 0;
    let billable = 0;
    let nonBillable = 0;
    const byDest = new Map<
      string,
      { label: string; hours: number; billable: boolean; isIcp: boolean }
    >();

    for (const s of sessions) {
      const hours = effortPeriodTotalHours([s], start, endExclusive);
      if (!(hours > 0)) continue;
      if (isMeetingSession(s)) meeting += hours;
      else task += hours;
      if (s.billable) billable += hours;
      else nonBillable += hours;

      const existing = byDest.get(s.destId);
      if (existing) {
        existing.hours += hours;
        existing.isIcp = existing.isIcp || s.isIcp;
      } else {
        byDest.set(s.destId, {
          label: s.destLabel,
          hours,
          billable: s.billable,
          isIcp: s.isIcp,
        });
      }
    }

    out.taskVsMeeting[period] = makePairHours(task, meeting);
    out.billableVsInternal[period] = makePairHours(billable, nonBillable);
    out.billableItems[period] = [...byDest.entries()]
      .map(([id, row]) => ({
        id,
        label: row.label,
        hours: row.hours,
        billable: row.billable,
        isIcp: row.isIcp,
      }))
      .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
  }
  return out;
}

function pushBreakdownSession(
  out: BreakdownSession[],
  row: {
    id: string;
    started_at: string;
    finished_at: string | null;
    duration_hours: number | string;
  },
  opts: {
    source: "task_work_session" | "manual";
    billable: boolean;
    destId: string;
    destLabel: string;
    isIcp?: boolean;
    entry_type?: "task" | "meeting";
  },
) {
  if (!row.finished_at) return;
  const duration = Number(row.duration_hours);
  if (!Number.isFinite(duration) || duration <= 0) return;
  out.push({
    source: opts.source,
    source_id: row.id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    duration_hours: duration,
    integration_task_id: null,
    entry_type: opts.entry_type,
    title: "",
    work_accomplished: null,
    billable: opts.billable,
    destId: opts.destId,
    destLabel: opts.destLabel,
    isIcp: opts.isIcp === true,
  });
}

async function loadProjectBreakdownSessions(
  supabase: SupabaseClient,
  ownerId: string,
  windowStartIso: string,
  windowEndExclusiveIso: string,
  out: BreakdownSession[],
): Promise<void> {
  const { data: projectRows, error: projErr } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("owner_id", ownerId);

  if (projErr) {
    console.error("[home-effort-breakdowns] projects load failed", projErr);
    return;
  }

  const projects = (projectRows ?? []).map((p) => ({
    id: p.id as string,
    name: String(p.customer_name ?? "").trim() || "Untitled project",
  }));
  if (projects.length === 0) return;

  const projectIds = projects.map((p) => p.id);
  const nameByProjectId = new Map(projects.map((p) => [p.id, p.name]));

  const { data: trackRows } = await supabase
    .from("project_tracks")
    .select("id, project_id")
    .in("project_id", projectIds);

  const trackIds = (trackRows ?? []).map((t) => t.id as string);
  const projectIdByTrackId = new Map<string, string>();
  for (const t of trackRows ?? []) {
    projectIdByTrackId.set(t.id as string, t.project_id as string);
  }
  if (trackIds.length === 0) return;

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
      .select("id, started_at, finished_at, duration_hours, entry_type, project_track_id")
      .in("project_track_id", trackIds)
      .not("finished_at", "is", null)
      .lt("started_at", windowEndExclusiveIso)
      .gt("finished_at", windowStartIso),
  ]);

  if (wsRes.error) {
    console.error("[home-effort-breakdowns] project work sessions failed", wsRes.error);
  }
  if (meRes.error) {
    console.error("[home-effort-breakdowns] project manual entries failed", meRes.error);
  }

  for (const row of (wsRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
    integration_tasks:
      | { project_track_id: string }
      | { project_track_id: string }[]
      | null;
  }>) {
    const taskJoin = row.integration_tasks;
    const trackId = Array.isArray(taskJoin)
      ? taskJoin[0]?.project_track_id
      : taskJoin?.project_track_id;
    const projectId = trackId ? projectIdByTrackId.get(trackId) : undefined;
    if (!projectId) continue;
    pushBreakdownSession(out, row, {
      source: "task_work_session",
      billable: true,
      destId: projectId,
      destLabel: nameByProjectId.get(projectId) ?? "Project",
    });
  }

  for (const row of (meRes.data ?? []) as Array<{
    id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
    entry_type: string;
    project_track_id: string;
  }>) {
    const projectId = projectIdByTrackId.get(row.project_track_id);
    if (!projectId) continue;
    pushBreakdownSession(out, row, {
      source: "manual",
      billable: true,
      destId: projectId,
      destLabel: nameByProjectId.get(projectId) ?? "Project",
      entry_type: row.entry_type === "meeting" ? "meeting" : "task",
    });
  }
}

async function loadInitiativeBreakdownSessions(
  supabase: SupabaseClient,
  ownerId: string,
  windowStartIso: string,
  windowEndExclusiveIso: string,
  out: BreakdownSession[],
): Promise<void> {
  const { data: initiatives, error } = await supabase
    .from("internal_initiatives")
    .select("id, title, icp")
    .eq("owner_id", ownerId);

  if (error) {
    console.error("[home-effort-breakdowns] initiatives load failed", error);
    return;
  }

  const iniRows = initiatives ?? [];
  if (iniRows.length === 0) return;

  const initiativeIds = iniRows.map((r) => r.id as string);
  const icpById = new Map(iniRows.map((r) => [r.id as string, Boolean(r.icp)]));
  const titleById = new Map(
    iniRows.map((r) => [r.id as string, String(r.title ?? "").trim() || "Initiative"]),
  );

  const { data: tasks } = await supabase
    .from("internal_tasks")
    .select("id, internal_initiative_id")
    .in("internal_initiative_id", initiativeIds);

  const taskIds = (tasks ?? []).map((t) => t.id as string);
  const initiativeIdByTaskId = new Map(
    (tasks ?? []).map((t) => [t.id as string, t.internal_initiative_id as string]),
  );

  const [workRes, manualRes] = await Promise.all([
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
      .select(
        "id, internal_initiative_id, entry_type, started_at, finished_at, duration_hours",
      )
      .in("internal_initiative_id", initiativeIds)
      .not("finished_at", "is", null)
      .lt("started_at", windowEndExclusiveIso)
      .gt("finished_at", windowStartIso),
  ]);

  if (workRes.error) {
    console.error("[home-effort-breakdowns] initiative work sessions failed", workRes.error);
  }
  if (manualRes.error) {
    console.error("[home-effort-breakdowns] initiative manual entries failed", manualRes.error);
  }

  for (const row of (workRes.data ?? []) as Array<{
    id: string;
    internal_task_id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
  }>) {
    const iniId = initiativeIdByTaskId.get(row.internal_task_id);
    if (!iniId) continue;
    const isIcp = icpById.get(iniId) === true;
    pushBreakdownSession(out, row, {
      source: "task_work_session",
      billable: isIcp,
      destId: iniId,
      destLabel: titleById.get(iniId) ?? "Initiative",
      isIcp,
    });
  }

  for (const row of (manualRes.data ?? []) as Array<{
    id: string;
    internal_initiative_id: string;
    entry_type: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
  }>) {
    const iniId = row.internal_initiative_id;
    const isIcp = icpById.get(iniId) === true;
    pushBreakdownSession(out, row, {
      source: "manual",
      billable: isIcp,
      destId: iniId,
      destLabel: titleById.get(iniId) ?? "Initiative",
      isIcp,
      entry_type: row.entry_type === "meeting" ? "meeting" : "task",
    });
  }
}

async function loadTrackBreakdownSessions(
  supabase: SupabaseClient,
  ownerId: string,
  windowStartIso: string,
  windowEndExclusiveIso: string,
  out: BreakdownSession[],
): Promise<void> {
  const { data: tracks, error } = await supabase
    .from("internal_tracks")
    .select("id, kind")
    .eq("owner_id", ownerId);

  if (error) {
    console.error("[home-effort-breakdowns] tracks load failed", error);
    return;
  }

  const trackRows = (tracks ?? []).filter(
    (row): row is { id: string; kind: "admin" | "development" } =>
      row.kind === "admin" || row.kind === "development",
  );
  if (trackRows.length === 0) return;

  const trackIds = trackRows.map((t) => t.id);
  const labelByTrackId = new Map(
    trackRows.map((t) => [t.id, t.kind === "admin" ? "Admin" : "Development"] as const),
  );

  const { data: tasks } = await supabase
    .from("internal_tasks")
    .select("id, internal_track_id")
    .in("internal_track_id", trackIds);

  const taskIds = (tasks ?? []).map((t) => t.id as string);
  const trackIdByTaskId = new Map(
    (tasks ?? []).map((t) => [t.id as string, t.internal_track_id as string]),
  );

  const [workRes, manualRes] = await Promise.all([
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
      .from("internal_track_manual_effort_entries")
      .select("id, internal_track_id, entry_type, started_at, finished_at, duration_hours")
      .in("internal_track_id", trackIds)
      .not("finished_at", "is", null)
      .lt("started_at", windowEndExclusiveIso)
      .gt("finished_at", windowStartIso),
  ]);

  if (workRes.error) {
    console.error("[home-effort-breakdowns] track work sessions failed", workRes.error);
  }
  if (manualRes.error) {
    console.error("[home-effort-breakdowns] track manual entries failed", manualRes.error);
  }

  for (const row of (workRes.data ?? []) as Array<{
    id: string;
    internal_task_id: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
  }>) {
    const trackId = trackIdByTaskId.get(row.internal_task_id);
    if (!trackId) continue;
    pushBreakdownSession(out, row, {
      source: "task_work_session",
      billable: false,
      destId: trackId,
      destLabel: labelByTrackId.get(trackId) ?? "Internal",
    });
  }

  for (const row of (manualRes.data ?? []) as Array<{
    id: string;
    internal_track_id: string;
    entry_type: string;
    started_at: string;
    finished_at: string;
    duration_hours: number | string;
  }>) {
    const trackId = row.internal_track_id;
    pushBreakdownSession(out, row, {
      source: "manual",
      billable: false,
      destId: trackId,
      destLabel: labelByTrackId.get(trackId) ?? "Internal",
      entry_type: row.entry_type === "meeting" ? "meeting" : "task",
    });
  }
}

export async function loadHomeEffortBreakdowns(
  supabase: SupabaseClient,
  ownerId: string,
  todayYmd: string,
  quarterConfig: EffortQuarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
): Promise<HomeEffortBreakdownsDTO> {
  const bounds = breakdownPeriodBounds(todayYmd, quarterConfig);
  const window = breakdownLoadWindow(bounds);
  const windowStartYmd = formatLocalYmd(window.start);
  const windowEndExclusiveYmd = formatLocalYmd(window.endExclusive);
  const windowStartIso = `${windowStartYmd}T00:00:00.000Z`;
  const windowEndExclusiveIso = `${windowEndExclusiveYmd}T00:00:00.000Z`;

  const sessions: BreakdownSession[] = [];
  await Promise.all([
    loadProjectBreakdownSessions(supabase, ownerId, windowStartIso, windowEndExclusiveIso, sessions),
    loadInitiativeBreakdownSessions(
      supabase,
      ownerId,
      windowStartIso,
      windowEndExclusiveIso,
      sessions,
    ),
    loadTrackBreakdownSessions(supabase, ownerId, windowStartIso, windowEndExclusiveIso, sessions),
  ]);

  return aggregateBreakdowns(sessions, bounds);
}
