/**
 * Pure helpers for the Home open-tasks card (Today / This week filters).
 */

import {
  addDaysIsoUtc,
  formatDateDisplay,
  nextWeekBucketStartIsoUtc,
} from "@/lib/integration-task-helpers";
import type { TasksPageTask } from "@/lib/tasks-page-shared";

export type HomeTasksMode = "today" | "this_week";

export type HomeTaskDateGroup = {
  id: string;
  title: string;
  tasks: TasksPageTask[];
};

function sortTasks(rows: TasksPageTask[]) {
  rows.sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    const ad = a.due_date ?? "9999-12-31";
    const bd = b.due_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function groupTasksByDueDate(tasks: TasksPageTask[]): Map<string, TasksPageTask[]> {
  const byDate = new Map<string, TasksPageTask[]>();
  for (const t of tasks) {
    const key = t.due_date;
    if (!key) continue;
    const arr = byDate.get(key) ?? [];
    arr.push(t);
    byDate.set(key, arr);
  }
  return byDate;
}

function titleForDateGroup(dateIso: string, todayIso: string): string {
  const dateLabel = formatDateDisplay(dateIso);
  if (dateIso < todayIso) return `Past due · ${dateLabel}`;
  if (dateIso === todayIso) return `Today · ${dateLabel}`;
  if (dateIso === addDaysIsoUtc(todayIso, 1)) return `Tomorrow · ${dateLabel}`;
  return dateLabel;
}

/** End of "this week" bucket on Work: day before next-week Sunday (exclusive upper bound via `< nextWeekStart`). */
export function homeThisWeekEndExclusiveIso(todayIso: string): string {
  return nextWeekBucketStartIsoUtc(todayIso);
}

/** Whether a due date still belongs in the Home card for the given mode. */
export function homeTaskMatchesMode(
  dueDateIso: string | null,
  mode: HomeTasksMode,
  todayIso: string,
): boolean {
  if (!dueDateIso) return false;
  if (mode === "today") {
    return dueDateIso <= todayIso;
  }
  const weekEndExclusive = homeThisWeekEndExclusiveIso(todayIso);
  return dueDateIso < weekEndExclusive;
}

/**
 * Build display groups for the Home open-tasks card.
 * Today: Past due (by date) + Today — each header includes the date.
 * This week: one group per due date from past-due through end of week bucket.
 */
export function computeHomeTaskGroups({
  openTasks,
  todayIso,
  mode,
}: {
  openTasks: TasksPageTask[];
  todayIso: string;
  mode: HomeTasksMode;
}): HomeTaskDateGroup[] {
  const weekEndExclusive = homeThisWeekEndExclusiveIso(todayIso);

  if (mode === "today") {
    const pastDue: TasksPageTask[] = [];
    const today: TasksPageTask[] = [];
    for (const task of openTasks) {
      const due = task.due_date;
      if (!due) continue;
      if (due < todayIso) pastDue.push(task);
      else if (due === todayIso) today.push(task);
    }
    sortTasks(pastDue);
    sortTasks(today);

    const groups: HomeTaskDateGroup[] = [];
    const pastDueByDate = groupTasksByDueDate(pastDue);
    const pastDueDates = [...pastDueByDate.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const dateIso of pastDueDates) {
      groups.push({
        id: `past_due_${dateIso}`,
        title: titleForDateGroup(dateIso, todayIso),
        tasks: pastDueByDate.get(dateIso)!,
      });
    }
    if (today.length > 0) {
      groups.push({
        id: "today",
        title: titleForDateGroup(todayIso, todayIso),
        tasks: today,
      });
    }
    return groups;
  }

  const inRange: TasksPageTask[] = [];
  for (const task of openTasks) {
    const due = task.due_date;
    if (!due) continue;
    if (due < weekEndExclusive) inRange.push(task);
  }
  sortTasks(inRange);

  const byDate = groupTasksByDueDate(inRange);
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return dates.map((dateIso) => ({
    id: dateIso,
    title: titleForDateGroup(dateIso, todayIso),
    tasks: byDate.get(dateIso)!,
  }));
}
