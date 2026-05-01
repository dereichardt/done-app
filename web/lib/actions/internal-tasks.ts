"use server";

import {
  loadGlobalActiveIntegrationTaskFinishContext,
  type ActiveWorkSessionDTO,
  type IntegrationTaskSnapshot,
} from "@/lib/actions/integration-tasks";
import { loadInternalTaskFinishContextWithSupabase } from "@/lib/internal-task-context";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export type InternalTaskParent =
  | { kind: "track"; internal_track_id: string; initiative_id: null }
  | { kind: "initiative"; internal_track_id: null; initiative_id: string };

async function clearAllActiveWorkSessionsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  await supabase.from("integration_task_active_work_sessions").delete().eq("user_id", userId);
  await supabase.from("internal_task_active_work_sessions").delete().eq("user_id", userId);
}

function revalidateInternalAll(initiativeId?: string | null) {
  revalidatePath("/internal");
  revalidatePath("/work");
  revalidatePath("/tasks");
  if (initiativeId) revalidatePath(`/internal/initiatives/${initiativeId}`);
}

/** Empty → null. Otherwise finite, ≥0, quarter-hour steps (matches DB check). */
function parseInternalInitiativeEstimatedEffortHours(raw: string): { hours: number | null; error?: string } {
  const t = raw.trim();
  if (t === "") return { hours: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { hours: null, error: "Invalid estimated effort" };
  const q = Math.round(n * 4) / 4;
  if (Math.abs(n - q) > 1e-6) return { hours: null, error: "Estimated effort must be in quarter-hour steps" };
  return { hours: q };
}

async function loadOwnedInternalTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  taskId: string,
): Promise<
  | (InternalTaskParent & {
      id: string;
      status: string;
      internal_track_id: string | null;
      internal_initiative_id: string | null;
    })
  | null
