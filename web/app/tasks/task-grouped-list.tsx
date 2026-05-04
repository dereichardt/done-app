"use client";

import { TaskWorkRow } from "@/components/integration-tasks-panel";
import { TaskRow, type TaskRowCrumb } from "@/components/task-row";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ActiveWorkSessionDTO } from "@/lib/actions/integration-tasks";
import type { TasksPageTask } from "@/lib/tasks-page-shared";
import {
  addDaysIsoUtc,
  formatDateDisplay,
  nextMondayIsoUtc,
  nextWeekBucketStartIsoUtc,
  type IntegrationTaskRow,
} from "@/lib/integration-task-helpers";

export type TaskBucketId =
  | "past_due"
  | "today"
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "later"
  | "no_date"
  | "completed";

export type TaskBucket = {
  id: TaskBucketId;
  title: string;
  tasks: TasksPageTask[];
  /** Default ISO date used when a task is dropped into this bucket (null = clear due date). */
  defaultDueDateIso: string | null;
  /** Next week only: visual groups by due date (same order as `tasks`). */
  dateSubgroups?: { dateIso: string; title: string; tasks: TasksPageTask[] }[];
};

/**
 * Compute date-based buckets for the Tasks page. Open tasks first, then a Recently completed bucket
 * appended only if non-empty.
 */
