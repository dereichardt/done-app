"use server";

import {
  deleteIntegrationTask,
  loadActiveWorkSessionIndicator,
  startOrReplaceActiveWorkSession,
  toggleIntegrationTaskCompletion,
  updateIntegrationTaskDueDate,
  updateIntegrationTaskPriority,
  updateIntegrationTaskTitle,
  type ActiveWorkSessionDTO,
} from "@/lib/actions/integration-tasks";
import {
  deleteInternalTask,
  startOrReplaceInternalActiveWorkSession,
  toggleInternalTaskCompletion,
  updateInternalTaskDueDate,
  updateInternalTaskPriority,
  updateInternalTaskTitle,
} from "@/lib/actions/internal-tasks";
import { ensureInternalTracks } from "@/lib/actions/internal-work";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { getUserTodayIso } from "@/lib/user-preferences";
import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import {
  normalizeProjectColorKey,
  projectColorCssVar,
  type ProjectColorKey,
} from "@/lib/project-colors";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  TASKS_PAGE_INTERNAL_PROJECT_ID,
  type TaskWorkSessionHistoryRow,
  type TasksPageInternalDestination,
  type TasksPageInternalTask,
  type TasksPageIntegration,
  type TasksPageProject,
  type TasksPageProjectTask,
  type TasksPageSnapshot,
  type TasksPageTask,
  type TasksPageTrack,
} from "@/lib/tasks-page-shared";

const RECENTLY_COMPLETED_LIMIT = 10;

async function loadInternalWorkTasksForSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{
  internalProject: TasksPageProject | null;
  internalDestinations: TasksPageInternalDestination[];
  open: TasksPageInternalTask[];
  recent: TasksPageInternalTask[];
}> {
  const { data: trackRows } = await supabase
    .from("internal_tracks")
    .select("id, kind")
    .eq("owner_id", userId);

  if (!trackRows || trackRows.length === 0) {
    return { internalProject: null, internalDestinations: [], open: [], recent: [] };
  }

  const trackIds = trackRows.map((r) => r.id);
  const kindByTrackId = new Map(trackRows.map((r) => [r.id, r.kind as "admin" | "development"]));

  const { data: initiativeRows } = await supabase
    .from("internal_initiatives")
    .select("id, title")
    .eq("owner_id", userId)
    .order("starts_on", { ascending: false });
  const iniIds = (initiativeRows ?? []).map((r) => r.id);
  const initiativeTitleById = new Map((initiativeRows ?? []).map((r) => [r.id, (r.title ?? "").trim() || "Initiative"]));

  const orParts: string[] = [];
  if (trackIds.length) orParts.push(`internal_track_id.in.(${trackIds.join(",")})`);
  if (iniIds.length) orParts.push(`internal_initiative_id.in.(${iniIds.join(",")})`);
  const orFilter = orParts.join(",");

  let openRows: Array<{
    id: string;
    title: string;
    due_date: string | null;
    status: string;
    priority: string;
    completed_at: string | null;
    sort_order: number;
    internal_track_id: string | null;
    internal_initiative_id: string | null;
  }> = [];
  let recentRows: typeof openRows = [];

  if (orFilter) {
    const [oRes, rRes] = await Promise.all([
      supabase
        .from("internal_tasks")
        .select(
          "id, title, due_date, status, priority, completed_at, sort_order, internal_track_id, internal_initiative_id",
        )
        .or(orFilter)
        .neq("status", "done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true }),
      supabase
        .from("internal_tasks")
        .select(
          "id, title, due_date, status, priority, completed_at, sort_order, internal_track_id, internal_initiative_id",
        )
        .or(orFilter)
        .eq("status", "done")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(RECENTLY_COMPLETED_LIMIT),
    ]);
    if (!oRes.error) openRows = oRes.data ?? [];
    if (!rRes.error) recentRows = rRes.data ?? [];
  }

  function mapRow(
    t: (typeof openRows)[number],
  ): TasksPageInternalTask {
    if (t.internal_track_id) {
      const k = kindByTrackId.get(t.internal_track_id) ?? "admin";
      const label = k === "admin" ? "Admin" : "Development";
      return {
        scope: "internal",
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        status: t.status,
        priority: t.priority as TasksPageInternalTask["priority"],
        completed_at: t.completed_at ?? null,
        sort_order: Number(t.sort_order ?? 0),
        internal_context_label: label,
        internal_detail_href: "/internal",
        internal_bucket_kind: k,
        internal_initiative_id: null,
        internal_track_id: t.internal_track_id,
      };
    }
    const ini = t.internal_initiative_id!;
    const title = initiativeTitleById.get(ini) ?? "Initiative";
    return {
      scope: "internal",
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      status: t.status,
      priority: t.priority as TasksPageInternalTask["priority"],
      completed_at: t.completed_at ?? null,
      sort_order: Number(t.sort_order ?? 0),
      internal_context_label: title,
      internal_detail_href: `/internal/initiatives/${ini}`,
      internal_bucket_kind: null,
      internal_initiative_id: ini,
      internal_track_id: null,
    };
  }

  const destinations: TasksPageInternalDestination[] = [];
  for (const tr of trackRows) {
    destinations.push({
      kind: tr.kind as "admin" | "development",
      id: tr.id,
      label: tr.kind === "admin" ? "Admin" : "Development",
    });
  }
  for (const inv of initiativeRows ?? []) {
    destinations.push({
      kind: "initiative",
      id: inv.id,
      label: (inv.title ?? "").trim() || "Initiative",
    });
  }

  const internalProject: TasksPageProject = {
    id: TASKS_PAGE_INTERNAL_PROJECT_ID,
    name: "Internal",
    colorKey: null,
    colorVar: null,
  };

  return {
    internalProject,
    internalDestinations: destinations,
    open: openRows.map(mapRow),
    recent: recentRows.map(mapRow),
  };
}

export async function loadTasksPageSnapshot(): Promise<{
  snapshot?: TasksPageSnapshot;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);

  const { data: projectRows, error: projectErr } = await supabase
    .from("projects")
    .select("id, customer_name, active_dashboard_order, project_color_key")
    .eq("owner_id", user.id)
    .is("completed_at", null)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("customer_name", { ascending: true });
  if (projectErr) return { error: projectErr.message };

  const projects: TasksPageProject[] = (projectRows ?? []).map((p) => {
    const colorKey = normalizeProjectColorKey(p.project_color_key);
    return {
      id: p.id,
      name: (p.customer_name ?? "").trim() || "Untitled project",
      colorKey,
      colorVar: colorKey ? projectColorCssVar(colorKey) : null,
    };
  });

  await ensureInternalTracks();
  const internalBlock = await loadInternalWorkTasksForSnapshot(supabase, user.id);
  const snapshotProjects: TasksPageProject[] =
    internalBlock.internalProject != null ? [...projects, internalBlock.internalProject] : projects;

  if (projects.length === 0) {
    const { indicator } = await loadActiveWorkSessionIndicator();
    return {
      snapshot: {
        todayIso,
        projects: snapshotProjects,
        tracks: [],
        integrations: [],
        internalDestinations: internalBlock.internalDestinations,
        tasks: internalBlock.open,
        recentlyCompleted: internalBlock.recent,
        activeWorkSessionIndicator: indicator ?? null,
      },
    };
  }

  const projectIds = projects.map((p) => p.id);

  const { data: piRows, error: piErr } = await supabase
    .from("project_integrations")
    .select("id, project_id, integration_id")
    .in("project_id", projectIds);
  if (piErr) return { error: piErr.message };

  const { data: trackRows, error: trackErr } = await supabase
    .from("project_tracks")
    .select("id, project_id, kind, integration_id, project_integration_id, name")
    .in("project_id", projectIds)
    .order("sort_order", { ascending: true });
  if (trackErr) return { error: trackErr.message };

  const integrationDefIds = Array.from(
    new Set((piRows ?? []).map((row) => row.integration_id).filter((v): v is string => Boolean(v))),
  );

  let integrationDefById: Record<
    string,
    { name: string | null; integration_code: string | null; integrating_with: string | null; direction: string | null }
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

  const integrations: TasksPageIntegration[] = (piRows ?? []).map((row) => {
    const def = row.integration_id ? integrationDefById[row.integration_id] : undefined;
    const label = def
      ? formatIntegrationDefinitionDisplayName({
          integration_code: def.integration_code,
          integrating_with: def.integrating_with,
          name: def.name,
          direction: def.direction,
        }) || (def.name ?? "Integration")
      : "Integration";
    return {
      id: row.id,
      projectId: row.project_id,
      label,
    };
  });

  const integrationLabelByPiId = new Map(integrations.map((i) => [i.id, i.label] as const));

  const projectTracks: TasksPageTrack[] = (trackRows ?? []).map((row) => {
    const isIntegration = row.kind === "integration";
    const integrationLabel =
      row.project_integration_id != null
        ? integrationLabelByPiId.get(row.project_integration_id) ?? null
        : null;
    const name = (row.name ?? "").trim();
    return {
      id: row.id,
      projectId: row.project_id,
      kind: isIntegration ? "integration" : "project_management",
      label: isIntegration
        ? ((integrationLabel ?? name) || "Integration")
        : name || "Project Management",
      projectIntegrationId: row.project_integration_id ?? null,
    };
  });

  const internalFilterTracks: TasksPageTrack[] = internalBlock.internalDestinations.map((d) => ({
    id: d.id,
    projectId: TASKS_PAGE_INTERNAL_PROJECT_ID,
    kind: "project_management" as const,
    label: d.label,
    projectIntegrationId: null,
  }));

  const tracks: TasksPageTrack[] = [...projectTracks, ...internalFilterTracks];

  const integrationTrackIds = projectTracks.map((t) => t.id);

  if (integrationTrackIds.length === 0) {
    const { indicator } = await loadActiveWorkSessionIndicator();
    return {
      snapshot: {
        todayIso,
        projects: snapshotProjects,
        integrations,
        tracks,
        internalDestinations: internalBlock.internalDestinations,
        tasks: internalBlock.open,
        recentlyCompleted: internalBlock.recent,
        activeWorkSessionIndicator: indicator ?? null,
      },
    };
  }

  const trackById = new Map(projectTracks.map((t) => [t.id, t] as const));

  const [openTasksRes, completedTasksRes, indicatorRes] = await Promise.all([
    supabase
      .from("integration_tasks")
      .select("id, title, due_date, status, priority, completed_at, sort_order, project_track_id")
      .in("project_track_id", integrationTrackIds)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true }),
    supabase
      .from("integration_tasks")
      .select("id, title, due_date, status, priority, completed_at, sort_order, project_track_id")
      .in("project_track_id", integrationTrackIds)
      .eq("status", "done")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(RECENTLY_COMPLETED_LIMIT),
    loadActiveWorkSessionIndicator(),
  ]);

  if (openTasksRes.error) return { error: openTasksRes.error.message };
  if (completedTasksRes.error) return { error: completedTasksRes.error.message };

  const openTasks: TasksPageTask[] = (openTasksRes.data ?? []).map((t) => ({
    scope: "project" as const,
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority as TasksPageProjectTask["priority"],
    completed_at: t.completed_at ?? null,
    sort_order: Number(t.sort_order ?? 0),
    project_id: trackById.get(t.project_track_id)?.projectId ?? "",
    project_track_id: t.project_track_id,
    project_integration_id: trackById.get(t.project_track_id)?.projectIntegrationId ?? null,
  }));

  const recentlyCompleted: TasksPageTask[] = (completedTasksRes.data ?? []).map((t) => ({
    scope: "project" as const,
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority as TasksPageProjectTask["priority"],
    completed_at: t.completed_at ?? null,
    sort_order: Number(t.sort_order ?? 0),
    project_id: trackById.get(t.project_track_id)?.projectId ?? "",
    project_track_id: t.project_track_id,
    project_integration_id: trackById.get(t.project_track_id)?.projectIntegrationId ?? null,
  }));

  return {
    snapshot: {
      todayIso,
      projects: snapshotProjects,
      integrations,
      tracks,
      internalDestinations: internalBlock.internalDestinations,
      tasks: [...openTasks, ...internalBlock.open],
      recentlyCompleted: [...recentlyCompleted, ...internalBlock.recent],
      activeWorkSessionIndicator: indicatorRes.indicator ?? null,
    },
  };
}

