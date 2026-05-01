"use server";

import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import {
  normalizeProjectColorKey,
  projectColorCssVar,
  type ProjectShade,
} from "@/lib/project-colors";
import { TASKS_PAGE_INTERNAL_PROJECT_ID } from "@/lib/tasks-page-shared";
import { createClient } from "@/lib/supabase/server";
import type { GridSessionInput } from "@/components/effort-calendar-grids";
import { revalidatePath } from "next/cache";

export type TasksCalendarSession = GridSessionInput & {
  project_id: string;
  project_track_id: string;
  project_integration_id: string | null;
  /** null for manual effort entries / meetings */
  task_priority: "low" | "medium" | "high" | null;
  integration_label: string;
  project_name: string;
  /** Links back to the integration Effort view so the user can open it from the detail popover. */
  integration_href: string;
  integration_href_label: "Open on integration" | "Open on project" | "Open internal";
};

export type LoadTasksCalendarResult = {
  sessions?: TasksCalendarSession[];
  error?: string;
};

const CALENDAR_SLOT_MS = 15 * 60_000;
const ENTRY_TYPES = ["task", "meeting"] as const;

type ManualEffortEntryType = (typeof ENTRY_TYPES)[number];

function isEntryType(v: string): v is ManualEffortEntryType {
  return (ENTRY_TYPES as readonly string[]).includes(v);
}

function isOnQuarterHour(d: Date): boolean {
  const ms = d.getTime();
  if (Number.isNaN(ms)) return false;
  return ms % CALENDAR_SLOT_MS === 0;
}

function normalizeQuarterDurationHours(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  const rawHours = durationMs / 3_600_000;
  const quarter = Math.round(rawHours * 4) / 4;
  if (Math.abs(rawHours - quarter) > 1e-6) return null;
  return quarter;
}

function isMissingProjectTrackColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const mentionsColumn = message.includes("project_track_id");
  const missingColumn =
    message.includes("does not exist") ||
    message.includes("could not find") ||
    error.code === "42703";
  return mentionsColumn && missingColumn;
}

async function loadOwnedProjectTrack(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectTrackId: string,
): Promise<{ id: string; project_id: string; project_integration_id: string | null } | null> {
  const { data: track } = await supabase
    .from("project_tracks")
    .select("id, project_id, project_integration_id")
    .eq("id", projectTrackId)
    .maybeSingle();

  if (!track) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", track.project_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!project) return null;
  return track;
}

async function loadOwnedInternalInitiative(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  initiativeId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function loadOwnedInternalTrack(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  trackId: string,
): Promise<{ id: string; kind: "admin" | "development" } | null> {
  const { data } = await supabase
    .from("internal_tracks")
    .select("id, kind")
    .eq("id", trackId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!data) return null;
  if (data.kind !== "admin" && data.kind !== "development") return null;
  return { id: data.id, kind: data.kind };
}

async function loadOwnedProjectIntegration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectIntegrationId: string,
): Promise<{ id: string; project_id: string } | null> {
  const { data: pi } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("id", projectIntegrationId)
    .maybeSingle();

  if (!pi) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", pi.project_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!project) return null;
  return pi;
}

