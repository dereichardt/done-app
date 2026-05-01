import type { CanvasSelectOption } from "@/components/canvas-select";
import { getUserTodayIso } from "@/lib/user-preferences";

export type IntegrationTaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: "low" | "medium" | "high";
  /** ISO timestamp when marked done; null if open or never recorded. */
  completed_at: string | null;
  /** Set for merged Admin + Development internal track lists. */
  internal_track_kind?: "admin" | "development";
};

export type IntegrationTaskWorkSessionRow = {
  id: string;
  integration_task_id: string;
  started_at: string;
  finished_at: string | null;
  duration_hours: number;
  work_accomplished: string | null;
};

export const taskPriorityOptions: CanvasSelectOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const taskSortOptions: CanvasSelectOption[] = [
  { value: "due_date", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
];

export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Completion timestamp (timestamptz); date-only display, not struck through with task title. */
export function formatCompletedOnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function sortTasksByDueDate(a: IntegrationTaskRow, b: IntegrationTaskRow): number {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

export function sortTasksByPriority(a: IntegrationTaskRow, b: IntegrationTaskRow): number {
  const rank: Record<IntegrationTaskRow["priority"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return rank[a.priority] - rank[b.priority];
}

export function sortTasksByTitle(a: IntegrationTaskRow, b: IntegrationTaskRow): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

/** Returns today's date as YYYY-MM-DD in the provided timezone (fallback: browser/local). */
export function localTodayIso(timezone?: string | null): string {
  if (!timezone) return new Date().toLocaleDateString("en-CA");
  return getUserTodayIso(timezone);
}

export function isIntegrationTaskPastDue(task: IntegrationTaskRow, todayIso: string): boolean {
  return task.due_date != null && task.due_date < todayIso;
}

export function addDaysIsoUtc(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nextMondayIsoUtc(todayIso: string): string {
  const d = new Date(`${todayIso}T12:00:00.000Z`);
  const weekday = d.getUTCDay(); // 0=Sunday, 1=Monday
  const daysUntilMonday = (1 - weekday + 7) % 7;
  return daysUntilMonday === 0 ? addDaysIsoUtc(todayIso, 7) : addDaysIsoUtc(todayIso, daysUntilMonday);
}