export function computeTaskBuckets({
  openTasks,
  recentlyCompleted,
  todayIso,
}: {
  openTasks: TasksPageTask[];
  recentlyCompleted: TasksPageTask[];
  todayIso: string;
}): TaskBucket[] {
  const tomorrowIso = addDaysIsoUtc(todayIso, 1);
  const nextWeekStartIso = nextWeekBucketStartIsoUtc(todayIso);
  const nextWeekEndIso = addDaysIsoUtc(nextWeekStartIso, 6);

  const pastDue: TasksPageTask[] = [];
  const today: TasksPageTask[] = [];
  const tomorrow: TasksPageTask[] = [];
  const thisWeek: TasksPageTask[] = [];
  const nextWeek: TasksPageTask[] = [];
  const later: TasksPageTask[] = [];
  const noDate: TasksPageTask[] = [];

  for (const task of openTasks) {
    const due = task.due_date;
    if (!due) {
      noDate.push(task);
      continue;
    }
    if (due < todayIso) pastDue.push(task);
    else if (due === todayIso) today.push(task);
    else if (due === tomorrowIso) tomorrow.push(task);
    else if (due < nextWeekStartIso) thisWeek.push(task);
    else if (due <= nextWeekEndIso) nextWeek.push(task);
    else later.push(task);
  }

  /**
   * Manual drag order is stored in `sort_order` (per table). Sort by that first so reorder sticks;
   * tie-break on due_date so new tasks (often sort_order 0) still group sensibly by date.
   * Due-first ordering would undo any cross-date drag within the same bucket on the next render.
   */
  function sortBucket(rows: TasksPageTask[]) {
    rows.sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      const ad = a.due_date ?? "9999-12-31";
      const bd = b.due_date ?? "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  sortBucket(pastDue);
  sortBucket(today);
  sortBucket(tomorrow);
  sortBucket(thisWeek);
  sortBucket(nextWeek);
  sortBucket(later);
  sortBucket(noDate);

  const nextWeekSubgroups =
    nextWeek.length === 0
      ? undefined
      : (() => {
          const byDate = new Map<string, TasksPageTask[]>();
          for (const t of nextWeek) {
            const key = t.due_date ?? "";
            if (!key) continue;
            const arr = byDate.get(key) ?? [];
            arr.push(t);
            byDate.set(key, arr);
          }
          const dates = [...byDate.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          return dates.map((dateIso) => ({
            dateIso,
            title: formatDateDisplay(dateIso),
            tasks: byDate.get(dateIso)!,
          }));
        })();

  const buckets: TaskBucket[] = [
    { id: "past_due", title: "Past due", tasks: pastDue, defaultDueDateIso: todayIso },
    { id: "today", title: "Today", tasks: today, defaultDueDateIso: todayIso },
    { id: "tomorrow", title: "Tomorrow", tasks: tomorrow, defaultDueDateIso: tomorrowIso },
    { id: "this_week", title: "This week", tasks: thisWeek, defaultDueDateIso: nextMondayIsoUtc(todayIso) },
    {
      id: "next_week",
      title: "Next week",
      tasks: nextWeek,
      defaultDueDateIso: nextWeekStartIso,
      dateSubgroups: nextWeekSubgroups,
    },
    { id: "later", title: "Later", tasks: later, defaultDueDateIso: addDaysIsoUtc(todayIso, 14) },
    { id: "no_date", title: "No due date", tasks: noDate, defaultDueDateIso: null },
  ];

  if (recentlyCompleted.length > 0) {
    buckets.push({
      id: "completed",
      title: "Recently completed",
      tasks: recentlyCompleted,
      defaultDueDateIso: null,
    });
  }

  return buckets;
}

/** Encode "<bucketId>:<taskId>" as the dnd id so we can derive both pieces in handlers. */
function makeSortableId(bucketId: TaskBucketId, taskId: string) {
  return `${bucketId}:${taskId}`;
}

function parseSortableId(id: string): { bucketId: TaskBucketId; taskId: string } | null {
  const ix = id.indexOf(":");
  if (ix < 0) return null;
  const bucketId = id.slice(0, ix) as TaskBucketId;
  const taskId = id.slice(ix + 1);
  if (!bucketId || !taskId) return null;
  return { bucketId, taskId };
}

function SortableTaskRow({
  task,
  bucketId,
  crumb,
  effectiveGlobalActiveTaskId,
  starting,
  collapsedDone,
  onStartWork,
  onOpenHistory,
  onOpenDelete,
  onSaveTitle,
  onSavePriority,
  onSaveDueDate,
  onAfterToggleComplete,
  onAfterUndo,
  onLongPressCompleteLog,
  isDragOverlay = false,
  dndReady,
}: {
  task: TasksPageTask;
  bucketId: TaskBucketId;
  crumb: TaskRowCrumb;
  effectiveGlobalActiveTaskId: string | null;
  starting: boolean;
  collapsedDone: boolean;
  onStartWork: (task: TasksPageTask) => void | Promise<void>;
  onOpenHistory: (task: TasksPageTask) => void;
  onOpenDelete: (task: TasksPageTask) => void;
  onSaveTitle: (taskId: string, title: string) => Promise<{ error?: string }>;
  onSavePriority: (
    taskId: string,
    priority: "low" | "medium" | "high",
  ) => Promise<{ error?: string }>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
  onAfterToggleComplete?: () => void | Promise<void>;
  onAfterUndo?: () => void | Promise<void>;
  onLongPressCompleteLog?: (task: TasksPageTask) => void;
  isDragOverlay?: boolean;
  dndReady: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: makeSortableId(bucketId, task.id),
    disabled: collapsedDone || !dndReady,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isDragOverlay ? 0.4 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="min-w-0">
      <div className="group relative">
        {!collapsedDone ? (
          <button
            type="button"
            className="absolute top-1 left-1 z-[1] h-5 w-5 cursor-grab opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 active:cursor-grabbing rounded text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            aria-label="Drag to reorder or reschedule"
            title="Drag to reorder or reschedule"
            {...(dndReady ? attributes : {})}
            {...(dndReady ? listeners : {})}
          >
            <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
              <circle cx="9" cy="6" r="1.4" fill="currentColor" />
              <circle cx="15" cy="6" r="1.4" fill="currentColor" />
              <circle cx="9" cy="12" r="1.4" fill="currentColor" />
              <circle cx="15" cy="12" r="1.4" fill="currentColor" />
              <circle cx="9" cy="18" r="1.4" fill="currentColor" />
              <circle cx="15" cy="18" r="1.4" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        <TaskRow
          task={{
            id: task.id,
            title: task.title,
            due_date: task.due_date,
            status: task.status,
            priority: task.priority,
            completed_at: task.completed_at,
          }}
          crumb={crumb}
          effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
          starting={starting}
          onStartWork={(t) => onStartWork({ ...task, ...t })}
          onOpenHistory={(t) => onOpenHistory({ ...task, ...t })}
          onOpenDelete={(t) => onOpenDelete({ ...task, ...t })}
          onSaveTitle={onSaveTitle}
          onSavePriority={onSavePriority}
          onSaveDueDate={onSaveDueDate}
          onAfterToggleComplete={onAfterToggleComplete}
          onAfterUndo={onAfterUndo}
          onLongPressCompleteLog={
            onLongPressCompleteLog
              ? (_t: IntegrationTaskRow) => {
                  if (task.status === "done") return;
                  onLongPressCompleteLog(task);
                }
              : undefined
          }
        />
      </div>
    </li>
  );
}

export function TaskGroupedList({
  buckets,
  crumbForTask,
  effectiveGlobalActiveTaskId,
  startWorkTaskId,
  expandedWorkTaskId,
  activeWorkSession,
  onActiveWorkSessionChange,
  onCloseWorkRow,
  onStartWork,
  onOpenHistory,
  onOpenDelete,
  onSaveTitle,
  onSavePriority,
  onSaveDueDate,
  onAfterToggleComplete,
  onAfterUndo,
  onLongPressCompleteLog,
  onReorderWithinBucket,
  onMoveAcrossBucket,
}: {
  buckets: TaskBucket[];
  crumbForTask: (task: TasksPageTask) => TaskRowCrumb;
  effectiveGlobalActiveTaskId: string | null;
  startWorkTaskId: string | null;
  /** Task whose `TaskWorkRow` (timer + controls) is expanded inline, mirroring the integration page. */
  expandedWorkTaskId: string | null;
  /** Active work session DTO (or null). Required when `expandedWorkTaskId` is set. */
  activeWorkSession: ActiveWorkSessionDTO | null;
  onActiveWorkSessionChange: (session: ActiveWorkSessionDTO) => void;
  onCloseWorkRow: () => void | Promise<void>;
  onStartWork: (task: TasksPageTask) => void | Promise<void>;
  onOpenHistory: (task: TasksPageTask) => void;
  onOpenDelete: (task: TasksPageTask) => void;
  onSaveTitle: (taskId: string, title: string) => Promise<{ error?: string }>;
  onSavePriority: (
    taskId: string,
    priority: "low" | "medium" | "high",
  ) => Promise<{ error?: string }>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
  onAfterToggleComplete?: () => void | Promise<void>;
  onAfterUndo?: () => void | Promise<void>;
  onLongPressCompleteLog?: (task: TasksPageTask) => void;
  onReorderWithinBucket: (bucketId: TaskBucketId, orderedTaskIds: string[]) => void | Promise<void>;
  onMoveAcrossBucket: (
    taskId: string,
    fromBucketId: TaskBucketId,
    toBucket: TaskBucket,
  ) => void | Promise<void>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [dndReady, setDndReady] = useState(false);

  useEffect(() => {
    setDndReady(true);
  }, []);

  const allTasksFlat = useMemo(() => {
    const m = new Map<string, { task: TasksPageTask; bucket: TaskBucket }>();
    for (const b of buckets) for (const t of b.tasks) m.set(t.id, { task: t, bucket: b });
    return m;
  }, [buckets]);

  const activeDragTask = activeDragTaskId ? allTasksFlat.get(activeDragTaskId)?.task ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    const parsed = parseSortableId(String(event.active.id));
    if (!parsed) return;
    setActiveDragTaskId(parsed.taskId);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragTaskId(null);
    const { active, over } = event;
    if (!over) return;
    const a = parseSortableId(String(active.id));
    const o = parseSortableId(String(over.id));
    if (!a || !o) return;
    if (a.taskId === o.taskId) return;

    if (a.bucketId === o.bucketId) {
      const bucket = buckets.find((b) => b.id === a.bucketId);
      if (!bucket) return;
      const ids = bucket.tasks.map((t) => t.id);
      const fromIx = ids.indexOf(a.taskId);
      const toIx = ids.indexOf(o.taskId);
      if (fromIx < 0 || toIx < 0 || fromIx === toIx) return;
      const next = ids.slice();
      next.splice(fromIx, 1);
      next.splice(toIx, 0, a.taskId);
      void onReorderWithinBucket(a.bucketId, next);
      return;
    }

    const toBucket = buckets.find((b) => b.id === o.bucketId);
    if (!toBucket) return;
    if (toBucket.id === "completed") return;
    void onMoveAcrossBucket(a.taskId, a.bucketId, toBucket);
  }

  const renderBucket = (bucket: TaskBucket, idx: number) => {
    if (bucket.tasks.length === 0) return null;
    const isCompletedBucket = bucket.id === "completed";
    const collapsed = isCompletedBucket && completedCollapsed;
    const sortableIds = bucket.tasks.map((t) => makeSortableId(bucket.id, t.id));

    return (
      <li key={bucket.id} className="list-none">
        <div className={`flex items-center justify-between gap-3 ${idx > 0 ? "pt-3" : ""}`}>
          <h4
            className="flex flex-wrap items-baseline gap-x-2 text-xs font-normal"
            style={{ color: "var(--app-text-muted)" }}
          >
            <span>{bucket.title}</span>
            <span className="font-medium tabular-nums text-muted-canvas">({bucket.tasks.length})</span>
          </h4>
          {isCompletedBucket ? (
            <button
              type="button"
              className="btn-cta-tertiary text-xs"
              onClick={() => setCompletedCollapsed((v) => !v)}
            >
              {collapsed ? "Show" : "Hide"}
            </button>
          ) : null}
        </div>
        {!collapsed ? (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul className="mt-2 flex list-none flex-col gap-2.5">
              {bucket.id === "next_week" && bucket.dateSubgroups && bucket.dateSubgroups.length > 0
                ? bucket.dateSubgroups.map((g) => (
                    <Fragment key={g.dateIso}>
                      <li
                        className="list-none pt-2 first:pt-0 text-xs font-normal"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {g.title}
                      </li>
                      {g.tasks.map((task) => {
                        const isExpandedWorkRow =
                          expandedWorkTaskId === task.id && activeWorkSession?.task_id === task.id;
                        if (isExpandedWorkRow) {
                          const crumb = crumbForTask(task);
                          return (
                            <li key={task.id} className="min-w-0">
                              <TaskWorkRow
                                taskId={task.id}
                                taskTitle={task.title}
                                taskCrumb={crumb}
                                taskDueDateIso={task.due_date}
                                finishSessionIntegrationLabel={crumb.integrationLabel}
                                finishSessionProjectLabel={crumb.projectName}
                                activeSession={activeWorkSession}
                                onActiveSessionChange={onActiveWorkSessionChange}
                                onClose={onCloseWorkRow}
                              />
                            </li>
                          );
                        }
                        return (
                          <SortableTaskRow
                            key={task.id}
                            task={task}
                            bucketId={bucket.id}
                            crumb={crumbForTask(task)}
                            effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
                            starting={startWorkTaskId === task.id}
                            collapsedDone={isCompletedBucket}
                            onStartWork={onStartWork}
                            onOpenHistory={onOpenHistory}
                            onOpenDelete={onOpenDelete}
                            onSaveTitle={onSaveTitle}
                            onSavePriority={onSavePriority}
                            onSaveDueDate={onSaveDueDate}
                            onAfterToggleComplete={onAfterToggleComplete}
                            onAfterUndo={onAfterUndo}
                            onLongPressCompleteLog={onLongPressCompleteLog}
                            dndReady={dndReady}
                          />
                        );
                      })}
                    </Fragment>
                  ))
                : bucket.tasks.map((task) => {
                    const isExpandedWorkRow =
                      expandedWorkTaskId === task.id && activeWorkSession?.task_id === task.id;
                    if (isExpandedWorkRow) {
                      const crumb = crumbForTask(task);
                      return (
                        <li key={task.id} className="min-w-0">
                          <TaskWorkRow
                            taskId={task.id}
                            taskTitle={task.title}
                            taskCrumb={crumb}
                            taskDueDateIso={task.due_date}
                            finishSessionIntegrationLabel={crumb.integrationLabel}
                            finishSessionProjectLabel={crumb.projectName}
                            activeSession={activeWorkSession}
                            onActiveSessionChange={onActiveWorkSessionChange}
                            onClose={onCloseWorkRow}
                          />
                        </li>
                      );
                    }
                    return (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        bucketId={bucket.id}
                        crumb={crumbForTask(task)}
                        effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
                        starting={startWorkTaskId === task.id}
                        collapsedDone={isCompletedBucket}
                        onStartWork={onStartWork}
                        onOpenHistory={onOpenHistory}
                        onOpenDelete={onOpenDelete}
                        onSaveTitle={onSaveTitle}
                        onSavePriority={onSavePriority}
                        onSaveDueDate={onSaveDueDate}
                        onAfterToggleComplete={onAfterToggleComplete}
                        onAfterUndo={onAfterUndo}
                        onLongPressCompleteLog={onLongPressCompleteLog}
                        dndReady={dndReady}
                      />
                    );
                  })}
            </ul>
          </SortableContext>
        ) : null}
      </li>
    );
  };

  const visibleBuckets = buckets.filter((b) => b.tasks.length > 0);
  if (visibleBuckets.length === 0) {
    return <p className="mt-3 text-sm text-muted-canvas">No tasks. Use the form above to add one.</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragTaskId(null)}
    >
      <ul className="flex list-none flex-col gap-2.5">
        {visibleBuckets.map((b, i) => renderBucket(b, i))}
      </ul>
      <DragOverlay>
        {activeDragTask ? (
          <div className="opacity-95 shadow-lg" style={{ borderRadius: "var(--app-radius)" }}>
            <TaskRow
              task={{
                id: activeDragTask.id,
                title: activeDragTask.title,
                due_date: activeDragTask.due_date,
                status: activeDragTask.status,
                priority: activeDragTask.priority,
                completed_at: activeDragTask.completed_at,
              }}
              crumb={crumbForTask(activeDragTask)}
              effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
              starting={false}
              onStartWork={() => undefined}
              onOpenHistory={() => undefined}
              onOpenDelete={() => undefined}
              onSaveTitle={async () => ({})}
              onSavePriority={async () => ({})}
              onSaveDueDate={async () => ({})}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