/**
 * Lazy fetch of the work session history for a single task (used when the Tasks page
 * opens its History dialog). Mirrors the columns the integration panel reads.
 */
export async function loadTaskWorkSessionHistory(
  taskId: string,
): Promise<{ sessions?: TaskWorkSessionHistoryRow[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: integTask } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (integTask) {
    const { data: track } = await supabase
      .from("project_tracks")
      .select("id, project_id, project_integration_id")
      .eq("id", integTask.project_track_id)
      .maybeSingle();
    if (!track) return { error: "Not found" };

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", track.project_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!project) return { error: "Not found" };

    const { data, error } = await supabase
      .from("integration_task_work_sessions")
      .select("id, started_at, finished_at, duration_hours, work_accomplished")
      .eq("integration_task_id", taskId)
      .order("started_at", { ascending: false });
    if (error) return { error: error.message };

    const sessions: TaskWorkSessionHistoryRow[] = (data ?? []).map((row) => ({
      id: row.id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: Number(row.duration_hours),
      work_accomplished: row.work_accomplished,
    }));
    return { sessions };
  }

  const { data: internalTask } = await supabase
    .from("internal_tasks")
    .select("id, internal_track_id, internal_initiative_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!internalTask) return { error: "Not found" };

  if (internalTask.internal_track_id) {
    const { data: tr } = await supabase
      .from("internal_tracks")
      .select("owner_id")
      .eq("id", internalTask.internal_track_id)
      .maybeSingle();
    if (!tr || tr.owner_id !== user.id) return { error: "Not found" };
  } else if (internalTask.internal_initiative_id) {
    const { data: inv } = await supabase
      .from("internal_initiatives")
      .select("owner_id")
      .eq("id", internalTask.internal_initiative_id)
      .maybeSingle();
    if (!inv || inv.owner_id !== user.id) return { error: "Not found" };
  } else {
    return { error: "Not found" };
  }

  const { data, error } = await supabase
    .from("internal_task_work_sessions")
    .select("id, started_at, finished_at, duration_hours, work_accomplished")
    .eq("internal_task_id", taskId)
    .order("started_at", { ascending: false });
  if (error) return { error: error.message };

  const sessions: TaskWorkSessionHistoryRow[] = (data ?? []).map((row) => ({
    id: row.id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    duration_hours: Number(row.duration_hours),
    work_accomplished: row.work_accomplished,
  }));
  return { sessions };
}

/**
 * Cross-bucket drag on /work: write the new due_date and revalidate the affected paths.
 *
 * Mirrors the shape of `updateIntegrationTaskDueDate` so that the integration-detail
 * page sees the change after `router.refresh()`.
 */
export async function rescheduleTaskByDrag(
  taskId: string,
  /** ISO YYYY-MM-DD or empty string to clear the due date. */
  dueDateIso: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: integTask } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();

  if (integTask) {
    const { data: track } = await supabase
      .from("project_tracks")
      .select("id, project_id, project_integration_id")
      .eq("id", integTask.project_track_id)
      .maybeSingle();
    if (!track) return { error: "Not found" };

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", track.project_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!project) return { error: "Not found" };

    const due_date = dueDateIso.trim() === "" ? null : dueDateIso.trim();
    const { error } = await supabase.from("integration_tasks").update({ due_date }).eq("id", taskId);
    if (error) return { error: error.message };

    revalidatePath("/work");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${track.project_id}`);
    if (track.project_integration_id) {
      revalidatePath(`/projects/${track.project_id}/integrations/${track.project_integration_id}`);
    }
    return {};
  }

  const { data: internalTask } = await supabase
    .from("internal_tasks")
    .select("id, internal_track_id, internal_initiative_id")
    .eq("id", taskId)
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

  const due_date = dueDateIso.trim() === "" ? null : dueDateIso.trim();
  const { error } = await supabase.from("internal_tasks").update({ due_date }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/work");
  revalidatePath("/tasks");
  revalidatePath("/internal");
  if (internalTask.internal_initiative_id) {
    revalidatePath(`/internal/initiatives/${internalTask.internal_initiative_id}`);
  }
  return {};
}

/**
 * Within-bucket drag on /work: set `sort_order` to the task's index in `orderedTaskIds` (0..n-1).
 *
 * Integration and internal rows share one visible list; using the **same** index for both types
 * lets `sort_order` sort interleaved project + internal tasks on the Work page.
 */
export async function reorderTaskWithinGroup(
  orderedTaskIds: string[],
): Promise<{ error?: string }> {
  if (orderedTaskIds.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: integTaskRows } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .in("id", orderedTaskIds);

  const integById = new Map((integTaskRows ?? []).map((r) => [r.id, r] as const));
  const internalIdsInOrder = orderedTaskIds.filter((id) => !integById.has(id));
  const integrationIdsInOrder = orderedTaskIds.filter((id) => integById.has(id));

  if (internalIdsInOrder.length > 0) {
    const { data: internalTaskRows } = await supabase
      .from("internal_tasks")
      .select("id, internal_track_id, internal_initiative_id")
      .in("id", internalIdsInOrder);
    if (!internalTaskRows || internalTaskRows.length !== internalIdsInOrder.length) {
      return { error: "One or more tasks are invalid" };
    }
    for (const row of internalTaskRows) {
      if (row.internal_initiative_id) {
        const { data: inv } = await supabase
          .from("internal_initiatives")
          .select("id")
          .eq("id", row.internal_initiative_id)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!inv) return { error: "Not found" };
      } else if (row.internal_track_id) {
        const { data: tr } = await supabase
          .from("internal_tracks")
          .select("id")
          .eq("id", row.internal_track_id)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!tr) return { error: "Not found" };
      } else {
        return { error: "Not found" };
      }
    }
  }

  let trackRows: { id: string; project_id: string; project_integration_id: string | null }[] | null =
    null;
  if (integrationIdsInOrder.length > 0) {
    const integRowsOrdered = integrationIdsInOrder.map((id) => integById.get(id)!);
    const trackIds = Array.from(new Set(integRowsOrdered.map((t) => t.project_track_id)));
    const { data: tr } = await supabase
      .from("project_tracks")
      .select("id, project_id, project_integration_id")
      .in("id", trackIds);
    if (!tr) return { error: "Not found" };
    trackRows = tr;

    const projectIds = Array.from(new Set(tr.map((r) => r.project_id)));
    const { data: ownedProjects } = await supabase
      .from("projects")
      .select("id")
      .eq("owner_id", user.id)
      .in("id", projectIds);
    const ownedProjectIds = new Set((ownedProjects ?? []).map((r) => r.id));
    if (tr.some((r) => !ownedProjectIds.has(r.project_id))) {
      return { error: "Permission denied" };
    }
  }

  if (integrationIdsInOrder.length === 0 && internalIdsInOrder.length === 0) {
    return { error: "One or more tasks are invalid" };
  }

  const updates = orderedTaskIds.map((taskId, index) =>
    integById.has(taskId)
      ? supabase.from("integration_tasks").update({ sort_order: index }).eq("id", taskId)
      : supabase.from("internal_tasks").update({ sort_order: index }).eq("id", taskId),
  );
  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) return { error: error.message };
  }

  revalidatePath("/work");
  revalidatePath("/tasks");
  if (trackRows) {
    for (const track of trackRows) {
      revalidatePath(`/projects/${track.project_id}`);
      if (track.project_integration_id) {
        revalidatePath(`/projects/${track.project_id}/integrations/${track.project_integration_id}`);
      }
    }
  }
  if (internalIdsInOrder.length > 0) {
    revalidatePath("/internal");
  }

  return {};
}

export async function toggleAnyTaskCompletion(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
  if (data) return toggleIntegrationTaskCompletion(taskId);
  return toggleInternalTaskCompletion(taskId);
}

export async function updateAnyTaskTitle(taskId: string, title: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
  if (data) return updateIntegrationTaskTitle(taskId, title);
  return updateInternalTaskTitle(taskId, title);
}

export async function updateAnyTaskPriority(
  taskId: string,
  priority: "low" | "medium" | "high",
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
  if (data) return updateIntegrationTaskPriority(taskId, priority);
  return updateInternalTaskPriority(taskId, priority);
}

export async function updateAnyTaskDueDate(taskId: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
  if (data) return updateIntegrationTaskDueDate(taskId, formData);
  return updateInternalTaskDueDate(taskId, formData);
}

export async function deleteAnyTask(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
  if (data) return deleteIntegrationTask(taskId);
  return deleteInternalTask(taskId);
}

export async function startOrReplaceAnyActiveWorkSession(
  taskId: string,
): Promise<{ session?: ActiveWorkSessionDTO; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
  if (data) return startOrReplaceActiveWorkSession(taskId);
  return startOrReplaceInternalActiveWorkSession(taskId);
}