> {
  const { data: task } = await supabase
    .from("internal_tasks")
    .select("id, status, internal_track_id, internal_initiative_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return null;

  if (task.internal_track_id) {
    const { data: tr } = await supabase
      .from("internal_tracks")
      .select("id, owner_id")
      .eq("id", task.internal_track_id)
      .maybeSingle();
    if (!tr || tr.owner_id !== userId) return null;
    return {
      id: task.id,
      status: task.status,
      internal_track_id: task.internal_track_id,
      internal_initiative_id: null,
      kind: "track",
      initiative_id: null,
    };
  }
  if (task.internal_initiative_id) {
    const { data: inv } = await supabase
      .from("internal_initiatives")
      .select("id, owner_id")
      .eq("id", task.internal_initiative_id)
      .maybeSingle();
    if (!inv || inv.owner_id !== userId) return null;
    return {
      id: task.id,
      status: task.status,
      internal_track_id: null,
      internal_initiative_id: task.internal_initiative_id,
      kind: "initiative",
      initiative_id: task.internal_initiative_id,
    };
  }
  return null;
}

function rowToInternalActiveDto(row: {
  internal_task_id: string;
  started_at: string;
  paused_ms_accumulated: number | string | null;
  pause_started_at: string | null;
}): ActiveWorkSessionDTO {
  return {
    scope: "internal",
    task_id: row.internal_task_id,
    started_at: row.started_at,
    paused_ms_accumulated: Number(row.paused_ms_accumulated ?? 0),
    pause_started_at: row.pause_started_at,
  };
}

export async function startOrReplaceInternalActiveWorkSession(
  taskId: string,
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  await clearAllActiveWorkSessionsForUser(supabase, user.id);

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("internal_task_active_work_sessions")
    .insert({
      user_id: user.id,
      internal_task_id: taskId,
      started_at: nowIso,
      paused_ms_accumulated: 0,
      pause_started_at: null,
      updated_at: nowIso,
    })
    .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .single();

  if (insErr || !inserted) return { error: insErr?.message ?? "Could not start session" };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return { session: rowToInternalActiveDto(inserted) };
}

const START_TIME_FUTURE_SKEW_MS = 120_000;

export async function updateInternalActiveWorkSessionStartedAt(
  taskId: string,
  startedAtIso: string,
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { data: row, error: fetchErr } = await supabase
    .from("internal_task_active_work_sessions")
    .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .eq("internal_task_id", taskId)
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
    .from("internal_task_active_work_sessions")
    .update({ started_at: started.toISOString(), updated_at: nowIso })
    .eq("user_id", user.id)
    .eq("internal_task_id", taskId)
    .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .single();

  if (upErr || !updated) return { error: upErr?.message ?? "Could not update start time" };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return { session: rowToInternalActiveDto(updated) };
}

export async function syncInternalActiveWorkSessionPause(
  taskId: string,
  direction: "pause" | "resume",
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { data: row, error: fetchErr } = await supabase
    .from("internal_task_active_work_sessions")
    .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .eq("internal_task_id", taskId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: "No active session" };

  const now = new Date();
  const nowIso = now.toISOString();

  if (direction === "pause") {
    if (row.pause_started_at != null) {
      revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
      return { session: rowToInternalActiveDto(row) };
    }
    const { data: updated, error: upErr } = await supabase
      .from("internal_task_active_work_sessions")
      .update({ pause_started_at: nowIso, updated_at: nowIso })
      .eq("user_id", user.id)
      .eq("internal_task_id", taskId)
      .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
      .single();
    if (upErr || !updated) return { error: upErr?.message ?? "Could not pause" };
    revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
    return { session: rowToInternalActiveDto(updated) };
  }

  if (row.pause_started_at == null) {
    revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
    return { session: rowToInternalActiveDto(row) };
  }

  const pauseStart = new Date(row.pause_started_at).getTime();
  if (Number.isNaN(pauseStart)) return { error: "Invalid pause state" };
  const delta = Math.max(0, now.getTime() - pauseStart);
  const newAccum = Number(row.paused_ms_accumulated ?? 0) + delta;

  const { data: updated, error: upErr } = await supabase
    .from("internal_task_active_work_sessions")
    .update({
      paused_ms_accumulated: newAccum,
      pause_started_at: null,
      updated_at: nowIso,
    })
    .eq("user_id", user.id)
    .eq("internal_task_id", taskId)
    .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .single();

  if (upErr || !updated) return { error: upErr?.message ?? "Could not resume" };
  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return { session: rowToInternalActiveDto(updated) };
}

export async function discardInternalActiveWorkSession(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { error } = await supabase
    .from("internal_task_active_work_sessions")
    .delete()
    .eq("user_id", user.id)
    .eq("internal_task_id", taskId);

  if (error) return { error: error.message };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export async function createInternalTaskWorkSession(
  taskId: string,
  payload: {
    started_at: string;
    finished_at: string;
    duration_hours: number;
    work_accomplished: string | null;
    complete_task?: boolean;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const started = new Date(payload.started_at);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };

  const finished = new Date(payload.finished_at);
  if (Number.isNaN(finished.getTime())) return { error: "Invalid finish time" };
  if (finished.getTime() < started.getTime()) return { error: "Finish time must be after start time" };

  const raw = payload.duration_hours;
  if (!Number.isFinite(raw) || raw < 0) return { error: "Invalid duration" };
  const dh = Math.round(raw * 4) / 4;
  if (Math.abs(raw - dh) > 1e-6) return { error: "Invalid duration" };

  const { error } = await supabase.from("internal_task_work_sessions").insert({
    internal_task_id: taskId,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_hours: dh,
    work_accomplished: payload.work_accomplished,
  });

  if (error) return { error: error.message };

  await supabase.from("internal_task_active_work_sessions").delete().eq("user_id", user.id).eq("internal_task_id", taskId);

  if (payload.complete_task && owned.status !== "done") {
    const { error: completeErr } = await supabase
      .from("internal_tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (completeErr) return { error: completeErr.message };
  }

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export async function createInternalInitiative(payload: {
  title: string;
  starts_on: string;
  ends_on: string;
  /** Raw form text; empty omits effort. */
  estimated_effort_hours?: string;
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const title = payload.title.trim();
  if (!title) return { error: "Title is required" };
  const starts_on = payload.starts_on.trim();
  const ends_on = payload.ends_on.trim();
  if (!starts_on || !ends_on) return { error: "Start and end dates are required" };
  if (starts_on > ends_on) return { error: "Start date must be on or before end date" };

  let estimated_effort_hours: number | null = null;
  const effortRaw = payload.estimated_effort_hours ?? "";
  if (effortRaw.trim() !== "") {
    const parsed = parseInternalInitiativeEstimatedEffortHours(effortRaw);
    if (parsed.error) return { error: parsed.error };
    estimated_effort_hours = parsed.hours;
  }

  const { data: inserted, error } = await supabase
    .from("internal_initiatives")
    .insert({
      owner_id: user.id,
      title,
      starts_on,
      ends_on,
      estimated_effort_hours,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!inserted?.id) return { error: "Could not create initiative" };

  revalidateInternalAll(inserted.id);
  return { id: inserted.id };
}

export async function updateInternalInitiativeDetails(
  initiativeId: string,
  data: { title: string; starts_on: string; ends_on: string; estimated_effort_hours?: string },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const title = data.title.trim();
  if (!title) return { error: "Title is required" };
  const starts_on = data.starts_on.trim();
  const ends_on = data.ends_on.trim();
  if (!starts_on || !ends_on) return { error: "Start and end dates are required" };
  if (starts_on > ends_on) return { error: "Start date must be on or before end date" };

  const effortParsed = parseInternalInitiativeEstimatedEffortHours(data.estimated_effort_hours ?? "");
  if (effortParsed.error) return { error: effortParsed.error };
  const estimated_effort_hours = effortParsed.hours;

  const { data: row } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!row) return { error: "Not found" };

  const { error } = await supabase
    .from("internal_initiatives")
    .update({ title, starts_on, ends_on, estimated_effort_hours })
    .eq("id", initiativeId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidateInternalAll(initiativeId);
  return {};
}

export async function patchInternalInitiativeEstimatedEffort(
  initiativeId: string,
  hours: number | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  let normalizedHours: number | null = hours;
  if (hours != null) {
    const parsed = parseInternalInitiativeEstimatedEffortHours(String(hours));
    if (parsed.error) return { error: parsed.error };
    normalizedHours = parsed.hours;
  }

  const { data: row } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!row) return { error: "Not found" };

  const { error } = await supabase
    .from("internal_initiatives")
    .update({ estimated_effort_hours: normalizedHours })
    .eq("id", initiativeId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidateInternalAll(initiativeId);
  return {};
}

export async function completeInternalInitiative(
  initiativeId: string,
  options: { completeOpenTasks: boolean },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: inv } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!inv) return { error: "Not found" };

  const { error: updateErr } = await supabase
    .from("internal_initiatives")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .is("completed_at", null);
  if (updateErr) return { error: updateErr.message };

  if (options.completeOpenTasks) {
    const { error: taskErr } = await supabase
      .from("internal_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("internal_initiative_id", initiativeId)
      .is("internal_track_id", null)
      .eq("status", "open");
    if (taskErr) return { error: taskErr.message };
  }

  revalidateInternalAll(initiativeId);
  return {};
}

export async function reopenInternalInitiative(initiativeId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: inv } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!inv) return { error: "Not found" };

  const { error } = await supabase
    .from("internal_initiatives")
    .update({ completed_at: null })
    .eq("id", initiativeId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidateInternalAll(initiativeId);
  return {};
}

export async function deleteInternalInitiative(initiativeId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: inv } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!inv) return { error: "Not found" };

  const { error: deleteErr } = await supabase
    .from("internal_initiatives")
    .delete()
    .eq("id", initiativeId)
    .eq("owner_id", user.id);
  if (deleteErr) return { error: deleteErr.message };

  revalidatePath("/internal");
  revalidatePath("/work");
  revalidatePath("/tasks");
  redirect("/internal");
}

export async function createInternalTask(
  payload: {
    internal_track_id?: string | null;
    internal_initiative_id?: string | null;
    title: string;
    priority?: TaskPriority;
    due_date?: string | null;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const trackId = payload.internal_track_id?.trim() || null;
  const initiativeId = payload.internal_initiative_id?.trim() || null;
  if ((trackId != null) === (initiativeId != null)) {
    return { error: "Specify exactly one of track or initiative" };
  }

  if (trackId) {
    const { data: tr } = await supabase
      .from("internal_tracks")
      .select("id")
      .eq("id", trackId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!tr) return { error: "Not found" };
  } else if (initiativeId) {
    const { data: inv } = await supabase
      .from("internal_initiatives")
      .select("id")
      .eq("id", initiativeId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!inv) return { error: "Not found" };
  }

  const title = payload.title.trim();
  if (!title) return { error: "Title is required" };
  const priority = payload.priority ?? "medium";
  if (!isTaskPriority(priority)) return { error: "Invalid priority" };
  const due_date = payload.due_date === undefined || payload.due_date === "" ? null : payload.due_date;

  let nextSortOrder = 0;
  let q = supabase.from("internal_tasks").select("sort_order").neq("status", "done");
  q = trackId
    ? q.eq("internal_track_id", trackId).is("internal_initiative_id", null)
    : q.eq("internal_initiative_id", initiativeId!).is("internal_track_id", null);
  q = due_date === null ? q.is("due_date", null) : q.eq("due_date", due_date);

  const { data: sameGroupTasks, error: sameGroupErr } = await q;
  if (sameGroupErr) return { error: sameGroupErr.message };
  if (sameGroupTasks && sameGroupTasks.length > 0) {
    nextSortOrder =
      sameGroupTasks.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0) + 1;
  }

  const insertRow: Record<string, unknown> = {
    title,
    due_date,
    priority,
    status: "open",
    sort_order: nextSortOrder,
    internal_track_id: trackId,
    internal_initiative_id: initiativeId,
  };

  const { error } = await supabase.from("internal_tasks").insert(insertRow);
  if (error) return { error: error.message };

  revalidateInternalAll(initiativeId);
  return {};
}

export async function toggleInternalTaskCompletion(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { data: task } = await supabase.from("internal_tasks").select("status").eq("id", taskId).maybeSingle();
  if (!task) return { error: "Not found" };

  const nextStatus: TaskStatus = task.status === "open" ? "done" : "open";

  const { error } = await supabase
    .from("internal_tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "done" ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) return { error: error.message };

  if (nextStatus === "done") {
    await supabase.from("internal_task_active_work_sessions").delete().eq("user_id", user.id).eq("internal_task_id", taskId);
  }

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export async function updateInternalTaskDueDate(
  taskId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const dueRaw = String(formData.get("due_date") ?? "").trim();
  const due_date = dueRaw === "" ? null : dueRaw;

  const { error } = await supabase.from("internal_tasks").update({ due_date }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export async function updateInternalTaskTitle(taskId: string, title: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { error } = await supabase.from("internal_tasks").update({ title: trimmed }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export async function updateInternalTaskPriority(
  taskId: string,
  priority: TaskPriority,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (!isTaskPriority(priority)) return { error: "Invalid priority" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { error } = await supabase.from("internal_tasks").update({ priority }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export async function deleteInternalTask(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const owned = await loadOwnedInternalTask(supabase, user.id, taskId);
  if (!owned) return { error: "Not found" };

  const { error } = await supabase.from("internal_tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidateInternalAll(owned.kind === "initiative" ? owned.initiative_id : null);
  return {};
}

export type InternalTaskSnapshotTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: TaskPriority;
  completed_at: string | null;
  internal_track_kind?: "admin" | "development";
};

export type InternalTaskSnapshotWorkSession = {
  id: string;
  internal_task_id: string;
  started_at: string;
  finished_at: string | null;
  duration_hours: number;
  work_accomplished: string | null;
};

/** Shape-compatible with IntegrationTaskSnapshot for panel reuse (global session fields). */
export async function fetchInternalTrackTaskSnapshot(
  internalTrackId: string,
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: tr } = await supabase
    .from("internal_tracks")
    .select("id")
    .eq("id", internalTrackId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!tr) return { error: "Not found" };

  return fetchInternalTaskSnapshotForParent(supabase, user.id, { internal_track_id: internalTrackId });
}

export async function fetchInternalInitiativeTaskSnapshot(
  initiativeId: string,
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: inv } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!inv) return { error: "Not found" };

  return fetchInternalTaskSnapshotForParent(supabase, user.id, {
    internal_initiative_id: initiativeId,
  });
}

/** Merged Admin + Development internal track tasks for `/internal`. */
export async function fetchInternalCombinedAdminDevTaskSnapshot(
  adminTrackId: string,
  developmentTrackId: string,
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: adminRow } = await supabase
    .from("internal_tracks")
    .select("id")
    .eq("id", adminTrackId)
    .eq("owner_id", user.id)
    .maybeSingle();
  const { data: devRow } = await supabase
    .from("internal_tracks")
    .select("id")
    .eq("id", developmentTrackId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!adminRow || !devRow) return { error: "Not found" };

  const { data: taskRows, error: taskError } = await supabase
    .from("internal_tasks")
    .select("id, internal_track_id, title, due_date, status, priority, completed_at")
    .in("internal_track_id", [adminTrackId, developmentTrackId])
    .is("internal_initiative_id", null)
    .order("sort_order")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (taskError) return { error: taskError.message };

  const tasks: InternalTaskSnapshotTask[] = (taskRows ?? []).map((t) => {
    const tid = t.internal_track_id as string;
    return {
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      status: t.status,
      priority: t.priority as TaskPriority,
      completed_at: t.completed_at ?? null,
      internal_track_kind: tid === adminTrackId ? ("admin" as const) : ("development" as const),
    };
  });

  return packInternalTasksIntegrationSnapshot(supabase, user.id, tasks, adminTrackId);
}

async function fetchInternalTaskSnapshotForParent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  filter: { internal_track_id: string } | { internal_initiative_id: string },
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const trackId = "internal_track_id" in filter ? filter.internal_track_id : null;
  const initiativeId = "internal_initiative_id" in filter ? filter.internal_initiative_id : null;

  let taskQuery = supabase.from("internal_tasks").select("id, title, due_date, status, priority, completed_at");
  if (trackId) taskQuery = taskQuery.eq("internal_track_id", trackId).is("internal_initiative_id", null);
  else taskQuery = taskQuery.eq("internal_initiative_id", initiativeId!).is("internal_track_id", null);

  const { data: taskRows, error: taskError } = await taskQuery.order("sort_order").order("due_date", {
    ascending: true,
    nullsFirst: false,
  });
  if (taskError) return { error: taskError.message };

  const tasks: InternalTaskSnapshotTask[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority as TaskPriority,
    completed_at: t.completed_at ?? null,
  }));

  const projectTrackId = trackId ?? initiativeId!;
  return packInternalTasksIntegrationSnapshot(supabase, userId, tasks, projectTrackId);
}

async function packInternalTasksIntegrationSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tasks: InternalTaskSnapshotTask[],
  projectTrackId: string,
): Promise<{ snapshot?: IntegrationTaskSnapshot; error?: string }> {
  const taskIds = tasks.map((t) => t.id);
  let workRows: InternalTaskSnapshotWorkSession[] = [];
  if (taskIds.length > 0) {
    const { data, error } = await supabase
      .from("internal_task_work_sessions")
      .select("id, internal_task_id, started_at, finished_at, duration_hours, work_accomplished")
      .in("internal_task_id", taskIds)
      .order("started_at", { ascending: false });
    if (error) return { error: error.message };
    workRows = (data ?? []).map((row) => ({
      id: row.id,
      internal_task_id: row.internal_task_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: Number(row.duration_hours),
      work_accomplished: row.work_accomplished,
    }));
  }

  const workSessionsByTaskId: Record<string, InternalTaskSnapshotWorkSession[]> = {};
  for (const row of workRows) {
    if (!workSessionsByTaskId[row.internal_task_id]) workSessionsByTaskId[row.internal_task_id] = [];
    workSessionsByTaskId[row.internal_task_id].push(row);
  }

  const { data: globalActiveRow } = await supabase
    .from("internal_task_active_work_sessions")
    .select("internal_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: integGlobalRow } = await supabase
    .from("integration_task_active_work_sessions")
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", userId)
    .maybeSingle();

  const taskIdSet = new Set(taskIds);

  const mapIntegRow = (row: {
    integration_task_id: string;
    started_at: string;
    paused_ms_accumulated: number | string | null;
    pause_started_at: string | null;
  }) => ({
    scope: "integration" as const,
    task_id: row.integration_task_id,
    started_at: row.started_at,
    paused_ms_accumulated: Number(row.paused_ms_accumulated ?? 0),
    pause_started_at: row.pause_started_at,
  });

  let globalActiveWorkSession: ActiveWorkSessionDTO | null = null;
  let globalActiveWorkSessionTaskTitle: string | null = null;
  let globalActiveWorkSessionIntegrationLabel: string | null = null;
  let globalActiveWorkSessionProjectName: string | null = null;

  if (integGlobalRow) {
    globalActiveWorkSession = mapIntegRow(integGlobalRow);
    const ctx = await loadGlobalActiveIntegrationTaskFinishContext(integGlobalRow.integration_task_id);
    if (ctx) {
      globalActiveWorkSessionTaskTitle = ctx.title || null;
      globalActiveWorkSessionIntegrationLabel = ctx.integrationLabel || null;
      globalActiveWorkSessionProjectName = ctx.projectName || null;
    }
  } else if (globalActiveRow) {
    globalActiveWorkSession = rowToInternalActiveDto(globalActiveRow);
    const ctx = await loadInternalTaskFinishContextWithSupabase(supabase, userId, globalActiveRow.internal_task_id);
    if (ctx) {
      globalActiveWorkSessionTaskTitle = ctx.title || null;
      globalActiveWorkSessionIntegrationLabel = ctx.integrationLabel || null;
      globalActiveWorkSessionProjectName = ctx.projectName || null;
    }
  }

  let activeWorkSession: ActiveWorkSessionDTO | null = null;
  if (globalActiveWorkSession && taskIdSet.has(globalActiveWorkSession.task_id)) {
    activeWorkSession = globalActiveWorkSession;
  }

  const integrationMappedSessions: Record<
    string,
    Array<{
      id: string;
      integration_task_id: string;
      started_at: string;
      finished_at: string | null;
      duration_hours: number;
      work_accomplished: string | null;
    }>
  > = {};
  for (const tid of Object.keys(workSessionsByTaskId)) {
    integrationMappedSessions[tid] = workSessionsByTaskId[tid].map((w) => ({
      id: w.id,
      integration_task_id: w.internal_task_id,
      started_at: w.started_at,
      finished_at: w.finished_at,
      duration_hours: w.duration_hours,
      work_accomplished: w.work_accomplished,
    }));
  }

  return {
    snapshot: {
      projectTrackId,
      tasks: tasks as unknown as IntegrationTaskSnapshot["tasks"],
      workSessionsByTaskId: integrationMappedSessions as unknown as IntegrationTaskSnapshot["workSessionsByTaskId"],
      activeWorkSession,
      globalActiveWorkSession,
      globalActiveWorkSessionTaskTitle,
      globalActiveWorkSessionIntegrationLabel,
      globalActiveWorkSessionProjectName,
    },
  };
}
