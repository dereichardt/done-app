"use server";

import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const TASK_STATUSES = ["open", "done", "cancelled"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}

const TASK_PRIORITIES = ["low", "medium", "high"] as const;
type TaskPriority = (typeof TASK_PRIORITIES)[number];

function isTaskPriority(v: string): v is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(v);
}

type OwnedProjectTrack = {
  id: string;
  project_id: string;
  project_integration_id: string | null;
};

async function loadOwnedProjectTrack(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectTrackId: string,
): Promise<OwnedProjectTrack | null> {
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
  return {
    id: track.id,
    project_id: track.project_id,
    project_integration_id: track.project_integration_id ?? null,
  };
}

async function loadOwnedIntegrationTrackByProjectIntegration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectIntegrationId: string,
): Promise<OwnedProjectTrack | null> {
  const { data: track } = await supabase
    .from("project_tracks")
    .select("id, project_id, project_integration_id")
    .eq("project_integration_id", projectIntegrationId)
    .eq("kind", "integration")
    .maybeSingle();
  if (!track) return null;
  return loadOwnedProjectTrack(supabase, userId, track.id);
}

async function revalidateTrackPaths(track: OwnedProjectTrack) {
  revalidatePath("/work");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${track.project_id}`);
  if (track.project_integration_id) {
    revalidatePath(`/projects/${track.project_id}/integrations/${track.project_integration_id}`);
  }
}

export type ActiveWorkSessionDTO = {
  integration_task_id: string;
  started_at: string;
  paused_ms_accumulated: number;
  pause_started_at: string | null;
};

function rowToActiveDto(row: {
  integration_task_id: string;
  started_at: string;
  paused_ms_accumulated: number | string | null;
  pause_started_at: string | null;
}): ActiveWorkSessionDTO {
  return {
    integration_task_id: row.integration_task_id,
    started_at: row.started_at,
    paused_ms_accumulated: Number(row.paused_ms_accumulated ?? 0),
    pause_started_at: row.pause_started_at,
  };
}

async function loadIntegrationTaskFinishContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  integrationTaskId: string,
): Promise<{ title: string; integrationLabel: string; projectName: string } | null> {
  const { data: task, error: taskErr } = await supabase
    .from("integration_tasks")
    .select("title, project_track_id")
    .eq("id", integrationTaskId)
    .maybeSingle();
  if (taskErr || !task) return null;

  const { data: track, error: trackErr } = await supabase
    .from("project_tracks")
    .select("project_id, project_integration_id")
    .eq("id", task.project_track_id)
    .maybeSingle();
  if (trackErr || !track) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("customer_name")
    .eq("id", track.project_id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!project) return null;

  let integ:
    | { name: string | null; integration_code: string | null; integrating_with: string | null; direction: string | null }
    | null = null;
  if (track.project_integration_id) {
    const { data: pi } = await supabase
      .from("project_integrations")
      .select("integration_id")
      .eq("id", track.project_integration_id)
      .maybeSingle();
    if (pi?.integration_id) {
      const { data } = await supabase
        .from("integrations")
        .select("name, integration_code, integrating_with, direction")
        .eq("id", pi.integration_id)
        .eq("owner_id", userId)
        .maybeSingle();
      integ = data ?? null;
    }
  }

  const integrationLabel =
    integ != null
      ? formatIntegrationDefinitionDisplayName({
          integration_code: integ.integration_code,
          integrating_with: integ.integrating_with,
          name: integ.name,
          direction: integ.direction,
        }) || integ.name || "Integration"
      : "Project Management";

  return {
    title: task.title ?? "",
    integrationLabel,
    projectName: project.customer_name ?? "",
  };
}

/** Title, integration display line, and project customer name for finish-session UI (e.g. global active task). */
export async function loadGlobalActiveIntegrationTaskFinishContext(
  integrationTaskId: string,
): Promise<{ title: string; integrationLabel: string; projectName: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return loadIntegrationTaskFinishContext(supabase, user.id, integrationTaskId);
}

/** For a future inbox / activity screen: one row per user when a timer is running. */
export type MyActiveWorkSessionListItem = {
  integration_task_id: string;
  task_title: string;
  project_track_id: string;
  project_integration_id: string | null;
  project_id: string;
  customer_name: string | null;
  started_at: string;
  paused_ms_accumulated: number;
  pause_started_at: string | null;
};

export async function listMyActiveWorkSessions(): Promise<{
  sessions?: MyActiveWorkSessionListItem[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: activeRow, error: activeErr } = await supabase
    .from("integration_task_active_work_sessions")
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (activeErr) return { error: activeErr.message };
  if (!activeRow) return { sessions: [] };

  const { data: task, error: taskErr } = await supabase
    .from("integration_tasks")
    .select("id, title, project_track_id")
    .eq("id", activeRow.integration_task_id)
    .maybeSingle();

  if (taskErr || !task) return { sessions: [] };

  const { data: track, error: trackErr } = await supabase
    .from("project_tracks")
    .select("project_id, project_integration_id")
    .eq("id", task.project_track_id)
    .maybeSingle();

  if (trackErr || !track) return { sessions: [] };

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("customer_name")
    .eq("id", track.project_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projErr) return { error: projErr.message };
  if (!project) return { sessions: [] };

  return {
    sessions: [
      {
        integration_task_id: activeRow.integration_task_id,
        task_title: task.title,
        project_track_id: task.project_track_id,
        project_integration_id: track.project_integration_id ?? null,
        project_id: track.project_id,
        customer_name: project.customer_name ?? null,
        started_at: activeRow.started_at,
        paused_ms_accumulated: Number(activeRow.paused_ms_accumulated ?? 0),
        pause_started_at: activeRow.pause_started_at,
      },
    ],
  };
}

/** Active timer + labels for integration/project row indicators (at most one per signed-in user). */
export type ActiveWorkSessionIndicatorDTO = {
  integration_task_id: string;
  project_track_id: string;
  project_integration_id: string | null;
  project_id: string;
  started_at: string;
  paused_ms_accumulated: number;
  pause_started_at: string | null;
  task_title: string;
  integration_label: string;
  project_name: string;
};

export async function loadActiveWorkSessionIndicator(): Promise<{
  indicator?: ActiveWorkSessionIndicatorDTO | null;
  error?: string;
}> {
  const listRes = await listMyActiveWorkSessions();
  if (listRes.error) return { error: listRes.error };
  const sessions = listRes.sessions ?? [];
  if (sessions.length === 0) return { indicator: null };

  const s = sessions[0];
  const ctx = await loadGlobalActiveIntegrationTaskFinishContext(s.integration_task_id);
  if (!ctx) return { indicator: null };

  return {
    indicator: {
      integration_task_id: s.integration_task_id,
      project_track_id: s.project_track_id,
      project_integration_id: s.project_integration_id,
      project_id: s.project_id,
      started_at: s.started_at,
      paused_ms_accumulated: s.paused_ms_accumulated,
      pause_started_at: s.pause_started_at,
      task_title: ctx.title,
      integration_label: ctx.integrationLabel,
      project_name: ctx.projectName,
    },
  };
}

export type IntegrationTaskSnapshotTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: TaskPriority;
  completed_at: string | null;
};

export type IntegrationTaskSnapshotWorkSession = {
  id: string;
  integration_task_id: string;
  started_at: string;
  finished_at: string | null;
  duration_hours: number;
  work_accomplished: string | null;
};

export type IntegrationTaskSnapshot = {
  projectTrackId: string;
  tasks: IntegrationTaskSnapshotTask[];
  workSessionsByTaskId: Record<string, IntegrationTaskSnapshotWorkSession[]>;
  /** Present only when the active timer’s task is in this integration’s task list (for expand + TaskWorkRow). */
  activeWorkSession: ActiveWorkSessionDTO | null;
  /** Active timer row for this user account, whenever one exists (same as DB). */
  globalActiveWorkSession: ActiveWorkSessionDTO | null;
  /** Title of the task in `globalActiveWorkSession`, for UI when that task is not in the current list. */
  globalActiveWorkSessionTaskTitle: string | null;
  /** Integration display line for that task’s project integration. */
  globalActiveWorkSessionIntegrationLabel: string | null;
  /** Project customer name for that task. */
  globalActiveWorkSessionProjectName: string | null;
};

export async function fetchProjectTrackTaskSnapshot(
  projectTrackId: string,
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const track = await loadOwnedProjectTrack(supabase, user.id, projectTrackId);
  if (!track) return { error: "Not found" };

  const { data: taskRows, error: taskError } = await supabase
    .from("integration_tasks")
    .select("id, title, due_date, status, priority, completed_at")
    .eq("project_track_id", track.id)
    .order("sort_order")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (taskError) return { error: taskError.message };

  const tasks: IntegrationTaskSnapshotTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority,
    completed_at: t.completed_at ?? null,
  }));

  const taskIds = tasks.map((t) => t.id);
  let workRows: IntegrationTaskSnapshotWorkSession[] = [];
  if (taskIds.length > 0) {
    const { data, error } = await supabase
      .from("integration_task_work_sessions")
      .select("id, integration_task_id, started_at, finished_at, duration_hours, work_accomplished")
      .in("integration_task_id", taskIds)
      .order("started_at", { ascending: false });
    if (error) return { error: error.message };
    workRows = (data ?? []).map((row) => ({
      id: row.id,
      integration_task_id: row.integration_task_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: Number(row.duration_hours),
      work_accomplished: row.work_accomplished,
    }));
  }

  const workSessionsByTaskId: Record<string, IntegrationTaskSnapshotWorkSession[]> = {};
  for (const row of workRows) {
    if (!workSessionsByTaskId[row.integration_task_id]) workSessionsByTaskId[row.integration_task_id] = [];
    workSessionsByTaskId[row.integration_task_id].push(row);
  }

  const { data: globalActiveRow } = await supabase
    .from("integration_task_active_work_sessions")
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const taskIdSet = new Set(taskIds);
  let activeWorkSession: ActiveWorkSessionDTO | null = null;
  const globalActiveWorkSession = globalActiveRow ? rowToActiveDto(globalActiveRow) : null;

  let globalActiveWorkSessionTaskTitle: string | null = null;
  let globalActiveWorkSessionIntegrationLabel: string | null = null;
  let globalActiveWorkSessionProjectName: string | null = null;
  if (globalActiveRow?.integration_task_id) {
    const ctx = await loadIntegrationTaskFinishContext(supabase, user.id, globalActiveRow.integration_task_id);
    if (ctx) {
      globalActiveWorkSessionTaskTitle = ctx.title || null;
      globalActiveWorkSessionIntegrationLabel = ctx.integrationLabel || null;
      globalActiveWorkSessionProjectName = ctx.projectName || null;
    }
  }

  if (globalActiveWorkSession && taskIdSet.has(globalActiveWorkSession.integration_task_id)) {
    activeWorkSession = globalActiveWorkSession;
  }

  return {
    snapshot: {
      projectTrackId: track.id,
      tasks,
      workSessionsByTaskId,
      activeWorkSession,
      globalActiveWorkSession,
      globalActiveWorkSessionTaskTitle,
      globalActiveWorkSessionIntegrationLabel,
      globalActiveWorkSessionProjectName,
    },
  };
}

export async function fetchIntegrationTaskSnapshot(
  projectIntegrationId: string,
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const track = await loadOwnedIntegrationTrackByProjectIntegration(
    supabase,
    user.id,
    projectIntegrationId,
  );
  if (!track) return { error: "Not found" };
  return fetchProjectTrackTaskSnapshot(track.id);
}

export async function startOrReplaceActiveWorkSession(
  taskId: string,
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { error: delErr } = await supabase.from("integration_task_active_work_sessions").delete().eq("user_id", user.id);

  if (delErr) return { error: delErr.message };

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("integration_task_active_work_sessions")
    .insert({
      user_id: user.id,
      integration_task_id: taskId,
      started_at: nowIso,
      paused_ms_accumulated: 0,
      pause_started_at: null,
      updated_at: nowIso,
    })
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .single();

  if (insErr || !inserted) return { error: insErr?.message ?? "Could not start session" };

  await revalidateTrackPaths(track);
  return { session: rowToActiveDto(inserted) };
}

const START_TIME_FUTURE_SKEW_MS = 120_000;

export async function updateActiveWorkSessionStartedAt(
  taskId: string,
  startedAtIso: string,
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { data: row, error: fetchErr } = await supabase
    .from("integration_task_active_work_sessions")
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .eq("integration_task_id", taskId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: "No active session" };

  const started = new Date(startedAtIso);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };

  const nowMs = Date.now();
  if (started.getTime() > nowMs + START_TIME_FUTURE_SKEW_MS) {
    return { error: "Start time cannot be in the future" };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from("integration_task_active_work_sessions")
    .update({ started_at: started.toISOString(), updated_at: nowIso })
    .eq("user_id", user.id)
    .eq("integration_task_id", taskId)
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .single();

  if (upErr || !updated) return { error: upErr?.message ?? "Could not update start time" };

  await revalidateTrackPaths(track);
  return { session: rowToActiveDto(updated) };
}

export async function syncActiveWorkSessionPause(
  taskId: string,
  direction: "pause" | "resume",
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { data: row, error: fetchErr } = await supabase
    .from("integration_task_active_work_sessions")
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .eq("integration_task_id", taskId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: "No active session" };

  const now = new Date();
  const nowIso = now.toISOString();

  if (direction === "pause") {
    if (row.pause_started_at != null) {
      await revalidateTrackPaths(track);
      return { session: rowToActiveDto(row) };
    }
    const { data: updated, error: upErr } = await supabase
      .from("integration_task_active_work_sessions")
      .update({ pause_started_at: nowIso, updated_at: nowIso })
      .eq("user_id", user.id)
      .eq("integration_task_id", taskId)
      .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
      .single();
    if (upErr || !updated) return { error: upErr?.message ?? "Could not pause" };
    await revalidateTrackPaths(track);
    return { session: rowToActiveDto(updated) };
  }

  if (row.pause_started_at == null) {
    await revalidateTrackPaths(track);
    return { session: rowToActiveDto(row) };
  }

  const pauseStart = new Date(row.pause_started_at).getTime();
  if (Number.isNaN(pauseStart)) return { error: "Invalid pause state" };
  const delta = Math.max(0, now.getTime() - pauseStart);
  const newAccum = Number(row.paused_ms_accumulated ?? 0) + delta;

  const { data: updated, error: upErr } = await supabase
    .from("integration_task_active_work_sessions")
    .update({
      paused_ms_accumulated: newAccum,
      pause_started_at: null,
      updated_at: nowIso,
    })
    .eq("user_id", user.id)
    .eq("integration_task_id", taskId)
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .single();

  if (upErr || !updated) return { error: upErr?.message ?? "Could not resume" };
  await revalidateTrackPaths(track);
  return { session: rowToActiveDto(updated) };
}

export async function discardActiveWorkSession(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { error } = await supabase
    .from("integration_task_active_work_sessions")
    .delete()
    .eq("user_id", user.id)
    .eq("integration_task_id", taskId);

  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function createIntegrationTask(
  projectTrackId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const track = await loadOwnedProjectTrack(supabase, user.id, projectTrackId);
  if (!track) return { error: "Not found" };

  const title = String(formData.get("title") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium").trim();
  const dueRaw = String(formData.get("due_date") ?? "").trim();
  if (!title) return { error: "Title is required" };
  if (!isTaskPriority(priorityRaw)) return { error: "Invalid priority" };

  const due_date = dueRaw === "" ? null : dueRaw;

  let nextSortOrder = 0;
  let sortOrderQuery = supabase
    .from("integration_tasks")
    .select("sort_order")
    .eq("project_track_id", projectTrackId)
    .neq("status", "done");
  sortOrderQuery = due_date === null ? sortOrderQuery.is("due_date", null) : sortOrderQuery.eq("due_date", due_date);

  const { data: sameGroupTasks, error: sameGroupErr } = await sortOrderQuery;
  if (sameGroupErr) return { error: sameGroupErr.message };
  if (sameGroupTasks && sameGroupTasks.length > 0) {
    nextSortOrder =
      sameGroupTasks.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0) + 1;
  }

  const { error } = await supabase.from("integration_tasks").insert({
    project_track_id: projectTrackId,
    title,
    due_date,
    priority: priorityRaw,
    status: "open",
    sort_order: nextSortOrder,
  });

  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function toggleIntegrationTaskCompletion(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id, status")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  // Spec: open <-> done. If the task was cancelled, treat it as open.
  const nextStatus: TaskStatus = task.status === "open" ? "done" : "open";

  const { error } = await supabase
    .from("integration_tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "done" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) return { error: error.message };

  if (nextStatus === "done") {
    await supabase
      .from("integration_task_active_work_sessions")
      .delete()
      .eq("user_id", user.id)
      .eq("integration_task_id", taskId);
  }

  await revalidateTrackPaths(track);
  return {};
}

export async function updateIntegrationTaskDueDate(
  taskId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const dueRaw = String(formData.get("due_date") ?? "").trim();
  const due_date = dueRaw === "" ? null : dueRaw;

  const { error } = await supabase.from("integration_tasks").update({ due_date }).eq("id", taskId);

  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function updateIntegrationTask(
  taskId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const title = String(formData.get("title") ?? "").trim();
  const dueRaw = String(formData.get("due_date") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "open").trim();

  if (!title) return { error: "Title is required" };
  if (!isTaskStatus(statusRaw)) return { error: "Invalid status" };

  const due_date = dueRaw === "" ? null : dueRaw;

  const { error } = await supabase
    .from("integration_tasks")
    .update({
      title,
      due_date,
      status: statusRaw,
    })
    .eq("id", taskId);

  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function updateIntegrationTaskTitle(taskId: string, title: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { error } = await supabase.from("integration_tasks").update({ title: trimmed }).eq("id", taskId);

  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function updateIntegrationTaskPriority(
  taskId: string,
  priority: TaskPriority,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!isTaskPriority(priority)) return { error: "Invalid priority" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { error } = await supabase.from("integration_tasks").update({ priority }).eq("id", taskId);
  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function deleteIntegrationTask(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const { error } = await supabase.from("integration_tasks").delete().eq("id", taskId);

  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}

export async function createIntegrationTaskWorkSession(
  taskId: string,
  payload: {
    started_at: string;
    finished_at: string;
    duration_hours: number;
    work_accomplished: string | null;
    /** When true, also mark the integration task as done after saving the session. */
    complete_task?: boolean;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id, status")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const started = new Date(payload.started_at);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };

  const finished = new Date(payload.finished_at);
  if (Number.isNaN(finished.getTime())) return { error: "Invalid finish time" };
  if (finished.getTime() < started.getTime()) return { error: "Finish time must be after start time" };

  const raw = payload.duration_hours;
  if (!Number.isFinite(raw) || raw < 0) return { error: "Invalid duration" };
  const dh = Math.round(raw * 4) / 4;
  if (Math.abs(raw - dh) > 1e-6) return { error: "Invalid duration" };

  const { error } = await supabase.from("integration_task_work_sessions").insert({
    integration_task_id: taskId,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_hours: dh,
    work_accomplished: payload.work_accomplished,
  });

  if (error) return { error: error.message };

  await supabase
    .from("integration_task_active_work_sessions")
    .delete()
    .eq("user_id", user.id)
    .eq("integration_task_id", taskId);

  if (payload.complete_task && task.status !== "done") {
    const { error: completeErr } = await supabase
      .from("integration_tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (completeErr) return { error: completeErr.message };
  }

  await revalidateTrackPaths(track);
  return {};
}

export async function updateIntegrationTaskWorkSessionWorkAccomplished(
  workSessionId: string,
  workAccomplished: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: workSession } = await supabase
    .from("integration_task_work_sessions")
    .select("id, integration_task_id")
    .eq("id", workSessionId)
    .maybeSingle();
  if (!workSession) return { error: "Not found" };

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", workSession.integration_task_id)
    .maybeSingle();
  if (!task) return { error: "Not found" };

  const track = await loadOwnedProjectTrack(supabase, user.id, task.project_track_id);
  if (!track) return { error: "Not found" };

  const normalized = (workAccomplished ?? "").trim();
  const { error } = await supabase
    .from("integration_task_work_sessions")
    .update({ work_accomplished: normalized === "" ? null : normalized })
    .eq("id", workSessionId);
  if (error) return { error: error.message };

  await revalidateTrackPaths(track);
  return {};
}
