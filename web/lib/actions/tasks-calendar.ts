"use server";

import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import {
  normalizeProjectColorKey,
  projectColorCssVar,
  type ProjectShade,
} from "@/lib/project-colors";
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
  integration_href_label: "Open on integration" | "Open on project";
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
  if (!projectRows || projectRows.length === 0) return { sessions: [] };

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

  const sessions: TasksCalendarSession[] = [];

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
  if (!track) return { error: "Not found" };

  const workAccomplished = payload.work_accomplished?.trim() ? payload.work_accomplished.trim() : null;
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
  if (!workSession) return { error: "Not found" };
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