function revalidateTasksCalendarPaths(projectId: string, projectIntegrationId: string | null) {
  revalidatePath("/work");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${projectId}`);
  if (projectIntegrationId) {
    revalidatePath(`/projects/${projectId}/integrations/${projectIntegrationId}`);
  }
}

function revalidateInternalCalendarPaths(initiativeId: string | null) {
  revalidatePath("/work");
  revalidatePath("/tasks");
  revalidatePath("/internal");
  if (initiativeId) revalidatePath(`/internal/initiatives/${initiativeId}`);
}

type InternalTaskJoin = {
  id: string;
  title: string | null;
  priority: string | null;
  internal_track_id: string | null;
  internal_initiative_id: string | null;
};

async function appendInternalTaskCalendarSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  startIso: string,
  endExclusiveIso: string,
  out: TasksCalendarSession[],
): Promise<{ error?: string }> {
  const { data: wsRows, error: wsErr } = await supabase
    .from("internal_task_work_sessions")
    .select(
      `id, internal_task_id, started_at, finished_at, duration_hours, work_accomplished,
       internal_tasks ( id, title, priority, internal_track_id, internal_initiative_id )`,
    )
    .not("finished_at", "is", null)
    .gte("finished_at", startIso)
    .lt("started_at", endExclusiveIso);
  if (wsErr) return { error: wsErr.message };

  const rows = wsRows ?? [];
  if (rows.length === 0) return {};

  const trackIds = new Set<string>();
  const iniIds = new Set<string>();
  for (const row of rows) {
    const task = (Array.isArray(row.internal_tasks) ? row.internal_tasks[0] : row.internal_tasks) as
      | InternalTaskJoin
      | null
      | undefined;
    if (!task) continue;
    if (task.internal_track_id) trackIds.add(task.internal_track_id);
    if (task.internal_initiative_id) iniIds.add(task.internal_initiative_id);
  }

  const kindByTrackId = new Map<string, "admin" | "development">();
  if (trackIds.size > 0) {
    const { data: trk, error: trkErr } = await supabase
      .from("internal_tracks")
      .select("id, kind")
      .eq("owner_id", userId)
      .in("id", [...trackIds]);
    if (trkErr) return { error: trkErr.message };
    for (const t of trk ?? []) {
      if (t.kind === "admin" || t.kind === "development") kindByTrackId.set(t.id, t.kind);
    }
  }

  const titleByIniId = new Map<string, string>();
  if (iniIds.size > 0) {
    const { data: inv, error: invErr } = await supabase
      .from("internal_initiatives")
      .select("id, title")
      .eq("owner_id", userId)
      .in("id", [...iniIds]);
    if (invErr) return { error: invErr.message };
    for (const i of inv ?? []) {
      titleByIniId.set(i.id, (i.title ?? "").trim() || "Initiative");
    }
  }

  for (const row of rows) {
    if (!row.finished_at) continue;
    const task = (Array.isArray(row.internal_tasks) ? row.internal_tasks[0] : row.internal_tasks) as
      | InternalTaskJoin
      | null
      | undefined;
    if (!task) continue;

    let destTrackId: string;
    let integrationLabel: string;
    let integrationHref: string;
    if (task.internal_track_id) {
      destTrackId = task.internal_track_id;
      const k = kindByTrackId.get(task.internal_track_id) ?? "admin";
      integrationLabel = k === "admin" ? "Admin" : "Development";
      integrationHref = "/internal";
    } else if (task.internal_initiative_id) {
      destTrackId = task.internal_initiative_id;
      integrationLabel = titleByIniId.get(task.internal_initiative_id) ?? "Initiative";
      integrationHref = `/internal/initiatives/${task.internal_initiative_id}`;
    } else {
      continue;
    }

    out.push({
      source: "task_work_session",
      source_id: row.id as string,
      started_at: row.started_at as string,
      finished_at: row.finished_at as string,
      duration_hours: Number(row.duration_hours),
      integration_task_id: task.id,
      title: (task.title ?? "").trim() || "Task",
      work_accomplished: (row.work_accomplished as string | null) ?? null,
      project_id: TASKS_PAGE_INTERNAL_PROJECT_ID,
      project_track_id: destTrackId,
      project_integration_id: null,
      task_priority: (task.priority as "low" | "medium" | "high" | null) ?? null,
      integration_label: integrationLabel,
      project_name: "Internal",
      integration_href: integrationHref,
      integration_href_label: "Open internal",
    });
  }

  return {};
}

async function appendInternalInitiativeManualCalendarSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  startIso: string,
  endExclusiveIso: string,
  out: TasksCalendarSession[],
): Promise<{ error?: string }> {
  const { data: ownedIni, error: iniErr } = await supabase
    .from("internal_initiatives")
    .select("id, title")
    .eq("owner_id", userId);
  if (iniErr) return { error: iniErr.message };
  const iniRows = ownedIni ?? [];
  if (iniRows.length === 0) return {};

  const iniIds = iniRows.map((r) => r.id);
  const titleByIniId = new Map(
    iniRows.map((i) => [i.id, ((i.title ?? "").trim() || "Initiative") as string]),
  );

  const { data: manualRows, error: manErr } = await supabase
    .from("internal_initiative_manual_effort_entries")
    .select(
      "id, internal_initiative_id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished",
    )
    .in("internal_initiative_id", iniIds)
    .gte("finished_at", startIso)
    .lt("started_at", endExclusiveIso);

  if (manErr) return { error: manErr.message };

  for (const row of manualRows ?? []) {
    const iniId = row.internal_initiative_id as string;
    out.push({
      source: "manual",
      source_id: row.id as string,
      started_at: row.started_at as string,
      finished_at: row.finished_at as string,
      duration_hours: Number(row.duration_hours),
      integration_task_id: null,
      entry_type: row.entry_type === "meeting" ? "meeting" : "task",
      title: String(row.title ?? "").trim() || (row.entry_type === "meeting" ? "Meeting" : "Task"),
      work_accomplished: (row.work_accomplished as string | null) ?? null,
      project_id: TASKS_PAGE_INTERNAL_PROJECT_ID,
      project_track_id: iniId,
      project_integration_id: null,
      task_priority: null,
      integration_label: titleByIniId.get(iniId) ?? "Initiative",
      project_name: "Internal",
      integration_href: `/internal/initiatives/${iniId}`,
      integration_href_label: "Open internal",
    });
  }
  return {};
}

async function appendInternalTrackManualCalendarSessions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  startIso: string,
  endExclusiveIso: string,
  out: TasksCalendarSession[],
): Promise<{ error?: string }> {
  const { data: ownedTracks, error: tracksErr } = await supabase
    .from("internal_tracks")
    .select("id, kind")
    .eq("owner_id", userId);
  if (tracksErr) return { error: tracksErr.message };
  const trackRows = (ownedTracks ?? []).filter(
    (row): row is { id: string; kind: "admin" | "development" } =>
      row.kind === "admin" || row.kind === "development",
  );
  if (trackRows.length === 0) return {};

  const trackIds = trackRows.map((row) => row.id);
  const kindByTrackId = new Map(trackRows.map((row) => [row.id, row.kind]));
  const { data: manualRows, error: manualErr } = await supabase
    .from("internal_track_manual_effort_entries")
    .select("id, internal_track_id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished")
    .in("internal_track_id", trackIds)
    .gte("finished_at", startIso)
    .lt("started_at", endExclusiveIso);
  if (manualErr) return { error: manualErr.message };

  for (const row of manualRows ?? []) {
    const trackId = row.internal_track_id as string;
    const kind = kindByTrackId.get(trackId) ?? "admin";
    out.push({
      source: "manual",
      source_id: row.id as string,
      started_at: row.started_at as string,
      finished_at: row.finished_at as string,
      duration_hours: Number(row.duration_hours),
      integration_task_id: null,
      entry_type: row.entry_type === "meeting" ? "meeting" : "task",
      title: String(row.title ?? "").trim() || (row.entry_type === "meeting" ? "Meeting" : "Task"),
      work_accomplished: (row.work_accomplished as string | null) ?? null,
      project_id: TASKS_PAGE_INTERNAL_PROJECT_ID,
      project_track_id: trackId,
      project_integration_id: null,
      task_priority: null,
      integration_label: kind === "admin" ? "Admin" : "Development",
      project_name: "Internal",
      integration_href: "/internal",
      integration_href_label: "Open internal",
    });
  }
  return {};
}

/**
 * Load all work sessions and manual effort entries across the user's active projects
 * for a given wall-clock window [startIso, endExclusiveIso).
 *
 * Includes project color metadata so the Tasks calendar can tint blocks by project.
 */
export async function loadTasksCalendarSessions(
  startIso: string,
  endExclusiveIso: string,
): Promise<LoadTasksCalendarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // 1. Active projects
  const { data: projectRows, error: projectErr } = await supabase
    .from("projects")
    .select("id, customer_name, project_color_key")
    .eq("owner_id", user.id)
    .is("completed_at", null);
  if (projectErr) return { error: projectErr.message };

  const sessions: TasksCalendarSession[] = [];

  if (projectRows && projectRows.length > 0) {
  const projectById = new Map(
    projectRows.map((p) => {
      const colorKey = normalizeProjectColorKey(p.project_color_key);
      const shade: ProjectShade | null = colorKey
        ? colorKey.endsWith("_dark")
          ? "dark"
          : colorKey.endsWith("_medium")
            ? "medium"
            : "light"
        : null;
      return [
        p.id,
        {
          name: (p.customer_name ?? "").trim() || "Untitled project",
          colorVar: colorKey ? projectColorCssVar(colorKey) : null,
          shade,
        },
      ] as const;
    }),
  );
  const projectIds = Array.from(projectById.keys());

  // 2. Project integrations
  const { data: piRows, error: piErr } = await supabase
    .from("project_integrations")
    .select("id, project_id, integration_id")
    .in("project_id", projectIds);
  if (piErr) return { error: piErr.message };

  // 3. Integration definition display names
  const integrationDefIds = Array.from(
    new Set((piRows ?? []).map((r) => r.integration_id).filter((v): v is string => Boolean(v))),
  );
  let integrationDefById: Record<
    string,
    {
      name: string | null;
      integration_code: string | null;
      integrating_with: string | null;
      direction: string | null;
    }
  > = {};
  if (integrationDefIds.length > 0) {
    const { data: integDefs, error: integErr } = await supabase
      .from("integrations")
      .select("id, name, integration_code, integrating_with, direction")
      .in("id", integrationDefIds);
    if (integErr) return { error: integErr.message };
    integrationDefById = Object.fromEntries(
      (integDefs ?? []).map((row) => [
        row.id,
        {
          name: row.name ?? null,
          integration_code: row.integration_code ?? null,
          integrating_with: row.integrating_with ?? null,
          direction: row.direction ?? null,
        },
      ]),
    );
  }

  type PiMeta = {
    projectId: string;
    label: string;
  };
  const piMetaById = new Map<string, PiMeta>(
    (piRows ?? []).map((row) => {
      const def = row.integration_id ? integrationDefById[row.integration_id] : undefined;
      const label = def
        ? formatIntegrationDefinitionDisplayName({
            integration_code: def.integration_code,
            integrating_with: def.integrating_with,
            name: def.name,
            direction: def.direction,
          }) || (def.name ?? "Integration")
        : "Integration";
      return [row.id, { projectId: row.project_id, label }] as const;
    }),
  );
  const projectIntegrationIds = (piRows ?? []).map((row) => row.id);

  const { data: trackRows, error: trackErr } = await supabase
    .from("project_tracks")
    .select("id, project_id, kind, name, project_integration_id")
    .in("project_id", projectIds);
  if (trackErr) return { error: trackErr.message };
  const trackMetaById = new Map<
    string,
    {
      projectId: string;
      projectIntegrationId: string | null;
      label: string;
      href: string;
      hrefLabel: "Open on integration" | "Open on project";
    }
  >();
  const projectTrackIdByProjectIntegrationId = new Map<string, string>();
  for (const row of trackRows ?? []) {
    if (row.kind === "integration" && row.project_integration_id) {
      const piMeta = piMetaById.get(row.project_integration_id);
      projectTrackIdByProjectIntegrationId.set(row.project_integration_id, row.id);
      trackMetaById.set(row.id, {
        projectId: row.project_id,
        projectIntegrationId: row.project_integration_id,
        label: piMeta?.label ?? ((row.name ?? "").trim() || "Integration"),
        href: `/projects/${row.project_id}/integrations/${row.project_integration_id}`,
        hrefLabel: "Open on integration",
      });
      continue;
    }
    trackMetaById.set(row.id, {
      projectId: row.project_id,
      projectIntegrationId: null,
      label: (row.name ?? "").trim() || "Project Management",
      href: `/projects/${row.project_id}`,
      hrefLabel: "Open on project",
    });
  }
  const projectTrackIds = Array.from(trackMetaById.keys());

  // 4. Fetch work sessions and manual entries in parallel
  const [workSessionsRes, manualEntriesRes] = await Promise.all([
    projectTrackIds.length === 0
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null })
      : supabase
          .from("integration_task_work_sessions")
          .select(
            "id, integration_task_id, started_at, finished_at, duration_hours, work_accomplished, integration_tasks(title, priority, project_track_id)",
          )
          .in("integration_tasks.project_track_id", projectTrackIds)
          .not("finished_at", "is", null)
          .gte("finished_at", startIso)
          .lt("started_at", endExclusiveIso),
    supabase
      .from("integration_manual_effort_entries")
      .select("id, project_track_id, project_integration_id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished")
      .in("project_track_id", projectTrackIds)
      .gte("finished_at", startIso)
      .lt("started_at", endExclusiveIso),
  ]);

  if (workSessionsRes.error) return { error: workSessionsRes.error.message };
  let manualEntriesLegacyMode = false;
  let manualRows:
    | Array<{
        id: string;
        project_track_id: string;
        project_integration_id: string | null;
        entry_type: string;
        title: string;
        started_at: string;
        finished_at: string;
        duration_hours: number;
        work_accomplished: string | null;
      }>
    | Array<{
        id: string;
        project_integration_id: string;
        entry_type: string;
        title: string;
        started_at: string;
        finished_at: string;
        duration_hours: number;
        work_accomplished: string | null;
      }> = manualEntriesRes.data ?? [];

  if (isMissingProjectTrackColumn(manualEntriesRes.error)) {
    manualEntriesLegacyMode = true;
    const legacyRes = await supabase
      .from("integration_manual_effort_entries")
      .select("id, project_integration_id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished")
      .in("project_integration_id", projectIntegrationIds)
      .gte("finished_at", startIso)
      .lt("started_at", endExclusiveIso);
    if (legacyRes.error) return { error: legacyRes.error.message };
    manualRows = legacyRes.data ?? [];
  } else if (manualEntriesRes.error) {
    return { error: manualEntriesRes.error.message };
  }

  // Work sessions
  for (const row of workSessionsRes.data ?? []) {
    if (!row.finished_at) continue;
    // The join may be null if the task was deleted or belongs to a different integration
    const taskRow = Array.isArray(row.integration_tasks)
      ? row.integration_tasks[0]
      : row.integration_tasks;
    if (!taskRow) continue;
    const trackMeta = trackMetaById.get(taskRow.project_track_id as string);
    if (!trackMeta) continue;
    const project = projectById.get(trackMeta.projectId);
    if (!project) continue;

    sessions.push({
      source: "task_work_session",
      source_id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: Number(row.duration_hours),
      integration_task_id: row.integration_task_id,
      title: (taskRow.title as string | null)?.trim() || "Task",
      work_accomplished: row.work_accomplished ?? null,
      project_id: trackMeta.projectId,
      project_track_id: taskRow.project_track_id as string,
      project_integration_id: trackMeta.projectIntegrationId,
      task_priority: (taskRow.priority as "low" | "medium" | "high" | null) ?? null,
      integration_label: trackMeta.label,
      project_name: project.name,
      integration_href: trackMeta.href,
      integration_href_label: trackMeta.hrefLabel,
      colorMeta:
        project.colorVar && project.shade
          ? { colorVar: project.colorVar, shade: project.shade }
          : undefined,
    });
  }

  // Manual effort entries
  for (const row of manualRows) {
    const projectTrackId = manualEntriesLegacyMode
      ? projectTrackIdByProjectIntegrationId.get((row as { project_integration_id: string }).project_integration_id) ?? null
      : (row as { project_track_id: string }).project_track_id;
    if (!projectTrackId) continue;
    const trackMeta = trackMetaById.get(projectTrackId);
    if (!trackMeta) continue;
    const project = projectById.get(trackMeta.projectId);
    if (!project) continue;

    sessions.push({
      source: "manual",
      source_id: row.id,
      entry_type: row.entry_type === "meeting" ? "meeting" : "task",
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: Number(row.duration_hours),
      integration_task_id: null,
      title:
        (row.title as string | null)?.trim() ||
        (row.entry_type === "meeting" ? "Meeting" : "Task"),
      work_accomplished: row.work_accomplished ?? null,
      project_id: trackMeta.projectId,
      project_track_id: projectTrackId,
      project_integration_id: trackMeta.projectIntegrationId,
      task_priority: null,
      integration_label: trackMeta.label,
      project_name: project.name,
      integration_href: trackMeta.href,
      integration_href_label: trackMeta.hrefLabel,
      colorMeta:
        project.colorVar && project.shade
          ? { colorVar: project.colorVar, shade: project.shade }
          : undefined,
    });
  }

  }

  const internalErr = await appendInternalTaskCalendarSessions(
    supabase,
    user.id,
    startIso,
    endExclusiveIso,
    sessions,
  );
  if (internalErr.error) return { error: internalErr.error };

  const internalManualErr = await appendInternalInitiativeManualCalendarSessions(
    supabase,
    user.id,
    startIso,
    endExclusiveIso,
    sessions,
  );
  if (internalManualErr.error) return { error: internalManualErr.error };

  const internalTrackManualErr = await appendInternalTrackManualCalendarSessions(
    supabase,
    user.id,
    startIso,
    endExclusiveIso,
    sessions,
  );
  if (internalTrackManualErr.error) return { error: internalTrackManualErr.error };

  return { sessions };
}

export async function createTasksCalendarManualEntry(payload: {
  project_track_id: string;
  entry_type: ManualEffortEntryType;
  title: string;
  started_at: string;
  finished_at: string;
  work_accomplished: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!isEntryType(String(payload.entry_type))) return { error: "Invalid entry type" };
  const title = String(payload.title ?? "").trim();
  if (!title) return { error: "Title is required" };

  const started = new Date(payload.started_at);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };
  const finished = new Date(payload.finished_at);
  if (Number.isNaN(finished.getTime())) return { error: "Invalid end time" };
  if (finished.getTime() <= started.getTime()) return { error: "End time must be after start time" };
  if (!isOnQuarterHour(started) || !isOnQuarterHour(finished)) {
    return { error: "Times must be in 15-minute increments" };
  }

  const durationHours = normalizeQuarterDurationHours(finished.getTime() - started.getTime());
  if (durationHours == null) return { error: "Duration must be in 15-minute increments" };

  const track = await loadOwnedProjectTrack(supabase, user.id, payload.project_track_id);
  const internalInitiative = track
    ? null
    : await loadOwnedInternalInitiative(supabase, user.id, payload.project_track_id);
  const internalTrack =
    track || internalInitiative
      ? null
      : await loadOwnedInternalTrack(supabase, user.id, payload.project_track_id);
  if (!track && !internalInitiative && !internalTrack) return { error: "Not found" };

  const workAccomplished = payload.work_accomplished?.trim() ? payload.work_accomplished.trim() : null;

  if (internalInitiative) {
    const { error: intErr } = await supabase.from("internal_initiative_manual_effort_entries").insert({
      internal_initiative_id: internalInitiative.id,
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: durationHours,
      work_accomplished: workAccomplished,
    });
    if (intErr) return { error: intErr.message };
    revalidateInternalCalendarPaths(internalInitiative.id);
    return {};
  }

  if (internalTrack) {
    const { error: intTrackErr } = await supabase.from("internal_track_manual_effort_entries").insert({
      internal_track_id: internalTrack.id,
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: durationHours,
      work_accomplished: workAccomplished,
    });
    if (intTrackErr) return { error: intTrackErr.message };
    revalidateInternalCalendarPaths(null);
    return {};
  }

  if (!track) return { error: "Not found" };

  const createRes = await supabase.from("integration_manual_effort_entries").insert({
    project_track_id: payload.project_track_id,
    project_integration_id: track.project_integration_id,
    entry_type: payload.entry_type,
    title,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_hours: durationHours,
    work_accomplished: workAccomplished,
  });
  if (isMissingProjectTrackColumn(createRes.error)) {
    if (!track.project_integration_id) {
      return {
        error:
          "Project Management calendar entries require a database migration. Please run the latest Supabase migrations.",
      };
    }
    const legacyRes = await supabase.from("integration_manual_effort_entries").insert({
      project_integration_id: track.project_integration_id,
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: durationHours,
      work_accomplished: workAccomplished,
    });
    if (legacyRes.error) return { error: legacyRes.error.message };
  } else if (createRes.error) {
    return { error: createRes.error.message };
  }

  revalidateTasksCalendarPaths(track.project_id, track.project_integration_id);
  return {};
}

export async function updateTasksCalendarManualEntry(payload: {
  project_track_id: string;
  manual_entry_id: string;
  entry_type: ManualEffortEntryType;
  title: string;
  started_at: string;
  finished_at: string;
  work_accomplished: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!payload.manual_entry_id || typeof payload.manual_entry_id !== "string") {
    return { error: "Not found" };
  }
  if (!isEntryType(String(payload.entry_type))) return { error: "Invalid entry type" };
  const title = String(payload.title ?? "").trim();
  if (!title) return { error: "Title is required" };

  const started = new Date(payload.started_at);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };
  const finished = new Date(payload.finished_at);
  if (Number.isNaN(finished.getTime())) return { error: "Invalid end time" };
  if (finished.getTime() <= started.getTime()) return { error: "End time must be after start time" };
  if (!isOnQuarterHour(started) || !isOnQuarterHour(finished)) {
    return { error: "Times must be in 15-minute increments" };
  }

  const durationHours = normalizeQuarterDurationHours(finished.getTime() - started.getTime());
  if (durationHours == null) return { error: "Duration must be in 15-minute increments" };

  const { data: internalExisting } = await supabase
    .from("internal_initiative_manual_effort_entries")
    .select("id, internal_initiative_id")
    .eq("id", payload.manual_entry_id)
    .maybeSingle();

  if (internalExisting?.id) {
    const nextInit = await loadOwnedInternalInitiative(supabase, user.id, payload.project_track_id);
    if (!nextInit) return { error: "Not found" };
    const workAccomplishedInternal = payload.work_accomplished?.trim()
      ? payload.work_accomplished.trim()
      : null;
    const { data: intUpd, error: intUpdErr } = await supabase
      .from("internal_initiative_manual_effort_entries")
      .update({
        internal_initiative_id: nextInit.id,
        entry_type: payload.entry_type,
        title,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        duration_hours: durationHours,
        work_accomplished: workAccomplishedInternal,
      })
      .eq("id", payload.manual_entry_id)
      .select("id")
      .maybeSingle();
    if (intUpdErr) return { error: intUpdErr.message };
    if (!intUpd) return { error: "Not found" };
    revalidateInternalCalendarPaths(internalExisting.internal_initiative_id);
    if (internalExisting.internal_initiative_id !== nextInit.id) {
      revalidateInternalCalendarPaths(nextInit.id);
    }
    return {};
  }

  const { data: internalTrackExisting } = await supabase
    .from("internal_track_manual_effort_entries")
    .select("id, internal_track_id")
    .eq("id", payload.manual_entry_id)
    .maybeSingle();

  if (internalTrackExisting?.id) {
    const nextInternalTrack = await loadOwnedInternalTrack(supabase, user.id, payload.project_track_id);
    if (!nextInternalTrack) return { error: "Not found" };
    const workAccomplishedInternal = payload.work_accomplished?.trim()
      ? payload.work_accomplished.trim()
      : null;
    const { data: intTrackUpd, error: intTrackUpdErr } = await supabase
      .from("internal_track_manual_effort_entries")
      .update({
        internal_track_id: nextInternalTrack.id,
        entry_type: payload.entry_type,
        title,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        duration_hours: durationHours,
        work_accomplished: workAccomplishedInternal,
      })
      .eq("id", payload.manual_entry_id)
      .select("id")
      .maybeSingle();
    if (intTrackUpdErr) return { error: intTrackUpdErr.message };
    if (!intTrackUpd) return { error: "Not found" };
    revalidateInternalCalendarPaths(null);
    return {};
  }

  const nextTrack = await loadOwnedProjectTrack(supabase, user.id, payload.project_track_id);
  if (!nextTrack) return { error: "Not found" };
  let previousTrack:
    | { id: string; project_id: string; project_integration_id: string | null }
    | null = null;
  let previousIntegrationId: string | null = null;
  const existingRes = await supabase
    .from("integration_manual_effort_entries")
    .select("id, project_track_id")
    .eq("id", payload.manual_entry_id)
    .maybeSingle();
  if (isMissingProjectTrackColumn(existingRes.error)) {
    const legacyExistingRes = await supabase
      .from("integration_manual_effort_entries")
      .select("id, project_integration_id")
      .eq("id", payload.manual_entry_id)
      .maybeSingle();
    if (legacyExistingRes.error) return { error: legacyExistingRes.error.message };
    const legacyPiId = legacyExistingRes.data?.project_integration_id;
    if (!legacyPiId) return { error: "Not found" };
    previousIntegrationId = legacyPiId;
    const previousPi = await loadOwnedProjectIntegration(supabase, user.id, legacyPiId);
    if (!previousPi) return { error: "Not found" };
    previousTrack = {
      id: "",
      project_id: previousPi.project_id,
      project_integration_id: previousPi.id,
    };
  } else {
    if (existingRes.error) return { error: existingRes.error.message };
    if (!existingRes.data) return { error: "Not found" };
    previousTrack = await loadOwnedProjectTrack(supabase, user.id, existingRes.data.project_track_id);
    if (!previousTrack) return { error: "Not found" };
  }

  const workAccomplished = payload.work_accomplished?.trim() ? payload.work_accomplished.trim() : null;
  const updateRes = await supabase
    .from("integration_manual_effort_entries")
    .update({
      project_track_id: payload.project_track_id,
      project_integration_id: nextTrack.project_integration_id,
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: durationHours,
      work_accomplished: workAccomplished,
    })
    .eq("id", payload.manual_entry_id)
    .select("id")
    .maybeSingle();

  if (isMissingProjectTrackColumn(updateRes.error)) {
    if (!nextTrack.project_integration_id) {
      return {
        error:
          "Project Management calendar entries require a database migration. Please run the latest Supabase migrations.",
      };
    }
    const legacyUpdate = await supabase
      .from("integration_manual_effort_entries")
      .update({
        project_integration_id: nextTrack.project_integration_id,
        entry_type: payload.entry_type,
        title,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        duration_hours: durationHours,
        work_accomplished: workAccomplished,
      })
      .eq("id", payload.manual_entry_id)
      .eq("project_integration_id", previousIntegrationId ?? nextTrack.project_integration_id)
      .select("id")
      .maybeSingle();
    if (legacyUpdate.error) return { error: legacyUpdate.error.message };
    if (!legacyUpdate.data) return { error: "Not found" };
  } else {
    if (updateRes.error) return { error: updateRes.error.message };
    if (!updateRes.data) return { error: "Not found" };
  }

  if (!previousTrack) return { error: "Not found" };
  revalidateTasksCalendarPaths(previousTrack.project_id, previousTrack.project_integration_id);
  if (previousTrack.id !== nextTrack.id) {
    revalidateTasksCalendarPaths(nextTrack.project_id, nextTrack.project_integration_id);
  }
  return {};
}

export async function rescheduleTasksCalendarSession(payload: {
  source: "task_work_session" | "manual";
  source_id: string;
  started_at: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!payload.source_id || typeof payload.source_id !== "string") {
    return { error: "Not found" };
  }
  const nextStart = new Date(payload.started_at);
  if (Number.isNaN(nextStart.getTime())) return { error: "Invalid start time" };
  if (!isOnQuarterHour(nextStart)) return { error: "Times must be in 15-minute increments" };

  if (payload.source === "manual") {
    const intManualRes = await supabase
      .from("internal_initiative_manual_effort_entries")
      .select("id, internal_initiative_id, started_at, finished_at, duration_hours")
      .eq("id", payload.source_id)
      .maybeSingle();
    if (intManualRes.error) return { error: intManualRes.error.message };
    if (intManualRes.data) {
      const { data: inv } = await supabase
        .from("internal_initiatives")
        .select("id")
        .eq("id", intManualRes.data.internal_initiative_id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!inv) return { error: "Not found" };

      const intDurationHours = normalizeQuarterDurationHours(
        Number(intManualRes.data.duration_hours) * 3_600_000,
      );
      if (intDurationHours == null) return { error: "Invalid existing duration" };
      const intDurationMs = Math.round(intDurationHours * 3_600_000);
      const intNextFinish = new Date(nextStart.getTime() + intDurationMs);
      if (!isOnQuarterHour(intNextFinish)) return { error: "Times must be in 15-minute increments" };

      const { error: intManErr } = await supabase
        .from("internal_initiative_manual_effort_entries")
        .update({
          started_at: nextStart.toISOString(),
          finished_at: intNextFinish.toISOString(),
          duration_hours: intDurationHours,
        })
        .eq("id", payload.source_id);
      if (intManErr) return { error: intManErr.message };

      revalidateInternalCalendarPaths(inv.id);
      return {};
    }

    const intTrackManualRes = await supabase
      .from("internal_track_manual_effort_entries")
      .select("id, internal_track_id, started_at, finished_at, duration_hours")
      .eq("id", payload.source_id)
      .maybeSingle();
    if (intTrackManualRes.error) return { error: intTrackManualRes.error.message };
    if (intTrackManualRes.data) {
      const track = await loadOwnedInternalTrack(supabase, user.id, intTrackManualRes.data.internal_track_id);
      if (!track) return { error: "Not found" };

      const intTrackDurationHours = normalizeQuarterDurationHours(
        Number(intTrackManualRes.data.duration_hours) * 3_600_000,
      );
      if (intTrackDurationHours == null) return { error: "Invalid existing duration" };
      const intTrackDurationMs = Math.round(intTrackDurationHours * 3_600_000);
      const intTrackNextFinish = new Date(nextStart.getTime() + intTrackDurationMs);
      if (!isOnQuarterHour(intTrackNextFinish)) return { error: "Times must be in 15-minute increments" };

      const { error: intTrackManErr } = await supabase
        .from("internal_track_manual_effort_entries")
        .update({
          started_at: nextStart.toISOString(),
          finished_at: intTrackNextFinish.toISOString(),
          duration_hours: intTrackDurationHours,
        })
        .eq("id", payload.source_id);
      if (intTrackManErr) return { error: intTrackManErr.message };

      revalidateInternalCalendarPaths(null);
      return {};
    }

    const rowRes = await supabase
      .from("integration_manual_effort_entries")
      .select("id, project_track_id, started_at, finished_at, duration_hours")
      .eq("id", payload.source_id)
      .maybeSingle();
    let row:
      | {
          id: string;
          started_at: string;
          finished_at: string;
          duration_hours: number;
          project_track_id: string;
        }
      | null = null;
    let track:
      | { id: string; project_id: string; project_integration_id: string | null }
      | null = null;
    if (isMissingProjectTrackColumn(rowRes.error)) {
      const legacyRowRes = await supabase
        .from("integration_manual_effort_entries")
        .select("id, project_integration_id, started_at, finished_at, duration_hours")
        .eq("id", payload.source_id)
        .maybeSingle();
      if (legacyRowRes.error) return { error: legacyRowRes.error.message };
      if (!legacyRowRes.data?.project_integration_id) return { error: "Not found" };
      const pi = await loadOwnedProjectIntegration(supabase, user.id, legacyRowRes.data.project_integration_id);
      if (!pi) return { error: "Not found" };
      row = {
        id: legacyRowRes.data.id,
        started_at: legacyRowRes.data.started_at,
        finished_at: legacyRowRes.data.finished_at,
        duration_hours: Number(legacyRowRes.data.duration_hours),
        project_track_id: "",
      };
      track = {
        id: "",
        project_id: pi.project_id,
        project_integration_id: pi.id,
      };
    } else {
      if (rowRes.error) return { error: rowRes.error.message };
      if (!rowRes.data) return { error: "Not found" };
      row = {
        id: rowRes.data.id,
        started_at: rowRes.data.started_at,
        finished_at: rowRes.data.finished_at,
        duration_hours: Number(rowRes.data.duration_hours),
        project_track_id: rowRes.data.project_track_id,
      };
      track = await loadOwnedProjectTrack(supabase, user.id, row.project_track_id);
      if (!track) return { error: "Not found" };
    }

    const durationHours = normalizeQuarterDurationHours(Number(row.duration_hours) * 3_600_000);
    if (durationHours == null) return { error: "Invalid existing duration" };
    const durationMs = Math.round(durationHours * 3_600_000);
    const nextFinish = new Date(nextStart.getTime() + durationMs);
    if (!isOnQuarterHour(nextFinish)) return { error: "Times must be in 15-minute increments" };

    const { error } = await supabase
      .from("integration_manual_effort_entries")
      .update({
        started_at: nextStart.toISOString(),
        finished_at: nextFinish.toISOString(),
        duration_hours: durationHours,
      })
      .eq("id", payload.source_id);
    if (error) return { error: error.message };

    if (!track) return { error: "Not found" };
    revalidateTasksCalendarPaths(track.project_id, track.project_integration_id);
    return {};
  }

  const { data: workSession, error: workSessionErr } = await supabase
    .from("integration_task_work_sessions")
    .select("id, integration_task_id, started_at, finished_at, duration_hours")
    .eq("id", payload.source_id)
    .maybeSingle();
  if (workSessionErr) return { error: workSessionErr.message };

  if (workSession) {
    if (!workSession.finished_at) return { error: "Cannot reschedule an active session" };

    const { data: task } = await supabase
      .from("integration_tasks")
      .select("id, project_track_id")
      .eq("id", workSession.integration_task_id)
      .maybeSingle();
    if (!task) return { error: "Not found" };

    const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
    if (!track) return { error: "Not found" };

    const durationHours = normalizeQuarterDurationHours(Number(workSession.duration_hours) * 3_600_000);
    if (durationHours == null) return { error: "Invalid existing duration" };
    const durationMs = Math.round(durationHours * 3_600_000);
    const nextFinish = new Date(nextStart.getTime() + durationMs);
    if (!isOnQuarterHour(nextFinish)) return { error: "Times must be in 15-minute increments" };

    const { error } = await supabase
      .from("integration_task_work_sessions")
      .update({
        started_at: nextStart.toISOString(),
        finished_at: nextFinish.toISOString(),
        duration_hours: durationHours,
      })
      .eq("id", payload.source_id);
    if (error) return { error: error.message };

    revalidateTasksCalendarPaths(track.project_id, track.project_integration_id);
    return {};
  }

  const { data: internalWs, error: internalWsErr } = await supabase
    .from("internal_task_work_sessions")
    .select("id, internal_task_id, started_at, finished_at, duration_hours")
    .eq("id", payload.source_id)
    .maybeSingle();
  if (internalWsErr) return { error: internalWsErr.message };
  if (!internalWs) return { error: "Not found" };
  if (!internalWs.finished_at) return { error: "Cannot reschedule an active session" };

  const { data: internalTask } = await supabase
    .from("internal_tasks")
    .select("id, internal_track_id, internal_initiative_id")
    .eq("id", internalWs.internal_task_id)
    .maybeSingle();
  if (!internalTask) return { error: "Not found" };

  if (internalTask.internal_initiative_id) {
    const { data: inv } = await supabase
      .from("internal_initiatives")
      .select("id")
      .eq("id", internalTask.internal_initiative_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!inv) return { error: "Not found" };
  } else if (internalTask.internal_track_id) {
    const { data: tr } = await supabase
      .from("internal_tracks")
      .select("id")
      .eq("id", internalTask.internal_track_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!tr) return { error: "Not found" };
  } else {
    return { error: "Not found" };
  }

  const intDurationHours = normalizeQuarterDurationHours(Number(internalWs.duration_hours) * 3_600_000);
  if (intDurationHours == null) return { error: "Invalid existing duration" };
  const intDurationMs = Math.round(intDurationHours * 3_600_000);
  const intNextFinish = new Date(nextStart.getTime() + intDurationMs);
  if (!isOnQuarterHour(intNextFinish)) return { error: "Times must be in 15-minute increments" };

  const { error: intUpdErr } = await supabase
    .from("internal_task_work_sessions")
    .update({
      started_at: nextStart.toISOString(),
      finished_at: intNextFinish.toISOString(),
      duration_hours: intDurationHours,
    })
    .eq("id", payload.source_id);
  if (intUpdErr) return { error: intUpdErr.message };

  revalidateInternalCalendarPaths(internalTask.internal_initiative_id);
  return {};
}
