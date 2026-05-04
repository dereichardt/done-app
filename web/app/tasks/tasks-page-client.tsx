"use client";

import {
  computeTaskBuckets,
  TaskGroupedList,
  type TaskBucket,
  type TaskBucketId,
} from "./task-grouped-list";
import { TasksFilters, type TasksFiltersValue } from "./tasks-filters";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { TaskOnlyManualLogDialog } from "@/components/task-only-manual-log-dialog";
import {
  TaskQuickAdd,
  type TaskQuickAddProjectOption,
  type TaskQuickAddIntegrationOption,
} from "@/components/task-quick-add";
import type { TaskRowCrumb } from "@/components/task-row";
import {
  startOrReplaceActiveWorkSession,
  type ActiveWorkSessionDTO,
  type ActiveWorkSessionIndicatorDTO,
} from "@/lib/actions/integration-tasks";
import { startOrReplaceInternalActiveWorkSession } from "@/lib/actions/internal-tasks";
import {
  deleteAnyTask,
  loadTaskWorkSessionHistory,
  reorderTaskWithinGroup,
  rescheduleTaskByDrag,
  toggleAnyTaskCompletion,
  updateAnyTaskDueDate,
  updateAnyTaskPriority,
  updateAnyTaskTitle,
} from "@/lib/actions/tasks-page";
import {
  tasksPageTaskProjectId,
  tasksPageTaskTrackOrDestId,
  type TaskWorkSessionHistoryRow,
  type TasksPageSnapshot,
  type TasksPageTask,
} from "@/lib/tasks-page-shared";
import { formatDateDisplay } from "@/lib/integration-task-helpers";
import { formatRoundedHoursLabelFromRoundedMs } from "@/lib/work-session-duration";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatLocalYmd } from "@/lib/integration-effort-buckets";
import type { EffortView } from "@/lib/integration-effort-buckets";
import { TasksEffortCalendar } from "./tasks-effort-calendar";

const dialogBaseClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[200] max-h-[min(92dvh,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

const labelClass = "text-xs font-medium text-muted-canvas";
const valueClass = "mt-0.5 text-sm break-words font-medium";

function indicatorToActiveSessionDto(
  i: ActiveWorkSessionIndicatorDTO | null | undefined,
): ActiveWorkSessionDTO | null {
  if (!i) return null;
  return {
    scope: i.scope,
    task_id: i.task_id,
    started_at: i.started_at,
    paused_ms_accumulated: i.paused_ms_accumulated,
    pause_started_at: i.pause_started_at,
  };
}

function DialogHeader({
  titleId,
  title,
  subtitle,
  onClose,
}: {
  titleId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="min-w-0 flex-1 pr-2">
        <h2 id={titleId} className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-sm text-muted-canvas" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>
      <DialogCloseButton onClick={onClose} />
    </div>
  );
}

export function TasksPageClient({ initialSnapshot }: { initialSnapshot: TasksPageSnapshot }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [todayIso, setTodayIso] = useState(initialSnapshot.todayIso);
  const [calendarAnchorFallback, setCalendarAnchorFallback] = useState(initialSnapshot.todayIso);

  useEffect(() => {
    setCalendarAnchorFallback(formatLocalYmd(new Date()));
  }, []);

  // ── View state (list | calendar) driven by URL params ─────────────────────
  const rawView = searchParams.get("view");
  const calendarView: EffortView = (() => {
    const s = searchParams.get("scope");
    if (s === "day" || s === "week" || s === "month") return s;
    return "week";
  })();
  const calendarAnchor = searchParams.get("date") ?? calendarAnchorFallback;
  const isCalendar = rawView === "calendar";

  const setView = useCallback(
    (next: "list" | "calendar") => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "list") {
        params.delete("view");
        params.delete("scope");
        params.delete("date");
      } else {
        params.set("view", "calendar");
        if (!params.has("scope")) params.set("scope", "week");
        if (!params.has("date")) params.set("date", calendarAnchorFallback);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [calendarAnchorFallback, router, searchParams],
  );

  const setCalendarScope = useCallback(
    (scope: EffortView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("scope", scope);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setCalendarAnchor = useCallback(
    (ymd: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", ymd);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const [openTasks, setOpenTasks] = useState<TasksPageTask[]>(initialSnapshot.tasks);
  const [recentlyCompleted, setRecentlyCompleted] = useState<TasksPageTask[]>(
    initialSnapshot.recentlyCompleted,
  );

  useEffect(() => {
    setOpenTasks(initialSnapshot.tasks);
  }, [initialSnapshot.tasks]);

  useEffect(() => {
    setRecentlyCompleted(initialSnapshot.recentlyCompleted);
  }, [initialSnapshot.recentlyCompleted]);

  const projects = initialSnapshot.projects;
  const tracks = initialSnapshot.tracks;
  const internalDestinations = initialSnapshot.internalDestinations;

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );
  const trackById = useMemo(
    () => new Map(tracks.map((i) => [i.id, i] as const)),
    [tracks],
  );

  const [filters, setFilters] = useState<TasksFiltersValue>({
    search: "",
    projectId: "",
    projectTrackId: "",
    priority: "",
  });
  const [lastUsedIntegrationId, setLastUsedIntegrationId] = useState<string | null>(null);

  const filterTask = useCallback(
    (t: TasksPageTask): boolean => {
      if (filters.projectId && tasksPageTaskProjectId(t) !== filters.projectId) return false;
      if (filters.projectTrackId && tasksPageTaskTrackOrDestId(t) !== filters.projectTrackId)
        return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      const q = filters.search.trim().toLowerCase();
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    },
    [filters],
  );

  const filteredOpenTasks = useMemo(() => openTasks.filter(filterTask), [openTasks, filterTask]);
  const filteredCompletedTasks = useMemo(
    () => recentlyCompleted.filter(filterTask),
    [recentlyCompleted, filterTask],
  );

  const buckets: TaskBucket[] = useMemo(
    () =>
      computeTaskBuckets({
        openTasks: filteredOpenTasks,
        recentlyCompleted: filteredCompletedTasks,
        todayIso,
      }),
    [filteredOpenTasks, filteredCompletedTasks, todayIso],
  );

  const crumbForTask = useCallback(
    (task: TasksPageTask): TaskRowCrumb => {
      if (task.scope === "internal") {
        return {
          projectName: "Internal",
          integrationLabel: task.internal_context_label,
          href: task.internal_detail_href,
          projectColorVar: null,
          projectColorTintPct: 10,
        };
      }
      const project = projectById.get(task.project_id);
      const track = trackById.get(task.project_track_id);
      const colorKey = project?.colorKey ?? null;
      let tintPct = 7;
      if (colorKey?.endsWith("_medium")) tintPct = 11;
      else if (colorKey?.endsWith("_light")) tintPct = 15;
      return {
        projectName: project?.name ?? "Project",
        integrationLabel: track?.label ?? "Track",
        href:
          task.project_integration_id != null
            ? `/projects/${task.project_id}/integrations/${task.project_integration_id}`
            : `/projects/${task.project_id}`,
        projectColorVar: project?.colorVar ?? null,
        projectColorTintPct: tintPct,
      };
    },
    [projectById, trackById],
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const updateTaskInState = useCallback((taskId: string, patch: Partial<TasksPageTask>) => {
    setOpenTasks((prev) =>
      prev.map((t) => (t.id === taskId ? ({ ...t, ...patch } as TasksPageTask) : t)),
    );
    setRecentlyCompleted((prev) =>
      prev.map((t) => (t.id === taskId ? ({ ...t, ...patch } as TasksPageTask) : t)),
    );
  }, []);

  const removeTaskFromState = useCallback((taskId: string) => {
    setOpenTasks((prev) => prev.filter((t) => t.id !== taskId));
    setRecentlyCompleted((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const saveTaskTitle = useCallback(
    async (taskId: string, nextTitle: string): Promise<{ error?: string }> => {
      const existing = openTasks.find((t) => t.id === taskId) ?? recentlyCompleted.find((t) => t.id === taskId);
      const prevTitle = existing?.title ?? "";
      if (nextTitle === prevTitle) return {};
      updateTaskInState(taskId, { title: nextTitle });
      try {
        const res = await updateAnyTaskTitle(taskId, nextTitle);
        if (res?.error) {
          updateTaskInState(taskId, { title: prevTitle });
          return { error: res.error };
        }
        return {};
      } finally {
        refresh();
      }
    },
    [openTasks, recentlyCompleted, updateTaskInState, refresh],
  );

  const saveTaskPriority = useCallback(
    async (
      taskId: string,
      nextPriority: "low" | "medium" | "high",
    ): Promise<{ error?: string }> => {
      const existing = openTasks.find((t) => t.id === taskId);
      if (!existing) return {};
      const prev = existing.priority;
      if (prev === nextPriority) return {};
      updateTaskInState(taskId, { priority: nextPriority });
      try {
        const res = await updateAnyTaskPriority(taskId, nextPriority);
        if (res?.error) {
          updateTaskInState(taskId, { priority: prev });
          return { error: res.error };
        }
        return {};
      } finally {
        refresh();
      }
    },
    [openTasks, updateTaskInState, refresh],
  );

  const saveTaskDueDate = useCallback(
    async (taskId: string, dueDateIso: string): Promise<{ error?: string }> => {
      const existing = openTasks.find((t) => t.id === taskId);
      if (!existing) return {};
      const prev = existing.due_date;
      const next = dueDateIso || null;
      updateTaskInState(taskId, { due_date: next });
      const fd = new FormData();
      fd.set("due_date", dueDateIso);
      try {
        const res = await updateAnyTaskDueDate(taskId, fd);
        if (res?.error) {
          updateTaskInState(taskId, { due_date: prev });
          return { error: res.error };
        }
        return {};
      } finally {
        refresh();
      }
    },
    [openTasks, updateTaskInState, refresh],
  );

  const [workSessionActionError, setWorkSessionActionError] = useState<string | null>(null);
  const [startWorkTaskId, setStartWorkTaskId] = useState<string | null>(null);

  const [activeWorkSession, setActiveWorkSession] = useState<ActiveWorkSessionDTO | null>(() =>
    indicatorToActiveSessionDto(initialSnapshot.activeWorkSessionIndicator),
  );

  const activeWorkIndicatorSyncKey = useMemo(() => {
    const i = initialSnapshot.activeWorkSessionIndicator;
    if (!i) return "";
    return `${i.scope}|${i.task_id}|${i.started_at}|${i.paused_ms_accumulated}|${i.pause_started_at ?? ""}`;
  }, [
    initialSnapshot.activeWorkSessionIndicator?.scope,
    initialSnapshot.activeWorkSessionIndicator?.task_id,
    initialSnapshot.activeWorkSessionIndicator?.started_at,
    initialSnapshot.activeWorkSessionIndicator?.paused_ms_accumulated,
    initialSnapshot.activeWorkSessionIndicator?.pause_started_at,
  ]);

  // Sync client session from server indicator only when indicator *fields* change (not object identity).
  useEffect(() => {
    setActiveWorkSession(indicatorToActiveSessionDto(initialSnapshot.activeWorkSessionIndicator));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initialSnapshot` read when `activeWorkIndicatorSyncKey` changes
  }, [activeWorkIndicatorSyncKey]);

  const effectiveGlobalActiveTaskId =
    activeWorkSession?.task_id ?? initialSnapshot.activeWorkSessionIndicator?.task_id ?? null;

  const [expandedWorkTaskId, setExpandedWorkTaskId] = useState<string | null>(null);

  const workSessionTaskId = activeWorkSession?.task_id ?? null;
  const openTaskStatusForWorkSession = useMemo(() => {
    if (!workSessionTaskId) return "";
    const t = openTasks.find((x) => x.id === workSessionTaskId);
    if (!t) return "__missing__";
    return t.status;
  }, [workSessionTaskId, openTasks]);

  useEffect(() => {
    if (!workSessionTaskId) {
      setExpandedWorkTaskId((prev) => (prev == null ? prev : null));
      return;
    }
    if (openTaskStatusForWorkSession === "__missing__" || openTaskStatusForWorkSession === "done") {
      setExpandedWorkTaskId((prev) => (prev == null ? prev : null));
      return;
    }
    setExpandedWorkTaskId((prev) => (prev === workSessionTaskId ? prev : workSessionTaskId));
  }, [workSessionTaskId, openTaskStatusForWorkSession]);

  const closeWorkRow = useCallback(async () => {
    setActiveWorkSession(null);
    setExpandedWorkTaskId(null);
    refresh();
  }, [refresh]);

  const startWorkOnTask = useCallback(
    async (task: TasksPageTask) => {
      if (effectiveGlobalActiveTaskId != null && effectiveGlobalActiveTaskId !== task.id) {
        return;
      }
      setWorkSessionActionError(null);
      setStartWorkTaskId(task.id);
      try {
        const res =
          task.scope === "internal"
            ? await startOrReplaceInternalActiveWorkSession(task.id)
            : await startOrReplaceActiveWorkSession(task.id);
        if (res.error) {
          setWorkSessionActionError(res.error);
          return;
        }
        if (res.session) {
          setActiveWorkSession(res.session);
          setExpandedWorkTaskId(task.id);
        }
        refresh();
      } finally {
        setStartWorkTaskId(null);
      }
    },
    [effectiveGlobalActiveTaskId, refresh],
  );

  const addTaskDialogRef = useRef<HTMLDialogElement>(null);
  function openAddTaskDialog() {
    requestAnimationFrame(() => addTaskDialogRef.current?.showModal());
  }

  const [deleteTask, setDeleteTask] = useState<TasksPageTask | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string } | void, formData: FormData) => {
      const id = String(formData.get("task_id") ?? "").trim();
      if (!id) return { error: "No task selected" };
      const res = await deleteAnyTask(id);
      if (!res.error) {
        removeTaskFromState(id);
      }
      return res;
    },
    {},
  );

  const deleteSubmitDidRunRef = useRef(false);
  useEffect(() => {
    if (!deleteSubmitDidRunRef.current) return;
    if (deletePending) return;
    if (deleteState?.error) return;
    deleteDialogRef.current?.close();
    deleteSubmitDidRunRef.current = false;
    refresh();
  }, [deletePending, deleteState, refresh]);

  function openDeleteDialog(task: TasksPageTask) {
    setDeleteTask(task);
    requestAnimationFrame(() => deleteDialogRef.current?.showModal());
  }

  const [manualLogTask, setManualLogTask] = useState<TasksPageTask | null>(null);

  const [historyTask, setHistoryTask] = useState<TasksPageTask | null>(null);
  const [historySessions, setHistorySessions] = useState<TaskWorkSessionHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);

  function openHistoryDialog(task: TasksPageTask) {
    setHistoryTask(task);
    setHistorySessions([]);
    setHistoryError(null);
    setHistoryLoading(true);
    requestAnimationFrame(() => historyDialogRef.current?.showModal());
    void (async () => {
      const res = await loadTaskWorkSessionHistory(task.id);
      setHistoryLoading(false);
      if (res.error) {
        setHistoryError(res.error);
        return;
      }
      setHistorySessions(res.sessions ?? []);
    })();
  }

  const reorderWithinBucket = useCallback(
    async (bucketId: TaskBucketId, orderedTaskIds: string[]) => {
      const targetBucket = buckets.find((b) => b.id === bucketId);
      if (!targetBucket) return;
      const lookup = new Map(targetBucket.tasks.map((t) => [t.id, t] as const));
      const reordered: TasksPageTask[] = orderedTaskIds
        .map((id) => lookup.get(id))
        .filter((v): v is TasksPageTask => Boolean(v))
        .map((t, globalIndex) => ({
          ...t,
          sort_order: globalIndex,
        }));

      setOpenTasks((prev) => {
        const inOrder = new Map(reordered.map((t) => [t.id, t] as const));
        return prev.map((t) => (inOrder.has(t.id) ? inOrder.get(t.id)! : t));
      });

      const res = await reorderTaskWithinGroup(orderedTaskIds);

      if (res.error) {
        setWorkSessionActionError(res.error);
      }
      refresh();
    },
    [buckets, refresh],
  );

  const moveAcrossBucket = useCallback(
    async (taskId: string, _from: TaskBucketId, toBucket: TaskBucket) => {
      const existing = openTasks.find((t) => t.id === taskId);
      if (!existing) return;
      const prevDue = existing.due_date;
      const nextDue = toBucket.defaultDueDateIso;
      updateTaskInState(taskId, { due_date: nextDue });

      const res = await rescheduleTaskByDrag(taskId, nextDue ?? "");
      if (res.error) {
        updateTaskInState(taskId, { due_date: prevDue });
        setWorkSessionActionError(res.error);
      }
      refresh();
    },
    [openTasks, updateTaskInState, refresh],
  );

  const quickAddProjects: TaskQuickAddProjectOption[] = useMemo(
    () => projects.map((p) => ({ id: p.id, label: p.name })),
    [projects],
  );

  /** Tracks already include internal filter rows (same ids as `internalDestinations`); do not merge twice or CanvasSelect keys collide. */
  const quickAddIntegrations: TaskQuickAddIntegrationOption[] = useMemo(
    () =>
      tracks.map((i) => ({
        id: i.id,
        projectId: i.projectId,
        label: i.label,
      })),
    [tracks],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-4 flex shrink-0 justify-center">
        <div
          role="tablist"
          aria-label="Work view"
          className="relative inline-flex shrink-0 overflow-visible rounded-full border p-1"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 top-1 bottom-1 z-[1] w-[calc(50%-0.25rem)] rounded-full transition-transform duration-200 ease-[cubic-bezier(0.2,0,0.2,1)]"
            style={{
              transform: isCalendar ? "translateX(100%)" : "translateX(0)",
              background: "#1f2937",
              boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
            }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={!isCalendar}
            className={[
              "relative z-[2] inline-flex h-10 min-w-[5.75rem] flex-1 items-center justify-center rounded-full px-4 text-center text-sm transition-colors cursor-pointer",
              !isCalendar
                ? "font-semibold text-[#f3f5f8]"
                : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
            ].join(" ")}
            onClick={() => setView("list")}
          >
            Tasks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isCalendar}
            className={[
              "relative z-[2] inline-flex h-10 min-w-[5.75rem] flex-1 items-center justify-center rounded-full px-4 text-center text-sm transition-colors cursor-pointer",
              isCalendar
                ? "font-semibold text-[#f3f5f8]"
                : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
            ].join(" ")}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col">
        <div
          className={[
            "card-canvas flex min-h-0 flex-1 flex-col p-3",
            isCalendar ? "" : "max-h-[calc(100dvh-10rem)]",
          ].join(" ")}
        >
          <TasksFilters
            value={filters}
            onChange={setFilters}
            projects={projects}
            tracks={tracks}
            trailingSlot={
              !isCalendar ? (
                <button
                  type="button"
                  className="btn-cta shrink-0 whitespace-nowrap text-xs"
                  style={{ padding: "0.4rem 0.85rem" }}
                  onClick={openAddTaskDialog}
                >
                  Add Task
                </button>
              ) : null
            }
          />

          {workSessionActionError && !isCalendar ? (
            <p
              className="mb-2 shrink-0 text-xs"
              style={{ color: "var(--app-danger)" }}
              role="alert"
            >
              {workSessionActionError}
            </p>
          ) : null}

          {!isCalendar ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-0">
              <TaskGroupedList
                buckets={buckets}
                crumbForTask={crumbForTask}
                effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
                startWorkTaskId={startWorkTaskId}
                expandedWorkTaskId={expandedWorkTaskId}
                activeWorkSession={activeWorkSession}
                onActiveWorkSessionChange={setActiveWorkSession}
                onCloseWorkRow={closeWorkRow}
                onStartWork={startWorkOnTask}
                onOpenHistory={openHistoryDialog}
                onOpenDelete={openDeleteDialog}
                onSaveTitle={saveTaskTitle}
                onSavePriority={saveTaskPriority}
                onSaveDueDate={saveTaskDueDate}
                onAfterToggleComplete={refresh}
                onAfterUndo={refresh}
                onLongPressCompleteLog={(task) => setManualLogTask(task)}
                onReorderWithinBucket={reorderWithinBucket}
                onMoveAcrossBucket={moveAcrossBucket}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <TasksEffortCalendar
                scope={calendarView}
                anchorYmd={calendarAnchor}
                onScopeChange={setCalendarScope}
                onAnchorChange={setCalendarAnchor}
                filters={filters}
                projects={projects}
                tracks={tracks}
                lastUsedIntegrationId={lastUsedIntegrationId}
                onRememberIntegration={setLastUsedIntegrationId}
              />
            </div>
          )}
        </div>
      </section>

      <dialog
        ref={addTaskDialogRef}
        aria-labelledby="tasks-page-add-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,44rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex max-h-[min(92dvh,48rem)] flex-col overflow-hidden">
          <DialogHeader
            titleId="tasks-page-add-title"
            title="Add Task"
            subtitle="Pick a project and track (or Internal and a destination), then describe the task."
            onClose={() => addTaskDialogRef.current?.close()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TaskQuickAdd
              mode="global"
              layout="dialog"
              todayIso={todayIso}
              projects={quickAddProjects}
              integrations={quickAddIntegrations}
              internalDestinations={internalDestinations}
              initialProjectId={filters.projectId || null}
              initialProjectTrackId={filters.projectTrackId || null}
              onCancel={() => addTaskDialogRef.current?.close()}
              onCreated={() => {
                addTaskDialogRef.current?.close();
                refresh();
              }}
            />
          </div>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        aria-labelledby="tasks-page-delete-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,36rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => setDeleteTask(null)}
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <h2
              id="tasks-page-delete-title"
              className="text-base font-semibold"
              style={{ color: "var(--app-text)" }}
            >
              Delete this task?
            </h2>
            {deleteTask ? (
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <p className={labelClass}>Task</p>
                  <p className={valueClass} style={{ color: "var(--app-text)" }}>
                    {deleteTask.title}
                  </p>
                </div>
                <div>
                  <p className={labelClass}>Project · Track</p>
                  <p className={valueClass} style={{ color: "var(--app-text)" }}>
                    {projectById.get(tasksPageTaskProjectId(deleteTask))?.name ?? "Project"}
                    <span className="mx-1.5 font-normal text-muted-canvas">·</span>
                    {trackById.get(tasksPageTaskTrackOrDestId(deleteTask))?.label ?? "Track"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <hr
            className="m-0 border-0 border-t"
            style={{ borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)" }}
          />
          {deleteTask ? (
            <div className="text-sm text-muted-canvas">
              <p>This permanently removes the task and its work session history.</p>
              <p className="mt-2">
                Due date:{" "}
                <span className="font-medium" style={{ color: "var(--app-text)" }}>
                  {formatDateDisplay(deleteTask.due_date)}
                </span>
              </p>
            </div>
          ) : null}

          {deleteState?.error ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {deleteState.error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={deletePending}
              onClick={() => deleteDialogRef.current?.close()}
            >
              Cancel
            </button>
            <form
              action={deleteAction}
              onSubmit={() => {
                deleteSubmitDidRunRef.current = true;
              }}
            >
              <input type="hidden" name="task_id" value={deleteTask?.id ?? ""} />
              <button
                type="submit"
                className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--app-danger)", color: "var(--app-surface)" }}
                disabled={deletePending || !deleteTask}
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          </div>
        </div>
      </dialog>

      <dialog
        ref={historyDialogRef}
        aria-labelledby="tasks-page-history-title"
        className={`${dialogBaseClass} max-h-[min(98dvh,72rem)] w-[min(100vw-2rem,56rem)] max-w-[calc(100vw-2rem)] p-0 overflow-hidden`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setHistoryTask(null);
          setHistorySessions([]);
          setHistoryError(null);
        }}
      >
        <div className="flex max-h-[min(98dvh,72rem)] flex-col overflow-hidden">
          <DialogHeader
            titleId="tasks-page-history-title"
            title="Work history"
            subtitle={
              historyTask
                ? historyTask.scope === "internal"
                  ? `Internal · ${historyTask.internal_context_label}`
                  : `${projectById.get(historyTask.project_id)?.name ?? "Project"} · ${trackById.get(historyTask.project_track_id)?.label ?? "Track"}`
                : undefined
            }
            onClose={() => historyDialogRef.current?.close()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {historyTask ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className={labelClass}>Task</p>
                  <p className={valueClass} style={{ color: "var(--app-text)" }}>
                    {historyTask.title}
                  </p>
                </div>
                <div>
                  <p className={labelClass}>Total time</p>
                  <p className={valueClass} style={{ color: "var(--app-text)" }}>
                    {formatRoundedHoursLabelFromRoundedMs(
                      historySessions.reduce(
                        (acc, row) => acc + row.duration_hours * 3_600_000,
                        0,
                      ),
                    )}
                  </p>
                </div>
                {historyError ? (
                  <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                    {historyError}
                  </p>
                ) : historyLoading ? (
                  <p className="text-sm text-muted-canvas">Loading…</p>
                ) : !historySessions.length ? (
                  <p className="text-sm text-muted-canvas">No work sessions yet.</p>
                ) : (
                  <div
                    className="overflow-x-auto rounded-[var(--app-radius)] border"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <table className="w-full min-w-[32rem] border-collapse text-sm">
                      <thead
                        className="sticky top-0 z-[1] border-b text-left text-xs font-medium text-muted-canvas"
                        style={{
                          borderColor: "var(--app-border)",
                          background: "var(--app-surface-alt)",
                        }}
                      >
                        <tr>
                          <th className="px-3 py-2.5">Day</th>
                          <th className="px-3 py-2.5">Start</th>
                          <th className="px-3 py-2.5">Finished</th>
                          <th className="px-3 py-2.5">Duration</th>
                          <th className="min-w-[12rem] px-3 py-2.5">Work accomplished</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historySessions.map((row) => {
                          const started = new Date(row.started_at);
                          const day = started.toLocaleDateString(undefined, {
                            dateStyle: "medium",
                          });
                          const startTime = started.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                          const finished = row.finished_at ? new Date(row.finished_at) : null;
                          const finishedTime =
                            finished && !Number.isNaN(finished.getTime())
                              ? finished.toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—";
                          const durLabel = formatRoundedHoursLabelFromRoundedMs(
                            row.duration_hours * 3_600_000,
                          );
                          return (
                            <tr
                              key={row.id}
                              className="border-b last:border-b-0"
                              style={{ borderColor: "var(--app-border)" }}
                            >
                              <td
                                className="px-3 py-2.5 align-top tabular-nums"
                                style={{ color: "var(--app-text)" }}
                              >
                                {day}
                              </td>
                              <td
                                className="px-3 py-2.5 align-top tabular-nums"
                                style={{ color: "var(--app-text)" }}
                              >
                                {startTime}
                              </td>
                              <td
                                className="px-3 py-2.5 align-top tabular-nums"
                                style={{ color: "var(--app-text)" }}
                              >
                                {finishedTime}
                              </td>
                              <td
                                className="px-3 py-2.5 align-top tabular-nums"
                                style={{ color: "var(--app-text)" }}
                              >
                                {durLabel}
                              </td>
                              <td className="max-w-[min(18rem,40vw)] px-3 py-2.5 align-top break-words text-muted-canvas">
                                {row.work_accomplished?.trim() ? (
                                  row.work_accomplished
                                ) : (
                                  <span style={{ color: "var(--app-text-muted)" }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {historyTask ? (
                  <p className="text-xs text-muted-canvas">
                    To edit work accomplished, open this task on{" "}
                    <a
                      href={
                        historyTask.scope === "internal"
                          ? historyTask.internal_detail_href
                          : historyTask.project_integration_id
                            ? `/projects/${historyTask.project_id}/integrations/${historyTask.project_integration_id}`
                            : `/projects/${historyTask.project_id}`
                      }
                      className="underline underline-offset-2 hover:text-[var(--app-text)]"
                    >
                      its track page
                    </a>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </dialog>

      <TaskOnlyManualLogDialog
        open={manualLogTask != null}
        taskId={manualLogTask?.id ?? ""}
        projectTrackId={
          manualLogTask?.scope === "project"
            ? manualLogTask.project_track_id
            : manualLogTask?.scope === "internal" && manualLogTask.internal_initiative_id
              ? manualLogTask.internal_initiative_id
              : ""
        }
        internalWorkSessionTaskId={
          manualLogTask?.scope === "internal" && manualLogTask.internal_track_id != null
            ? manualLogTask.id
            : null
        }
        subtitle={
          manualLogTask?.scope === "project"
            ? `${projectById.get(manualLogTask.project_id)?.name ?? "Project"} · ${trackById.get(manualLogTask.project_track_id)?.label ?? "Track"}`
            : manualLogTask?.scope === "internal"
              ? `Internal · ${manualLogTask.internal_context_label}`
              : ""
        }
        initialTitle={manualLogTask?.title ?? ""}
        onClose={() => setManualLogTask(null)}
        onCompleteTask={(taskId) => toggleAnyTaskCompletion(taskId)}
        onSaved={refresh}
      />
    </div>
  );
}
