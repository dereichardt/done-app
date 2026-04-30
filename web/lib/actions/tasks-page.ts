"use server";

import {
  loadActiveWorkSessionIndicator,
  type ActiveWorkSessionIndicatorDTO,
} from "@/lib/actions/integration-tasks";
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

export type TasksPageProject = {
  id: string;
  name: string;
  /** Resolved color key (normalized) for the project — drives row tinting on the Tasks page. */
  colorKey: ProjectColorKey | null;
  /** Pre-resolved CSS custom property name (e.g. `--project-color-blue-medium`) for convenience. */
  colorVar: string | null;
};

export type TasksPageIntegration = {
  /** project_integrations.id */
  id: string;
  projectId: string;
  /** Combined integration display label, e.g. "Workday → ADP". */
  label: string;
};

export type TasksPageTrack = {
  /** project_tracks.id */
  id: string;
  projectId: string;
  kind: "integration" | "project_management";
  /** Track label shown in task crumbs/selectors. */
  label: string;
  /** Present for integration tracks only. */
  projectIntegrationId: string | null;
};

export type TasksPageTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: "low" | "medium" | "high";
  completed_at: string | null;
  sort_order: number;
  project_id: string;
  project_track_id: string;
  project_integration_id: string | null;
};

export type TasksPageSnapshot = {
  /** Server-rendered YYYY-MM-DD used as a hydration-safe baseline for "today". */
  todayIso: string;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  integrations: TasksPageIntegration[];
  /** Open + recently completed tasks across all active projects (caller filters/groups). */
  tasks: TasksPageTask[];
  /** Up to 10 most-recently completed tasks across active projects. */
  recentlyCompleted: TasksPageTask[];
  activeWorkSessionIndicator: ActiveWorkSessionIndicatorDTO | null;
};

const RECENTLY_COMPLETED_LIMIT = 10;

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

  if (projects.length === 0) {
    const { indicator } = await loadActiveWorkSessionIndicator();
    return {
      snapshot: {
        todayIso,
        projects,
        tracks: [],
        integrations: [],
        tasks: [],
        recentlyCompleted: [],
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

  const tracks: TasksPageTrack[] = (trackRows ?? []).map((row) => {
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

  const projectTrackIds = tracks.map((t) => t.id);

  if (projectTrackIds.length === 0) {
    const { indicator } = await loadActiveWorkSessionIndicator();
    return {
      snapshot: {
        todayIso,
        projects,
        integrations,
        tracks,
        tasks: [],
        recentlyCompleted: [],
        activeWorkSessionIndicator: indicator ?? null,
      },
    };
  }

  const trackById = new Map(tracks.map((t) => [t.id, t] as const));

  const [openTasksRes, completedTasksRes, indicatorRes] = await Promise.all([
    supabase
      .from("integration_tasks")
      .select("id, title, due_date, status, priority, completed_at, sort_order, project_track_id")
      .in("project_track_id", projectTrackIds)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true }),
    supabase
      .from("integration_tasks")
      .select("id, title, due_date, status, priority, completed_at, sort_order, project_track_id")
      .in("project_track_id", projectTrackIds)
      .eq("status", "done")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(RECENTLY_COMPLETED_LIMIT),
    loadActiveWorkSessionIndicator(),
  ]);

  if (openTasksRes.error) return { error: openTasksRes.error.message };
  if (completedTasksRes.error) return { error: completedTasksRes.error.message };

  const openTasks: TasksPageTask[] = (openTasksRes.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority as TasksPageTask["priority"],
    completed_at: t.completed_at ?? null,
    sort_order: Number(t.sort_order ?? 0),
    project_id: trackById.get(t.project_track_id)?.projectId ?? "",
    project_track_id: t.project_track_id,
    project_integration_id: trackById.get(t.project_track_id)?.projectIntegrationId ?? null,
  }));

  const recentlyCompleted: TasksPageTask[] = (completedTasksRes.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority as TasksPageTask["priority"],
    completed_at: t.completed_at ?? null,
    sort_order: Number(t.sort_order ?? 0),
    project_id: trackById.get(t.project_track_id)?.projectId ?? "",
    project_track_id: t.project_track_id,
    project_integration_id: trackById.get(t.project_track_id)?.projectIntegrationId ?? null,
  }));

  return {
    snapshot: {
      todayIso,
      projects,
      integrations,
        tracks,
      tasks: openTasks,
      recentlyCompleted,
      activeWorkSessionIndicator: indicatorRes.indicator ?? null,
    },
  };
}

export type TaskWorkSessionHistoryRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_hours: number;
  work_accomplished: string | null;
};

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

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { error: "Not found" };

  const { data: track } = await supabase
    .from("project_tracks")
    .select("id, project_id, project_integration_id")
    .eq("id", task.project_track_id)
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

  const { data: task } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { error: "Not found" };

  const { data: track } = await supabase
    .from("project_tracks")
    .select("id, project_id, project_integration_id")
    .eq("id", task.project_track_id)
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
  const { error } = await supabase
    .from("integration_tasks")
    .update({ due_date })
    .eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/work");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${track.project_id}`);
  if (track.project_integration_id) {
    revalidatePath(`/projects/${track.project_id}/integrations/${track.project_integration_id}`);
  }
  return {};
}

/**
 * Within-bucket drag on /work: write a new sort_order for each task in the bucket.
 *
 * Tasks in `orderedTaskIds` are assigned sort_order = index. We accept any subset
 * (e.g. just the visible bucket) since `sort_order` is the same field used by the
 * integration panel — there is no namespace collision.
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

  const { data: taskRows } = await supabase
    .from("integration_tasks")
    .select("id, project_track_id")
    .in("id", orderedTaskIds);
  if (!taskRows || taskRows.length !== orderedTaskIds.length) {
    return { error: "One or more tasks are invalid" };
  }

  const trackIds = Array.from(new Set(taskRows.map((t) => t.project_track_id)));
  const { data: trackRows } = await supabase
    .from("project_tracks")
    .select("id, project_id, project_integration_id")
    .in("id", trackIds);
  if (!trackRows) return { error: "Not found" };

  const projectIds = Array.from(new Set(trackRows.map((r) => r.project_id)));
  const { data: ownedProjects } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", user.id)
    .in("id", projectIds);
  const ownedProjectIds = new Set((ownedProjects ?? []).map((r) => r.id));
  if (trackRows.some((r) => !ownedProjectIds.has(r.project_id))) {
    return { error: "Permission denied" };
  }

  const updates = orderedTaskIds.map((taskId, index) =>
    supabase.from("integration_tasks").update({ sort_order: index }).eq("id", taskId),
  );
  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) return { error: error.message };
  }

  revalidatePath("/work");
  revalidatePath("/tasks");
  for (const track of trackRows) {
    revalidatePath(`/projects/${track.project_id}`);
    if (track.project_integration_id) {
      revalidatePath(`/projects/${track.project_id}/integrations/${track.project_integration_id}`);
    }
  }
  return {};
}
