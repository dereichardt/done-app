/**
 * Types, constants, and pure helpers for the Work / tasks page.
 * Kept out of `tasks-page.ts` because Next.js "use server" modules may only export async functions.
 */

import type { ProjectColorKey } from "@/lib/project-colors";

/** Synthetic project id so Work filters can scope internal tasks like customer projects. */
export const TASKS_PAGE_INTERNAL_PROJECT_ID = "__internal__";

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

type TasksPageTaskShared = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: "low" | "medium" | "high";
  completed_at: string | null;
  sort_order: number;
};

export type TasksPageProjectTask = TasksPageTaskShared & {
  scope: "project";
  project_id: string;
  project_track_id: string;
  project_integration_id: string | null;
};

export type TasksPageInternalTask = TasksPageTaskShared & {
  scope: "internal";
  /** Breadcrumb line under the title (Admin, Development, or initiative title). */
  internal_context_label: string;
  internal_detail_href: string;
  internal_bucket_kind: "admin" | "development" | null;
  internal_initiative_id: string | null;
  /** Present for bucket tasks; used with Work filters / track scoping. */
  internal_track_id: string | null;
};

export type TasksPageTask = TasksPageProjectTask | TasksPageInternalTask;

export type TasksPageInternalDestination = {
  kind: "admin" | "development" | "initiative";
  /** internal_tracks.id or internal_initiatives.id */
  id: string;
  label: string;
};

export type TasksPageSnapshot = {
  /** Server-rendered YYYY-MM-DD used as a hydration-safe baseline for "today". */
  todayIso: string;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  integrations: TasksPageIntegration[];
  /** Targets for Work quick-add when Internal project is selected. */
  internalDestinations: TasksPageInternalDestination[];
  /** Open + recently completed tasks across all active projects (caller filters/groups). */
  tasks: TasksPageTask[];
  /** Up to 10 most-recently completed tasks across active projects. */
  recentlyCompleted: TasksPageTask[];
  /** Matches `ActiveWorkSessionIndicatorDTO` from integration actions (duplicated to avoid importing a "use server" module). */
  activeWorkSessionIndicator: TasksPageActiveWorkSessionIndicator | null;
};

export type TasksPageActiveWorkSessionIndicator = {
  scope: "integration" | "internal";
  task_id: string;
  project_track_id: string | null;
  project_integration_id: string | null;
  project_id: string | null;
  started_at: string;
  paused_ms_accumulated: number;
  pause_started_at: string | null;
  task_title: string;
  integration_label: string;
  project_name: string;
};

export type TaskWorkSessionHistoryRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_hours: number;
  work_accomplished: string | null;
};

export function tasksPageTaskProjectId(task: TasksPageTask): string {
  return task.scope === "internal" ? TASKS_PAGE_INTERNAL_PROJECT_ID : task.project_id;
}

/** Project track id, internal track id, or initiative id — for Work filters. */
export function tasksPageTaskTrackOrDestId(task: TasksPageTask): string {
  if (task.scope === "internal") {
    return task.internal_initiative_id ?? task.internal_track_id ?? "";
  }
  return task.project_track_id;
}
