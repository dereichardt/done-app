"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { HomeCardFab } from "@/components/home-card-fab";
import { TaskWorkRow } from "@/components/integration-tasks-panel";
import {
  HomeSkinnyTaskRow,
  IntegrationIdBadge,
  type HomeSkinnyTaskMeta,
} from "@/components/home-skinny-task-row";
import { HomeEditTaskDialog } from "@/components/home-edit-task-dialog";
import { TaskOnlyManualLogDialog } from "@/components/task-only-manual-log-dialog";
import {
  TaskQuickAdd,
  type TaskQuickAddIntegrationOption,
  type TaskQuickAddProjectOption,
} from "@/components/task-quick-add";
import type { TaskRowCrumb } from "@/components/task-row";
import {
  startOrReplaceActiveWorkSession,
  type ActiveWorkSessionDTO,
  type ActiveWorkSessionIndicatorDTO,
} from "@/lib/actions/integration-tasks";
import { startOrReplaceInternalActiveWorkSession } from "@/lib/actions/internal-tasks";
import {
  reorderTaskWithinGroup,
  rescheduleTaskByDrag,
  toggleAnyTaskCompletion,
  updateAnyTaskDueDate,
  updateAnyTaskPriority,
  updateAnyTaskTitle,
} from "@/lib/actions/tasks-page";
import { notifyActiveWorkSessionChanged } from "@/lib/active-work-session-events";
import {
  computeHomeTaskGroups,
  homeTaskBelongsOnCard,
  type HomeTaskDateGroup,
  type HomeTasksMode,
} from "@/lib/home-task-buckets";
import { deriveProjectAbbreviation } from "@/lib/project-abbreviation";
import { clearCalendarSessionCache } from "@/lib/tasks-calendar-session-cache";
import type { TaskSubtask, TasksPageSnapshot, TasksPageTask } from "@/lib/tasks-page-shared";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function makeSortableId(groupId: string, taskId: string) {
  return `${groupId}:${taskId}`;
}

function parseSortableId(id: string): { groupId: string; taskId: string } | null {
  const ix = id.indexOf(":");
  if (ix < 0) return null;
  const groupId = id.slice(0, ix);
  const taskId = id.slice(ix + 1);
  if (!groupId || !taskId) return null;
  return { groupId, taskId };
}

/** Due date applied when a task is dropped into this Home date group. */
function dueDateForHomeGroup(group: HomeTaskDateGroup, todayIso: string): string {
  if (group.id === "today") return todayIso;
  if (group.id.startsWith("past_due_")) return group.id.slice("past_due_".length);
  return group.id;
}

function GripHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}

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

function SortableHomeSkinnyTaskRow({
  task,
  groupId,
  meta,
  todayIso,
  effectiveGlobalActiveTaskId,
  starting,
  onStartWork,
  onSaveDueDate,
  onToggleCompleteSuccess,
  onLongPressCompleteLog,
  onOpenEdit,
  onSubtasksChange,
  dndReady,
  isDragOverlay = false,
}: {
  task: TasksPageTask;
  groupId: string;
  meta: HomeSkinnyTaskMeta;
  todayIso: string;
  effectiveGlobalActiveTaskId: string | null;
  starting: boolean;
  onStartWork: (task: TasksPageTask) => void | Promise<void>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
  onToggleCompleteSuccess?: (taskId: string) => void;
  onLongPressCompleteLog?: (task: TasksPageTask) => void;
  onOpenEdit?: (task: TasksPageTask) => void;
  onSubtasksChange?: (taskId: string, subtasks: TaskSubtask[]) => void;
  dndReady: boolean;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: makeSortableId(groupId, task.id),
    disabled: !dndReady || isDragOverlay,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isDragOverlay ? 0.4 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="min-w-0">
      <HomeSkinnyTaskRow
        task={task}
        meta={meta}
        todayIso={todayIso}
        effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
        starting={starting}
        onStartWork={onStartWork}
        onSaveDueDate={onSaveDueDate}
        onToggleCompleteSuccess={onToggleCompleteSuccess}
        onLongPressCompleteLog={onLongPressCompleteLog}
        onOpenEdit={onOpenEdit}
        onSubtasksChange={onSubtasksChange}
        dragHandle={
          <button
            type="button"
            className={[
              "absolute left-0.5 top-1/2 z-[1] flex h-5 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded text-[var(--app-text-muted)] transition-opacity hover:text-[var(--app-text)] active:cursor-grabbing",
              isDragOverlay
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
            ].join(" ")}
            aria-label="Drag to reorder or reschedule"
            title="Drag to reorder or reschedule"
            style={{ touchAction: "none" }}
            onClick={(e) => e.preventDefault()}
            {...(dndReady && !isDragOverlay ? attributes : {})}
            {...(dndReady && !isDragOverlay ? listeners : {})}
          >
            <GripHandleIcon />
          </button>
        }
      />
    </li>
  );
}

function internalAbbreviation(task: Extract<TasksPageTask, { scope: "internal" }>): string {
  if (task.internal_bucket_kind === "admin") return "ADM";
  if (task.internal_bucket_kind === "development") return "DEV";
  const fromLabel = deriveProjectAbbreviation(task.internal_context_label);
  return fromLabel || "INT";
}

const addTaskDialogClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[220] max-h-[min(92dvh,52rem)] w-[min(100vw-2rem,44rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

export function HomeOpenTasksCard({
  snapshot,
  onEffortChanged,
  headerTrailing = null,
}: {
  snapshot: TasksPageSnapshot | null;
  error?: string | null;
  /** Refresh Hours this week + Actuals vs Forecast after effort is logged. */
  onEffortChanged?: () => void;
  /** Optional control rendered after “View all” (e.g. show-calendar when calendar is collapsed). */
  headerTrailing?: ReactNode;
}) {
  const router = useRouter();
  const addTaskDialogRef = useRef<HTMLDialogElement | null>(null);
  const todayIso = snapshot?.todayIso ?? new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<HomeTasksMode>("today");
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [openTasks, setOpenTasks] = useState<TasksPageTask[]>(() =>
    (snapshot?.tasks ?? []).filter((t) => t.status !== "done"),
  );

  useEffect(() => {
    setOpenTasks((snapshot?.tasks ?? []).filter((t) => t.status !== "done"));
  }, [snapshot]);

  const projectById = useMemo(() => {
    const m = new Map((snapshot?.projects ?? []).map((p) => [p.id, p]));
    return m;
  }, [snapshot?.projects]);

  const trackById = useMemo(() => {
    const m = new Map((snapshot?.tracks ?? []).map((t) => [t.id, t]));
    return m;
  }, [snapshot?.tracks]);

  const integrationById = useMemo(() => {
    const m = new Map((snapshot?.integrations ?? []).map((i) => [i.id, i]));
    return m;
  }, [snapshot?.integrations]);

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

  const metaForTask = useCallback(
    (task: TasksPageTask): HomeSkinnyTaskMeta => {
      const crumb = crumbForTask(task);
      if (task.scope === "internal") {
        return {
          badgeLabel: internalAbbreviation(task),
          projectName: "Internal",
          detailName: task.internal_context_label,
          colorVar: null,
          href: crumb.href,
        };
      }
      const project = projectById.get(task.project_id);
      const integration =
        task.project_integration_id != null
          ? integrationById.get(task.project_integration_id)
          : undefined;
      const integrationCode = (integration?.integrationCode ?? "").trim();
      const fallbackAbbr =
        project?.abbreviation || deriveProjectAbbreviation(project?.name ?? "") || "PRJ";
      return {
        badgeLabel: integrationCode || fallbackAbbr,
        projectName: crumb.projectName,
        detailName: crumb.integrationLabel,
        colorVar: project?.colorVar ?? null,
        href: crumb.href,
      };
    },
    [crumbForTask, integrationById, projectById],
  );

  const groups = useMemo(
    () => computeHomeTaskGroups({ openTasks, todayIso, mode }),
    [openTasks, todayIso, mode],
  );

  const [workSessionActionError, setWorkSessionActionError] = useState<string | null>(null);
  const [activeWorkSession, setActiveWorkSession] = useState<ActiveWorkSessionDTO | null>(() =>
    indicatorToActiveSessionDto(snapshot?.activeWorkSessionIndicator),
  );
  const [expandedWorkTaskId, setExpandedWorkTaskId] = useState<string | null>(null);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [manualLogTask, setManualLogTask] = useState<TasksPageTask | null>(null);
  const [editTask, setEditTask] = useState<TasksPageTask | null>(null);

  const activeWorkIndicator = snapshot?.activeWorkSessionIndicator;
  const activeWorkIndicatorSyncKey = activeWorkIndicator
    ? `${activeWorkIndicator.scope}|${activeWorkIndicator.task_id}|${activeWorkIndicator.started_at}|${activeWorkIndicator.paused_ms_accumulated}|${activeWorkIndicator.pause_started_at ?? ""}`
    : "";

  useEffect(() => {
    setActiveWorkSession(indicatorToActiveSessionDto(snapshot?.activeWorkSessionIndicator));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when indicator fields change
  }, [activeWorkIndicatorSyncKey]);

  const effectiveGlobalActiveTaskId = activeWorkSession?.task_id ?? null;

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

  const activeTaskOutsideFilter = useMemo(() => {
    if (!workSessionTaskId || !expandedWorkTaskId || expandedWorkTaskId !== workSessionTaskId) {
      return null;
    }
    const inGroups = groups.some((g) => g.tasks.some((t) => t.id === workSessionTaskId));
    if (inGroups) return null;
    return openTasks.find((t) => t.id === workSessionTaskId) ?? null;
  }, [workSessionTaskId, expandedWorkTaskId, groups, openTasks]);

  const markTaskCompletedLocally = useCallback((taskId: string) => {
    setOpenTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const patchTaskSubtasks = useCallback((taskId: string, subtasks: TaskSubtask[]) => {
    setOpenTasks((prev) =>
      prev.map((t) => (t.id === taskId ? ({ ...t, subtasks } as TasksPageTask) : t)),
    );
    setEditTask((prev) =>
      prev?.id === taskId ? ({ ...prev, subtasks } as TasksPageTask) : prev,
    );
  }, []);

  const closeWorkRow = useCallback(
    (opts?: { completeTask?: boolean; refresh?: boolean }) => {
      const clearedTaskId = activeWorkSession?.task_id ?? expandedWorkTaskId;
      setActiveWorkSession(null);
      setExpandedWorkTaskId(null);
      notifyActiveWorkSessionChanged({ cleared: true });
      if (opts?.completeTask && clearedTaskId) {
        markTaskCompletedLocally(clearedTaskId);
      }
    },
    [activeWorkSession?.task_id, expandedWorkTaskId, markTaskCompletedLocally],
  );

  const startWorkOnTask = useCallback(
    (task: TasksPageTask) => {
      if (effectiveGlobalActiveTaskId != null && effectiveGlobalActiveTaskId !== task.id) {
        return;
      }
      setWorkSessionActionError(null);
      setStartingTaskId(task.id);
      const scope: ActiveWorkSessionDTO["scope"] = task.scope === "internal" ? "internal" : "integration";
      const optimistic: ActiveWorkSessionDTO = {
        scope,
        task_id: task.id,
        started_at: new Date().toISOString(),
        paused_ms_accumulated: 0,
        pause_started_at: null,
      };
      setActiveWorkSession(optimistic);
      setExpandedWorkTaskId(task.id);
      void (async () => {
        const res =
          scope === "internal"
            ? await startOrReplaceInternalActiveWorkSession(task.id)
            : await startOrReplaceActiveWorkSession(task.id);
        setStartingTaskId(null);
        if (res.error) {
          setActiveWorkSession(null);
          setExpandedWorkTaskId(null);
          setWorkSessionActionError(res.error);
          notifyActiveWorkSessionChanged({ cleared: true });
          return;
        }
        if (res.session) {
          setActiveWorkSession(res.session);
          setExpandedWorkTaskId(task.id);
          notifyActiveWorkSessionChanged();
        }
      })();
    },
    [effectiveGlobalActiveTaskId],
  );

  const saveTaskDueDate = useCallback(
    async (taskId: string, dueDateIso: string): Promise<{ error?: string }> => {
      const existing = openTasks.find((t) => t.id === taskId);
      if (!existing) return {};
      const prev = existing.due_date;
      const next = dueDateIso || null;
      setOpenTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? ({ ...t, due_date: next } as TasksPageTask) : t)),
      );
      setEditTask((prevEdit) =>
        prevEdit?.id === taskId ? ({ ...prevEdit, due_date: next } as TasksPageTask) : prevEdit,
      );
      const fd = new FormData();
      fd.set("due_date", dueDateIso);
      const res = await updateAnyTaskDueDate(taskId, fd, existing.scope);
      if (res?.error) {
        setOpenTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === taskId ? ({ ...t, due_date: prev } as TasksPageTask) : t)),
        );
        setEditTask((prevEdit) =>
          prevEdit?.id === taskId ? ({ ...prevEdit, due_date: prev } as TasksPageTask) : prevEdit,
        );
        return { error: res.error };
      }
      if (!homeTaskBelongsOnCard(next, todayIso)) {
        setOpenTasks((prevTasks) => prevTasks.filter((t) => t.id !== taskId));
        setEditTask((prevEdit) => (prevEdit?.id === taskId ? null : prevEdit));
      }
      return {};
    },
    [openTasks, todayIso],
  );

  const saveTaskTitle = useCallback(
    async (taskId: string, title: string): Promise<{ error?: string }> => {
      const existing = openTasks.find((t) => t.id === taskId) ?? editTask;
      if (!existing) return {};
      const prev = existing.title;
      const next = title.trim();
      if (!next || next === prev) return {};
      setOpenTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? ({ ...t, title: next } as TasksPageTask) : t)),
      );
      setEditTask((prevEdit) =>
        prevEdit?.id === taskId ? ({ ...prevEdit, title: next } as TasksPageTask) : prevEdit,
      );
      const res = await updateAnyTaskTitle(taskId, next, existing.scope);
      if (res?.error) {
        setOpenTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === taskId ? ({ ...t, title: prev } as TasksPageTask) : t)),
        );
        setEditTask((prevEdit) =>
          prevEdit?.id === taskId ? ({ ...prevEdit, title: prev } as TasksPageTask) : prevEdit,
        );
        return { error: res.error };
      }
      return {};
    },
    [openTasks, editTask],
  );

  const saveTaskPriority = useCallback(
    async (
      taskId: string,
      priority: "low" | "medium" | "high",
    ): Promise<{ error?: string }> => {
      const existing = openTasks.find((t) => t.id === taskId) ?? editTask;
      if (!existing) return {};
      const prev = existing.priority;
      setOpenTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? ({ ...t, priority } as TasksPageTask) : t)),
      );
      setEditTask((prevEdit) =>
        prevEdit?.id === taskId ? ({ ...prevEdit, priority } as TasksPageTask) : prevEdit,
      );
      const res = await updateAnyTaskPriority(taskId, priority, existing.scope);
      if (res?.error) {
        setOpenTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === taskId ? ({ ...t, priority: prev } as TasksPageTask) : t)),
        );
        setEditTask((prevEdit) =>
          prevEdit?.id === taskId ? ({ ...prevEdit, priority: prev } as TasksPageTask) : prevEdit,
        );
        return { error: res.error };
      }
      return {};
    },
    [openTasks, editTask],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndContextId = useId();
  const dndReady = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);

  const allTasksFlat = useMemo(() => {
    const m = new Map<string, { task: TasksPageTask; group: HomeTaskDateGroup }>();
    for (const g of groups) for (const t of g.tasks) m.set(t.id, { task: t, group: g });
    return m;
  }, [groups]);

  const activeDragTask = activeDragTaskId ? (allTasksFlat.get(activeDragTaskId)?.task ?? null) : null;

  const reorderWithinGroup = useCallback(
    async (groupId: string, orderedTaskIds: string[]) => {
      const targetGroup = groups.find((g) => g.id === groupId);
      if (!targetGroup) return;
      const lookup = new Map(targetGroup.tasks.map((t) => [t.id, t] as const));
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
        router.refresh();
      }
    },
    [groups, router],
  );

  const moveAcrossGroup = useCallback(
    async (taskId: string, toGroup: HomeTaskDateGroup) => {
      const existing = openTasks.find((t) => t.id === taskId);
      if (!existing) return;
      const prevDue = existing.due_date;
      const nextDue = dueDateForHomeGroup(toGroup, todayIso);
      setOpenTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId ? ({ ...t, due_date: nextDue } as TasksPageTask) : t,
        ),
      );
      const res = await rescheduleTaskByDrag(taskId, nextDue, existing.scope);
      if (res.error) {
        setOpenTasks((prevTasks) =>
          prevTasks.map((t) =>
            t.id === taskId ? ({ ...t, due_date: prevDue } as TasksPageTask) : t,
          ),
        );
        setWorkSessionActionError(res.error);
        return;
      }
      if (!homeTaskBelongsOnCard(nextDue, todayIso)) {
        setOpenTasks((prevTasks) => prevTasks.filter((t) => t.id !== taskId));
      }
    },
    [openTasks, todayIso],
  );

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

    if (a.groupId === o.groupId) {
      const group = groups.find((g) => g.id === a.groupId);
      if (!group) return;
      const ids = group.tasks.map((t) => t.id);
      const fromIx = ids.indexOf(a.taskId);
      const toIx = ids.indexOf(o.taskId);
      if (fromIx < 0 || toIx < 0 || fromIx === toIx) return;
      const next = ids.slice();
      next.splice(fromIx, 1);
      next.splice(toIx, 0, a.taskId);
      void reorderWithinGroup(a.groupId, next);
      return;
    }

    const toGroup = groups.find((g) => g.id === o.groupId);
    if (!toGroup) return;
    void moveAcrossGroup(a.taskId, toGroup);
  }

  const emptyMessage =
    mode === "today" ? "No tasks due today" : "No tasks due this week";

  const visibleTaskCount =
    groups.reduce((sum, g) => sum + g.tasks.length, 0) + (activeTaskOutsideFilter ? 1 : 0);
  const taskCountLabel =
    visibleTaskCount === 1 ? "1 task" : `${visibleTaskCount} tasks`;

  const quickAddProjects: TaskQuickAddProjectOption[] = useMemo(
    () => (snapshot?.projects ?? []).map((p) => ({ id: p.id, label: p.name, colorVar: p.colorVar })),
    [snapshot?.projects],
  );
  const quickAddIntegrations: TaskQuickAddIntegrationOption[] = useMemo(
    () =>
      (snapshot?.tracks ?? []).map((t) => ({
        id: t.id,
        projectId: t.projectId,
        label: t.label,
      })),
    [snapshot?.tracks],
  );

  const openAddTask = useCallback(() => {
    setAddTaskOpen(true);
    requestAnimationFrame(() => {
      if (!addTaskDialogRef.current?.open) addTaskDialogRef.current?.showModal();
    });
  }, []);

  const closeAddTask = useCallback(() => {
    addTaskDialogRef.current?.close();
  }, []);

  return (
    <section aria-label="Open tasks" className="flex min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2">
        <h2 className="section-heading">Tasks</h2>
        <div className="flex shrink-0 items-center gap-1">
          <Link href="/work" className="btn-cta-tertiary shrink-0 !py-1 !px-2 text-xs">
            View all
          </Link>
          {headerTrailing}
        </div>
      </div>

      {/* Fixed height; list scrolls when content overflows. FAB sits outside overflow clip. */}
      <div className="relative mt-3 h-[22rem]">
        <div className="card-canvas flex h-full min-h-0 flex-col overflow-hidden">
          <div
            className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div
              role="tablist"
              aria-label="Task date range"
              className="inline-flex overflow-hidden rounded-[10px] border"
              style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
            >
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "this_week", label: "This week" },
                ] as const
              ).map((opt) => {
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={[
                      "inline-flex h-7 items-center px-2.5 text-xs transition-colors cursor-pointer",
                      active
                        ? "font-semibold bg-[var(--app-text)] text-[var(--app-surface)]"
                        : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                    ].join(" ")}
                    onClick={() => setMode(opt.id)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="shrink-0 text-xs tabular-nums text-muted-canvas">{taskCountLabel}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 pb-12">
            {!snapshot ? (
              <p className="text-sm text-muted-canvas">Could not load tasks.</p>
            ) : groups.length === 0 && !activeTaskOutsideFilter ? (
              <p className="text-sm text-muted-canvas">{emptyMessage}</p>
            ) : (
              <DndContext
                id={dndContextId}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragTaskId(null)}
              >
                <ul className="flex list-none flex-col gap-3">
                  {activeTaskOutsideFilter && activeWorkSession ? (
                    <li className="min-w-0">
                      <p className="mb-1.5 text-xs font-medium text-muted-canvas">In progress</p>
                      <TaskWorkRow
                        taskId={activeTaskOutsideFilter.id}
                        taskTitle={activeTaskOutsideFilter.title}
                        finishSessionIntegrationLabel={crumbForTask(activeTaskOutsideFilter).integrationLabel}
                        finishSessionProjectLabel={crumbForTask(activeTaskOutsideFilter).projectName}
                        activeSession={activeWorkSession}
                        onActiveSessionChange={setActiveWorkSession}
                        onClose={closeWorkRow}
                        onActionError={setWorkSessionActionError}
                        onSessionPersisted={onEffortChanged}
                        compact
                        compactBadge={
                          <IntegrationIdBadge meta={metaForTask(activeTaskOutsideFilter)} />
                        }
                        subtasks={activeTaskOutsideFilter.subtasks ?? []}
                        subtaskScope={activeTaskOutsideFilter.scope === "internal" ? "internal" : "project"}
                        onSubtasksChange={(next) => patchTaskSubtasks(activeTaskOutsideFilter.id, next)}
                      />
                    </li>
                  ) : null}
                  {groups.map((group) => {
                    const sortableIds = group.tasks
                      .filter(
                        (t) =>
                          !(
                            expandedWorkTaskId === t.id &&
                            activeWorkSession?.task_id === t.id
                          ),
                      )
                      .map((t) => makeSortableId(group.id, t.id));
                    return (
                      <li key={group.id} className="min-w-0">
                        <p className="mb-1.5 text-xs font-medium text-muted-canvas">{group.title}</p>
                        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                          <ul className="flex list-none flex-col gap-1.5">
                            {group.tasks.map((task) => {
                              const isExpanded =
                                expandedWorkTaskId === task.id &&
                                activeWorkSession?.task_id === task.id;
                              if (isExpanded && activeWorkSession) {
                                const crumb = crumbForTask(task);
                                return (
                                  <li key={task.id} className="min-w-0">
                                    <TaskWorkRow
                                      taskId={task.id}
                                      taskTitle={task.title}
                                      finishSessionIntegrationLabel={crumb.integrationLabel}
                                      finishSessionProjectLabel={crumb.projectName}
                                      activeSession={activeWorkSession}
                                      onActiveSessionChange={setActiveWorkSession}
                                      onClose={closeWorkRow}
                                      onActionError={setWorkSessionActionError}
                                      onSessionPersisted={onEffortChanged}
                                      compact
                                      compactBadge={<IntegrationIdBadge meta={metaForTask(task)} />}
                                      subtasks={task.subtasks ?? []}
                                      subtaskScope={task.scope === "internal" ? "internal" : "project"}
                                      onSubtasksChange={(next) => patchTaskSubtasks(task.id, next)}
                                    />
                                  </li>
                                );
                              }
                              return (
                                <SortableHomeSkinnyTaskRow
                                  key={task.id}
                                  task={task}
                                  groupId={group.id}
                                  meta={metaForTask(task)}
                                  todayIso={todayIso}
                                  effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
                                  starting={startingTaskId === task.id}
                                  onStartWork={startWorkOnTask}
                                  onSaveDueDate={saveTaskDueDate}
                                  onToggleCompleteSuccess={markTaskCompletedLocally}
                                  onLongPressCompleteLog={(t) => setManualLogTask(t)}
                                  onOpenEdit={setEditTask}
                                  onSubtasksChange={patchTaskSubtasks}
                                  dndReady={dndReady}
                                />
                              );
                            })}
                          </ul>
                        </SortableContext>
                      </li>
                    );
                  })}
                </ul>
                <DragOverlay>
                  {activeDragTask ? (
                    <div className="opacity-95 shadow-lg">
                      <HomeSkinnyTaskRow
                        task={activeDragTask}
                        meta={metaForTask(activeDragTask)}
                        todayIso={todayIso}
                        effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
                        starting={false}
                        onStartWork={() => {}}
                        onSaveDueDate={async () => ({})}
                        dragHandle={
                          <button
                            type="button"
                            className="absolute left-0.5 top-1/2 z-[1] flex h-5 w-5 -translate-y-1/2 cursor-grabbing items-center justify-center rounded text-[var(--app-text-muted)] opacity-100"
                            aria-hidden
                            tabIndex={-1}
                          >
                            <GripHandleIcon />
                          </button>
                        }
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
            {workSessionActionError ? (
              <p className="mt-2 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {workSessionActionError}
              </p>
            ) : null}
          </div>
        </div>

        <HomeCardFab
          className="absolute bottom-3 right-3 z-10"
          aria-label="Add task"
          onClick={openAddTask}
        />
      </div>

      <dialog
        ref={addTaskDialogRef}
        aria-labelledby="home-add-task-title"
        className={addTaskDialogClass}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => setAddTaskOpen(false)}
      >
        <div className="flex max-h-[min(92dvh,48rem)] flex-col overflow-hidden">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2
                id="home-add-task-title"
                className="text-base font-semibold"
                style={{ color: "var(--app-text)" }}
              >
                Add Task
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-canvas">
                Pick a project and track (or Internal and a destination), then describe the task.
              </p>
            </div>
            <DialogCloseButton onClick={closeAddTask} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            {addTaskOpen ? (
              <TaskQuickAdd
                mode="global"
                layout="dialog"
                todayIso={todayIso}
                projects={quickAddProjects}
                integrations={quickAddIntegrations}
                internalDestinations={snapshot?.internalDestinations ?? []}
                onCancel={closeAddTask}
                onCreated={() => {
                  closeAddTask();
                  router.refresh();
                }}
              />
            ) : null}
          </div>
        </div>
      </dialog>

      <HomeEditTaskDialog
        open={editTask != null}
        task={editTask}
        projectLabel={
          editTask
            ? editTask.scope === "internal"
              ? "Internal"
              : (projectById.get(editTask.project_id)?.name ?? "Project")
            : ""
        }
        trackLabel={
          editTask
            ? editTask.scope === "internal"
              ? editTask.internal_context_label
              : (trackById.get(editTask.project_track_id)?.label ?? "Track")
            : ""
        }
        todayIso={todayIso}
        onClose={() => setEditTask(null)}
        onSaveTitle={saveTaskTitle}
        onSavePriority={saveTaskPriority}
        onSaveDueDate={saveTaskDueDate}
        onSubtasksChange={patchTaskSubtasks}
      />

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
        onCompleteTask={(taskId) => {
          const task = openTasks.find((t) => t.id === taskId);
          return toggleAnyTaskCompletion(taskId, task?.scope);
        }}
        onSaved={() => {
          if (manualLogTask) {
            markTaskCompletedLocally(manualLogTask.id);
          }
          setManualLogTask(null);
          clearCalendarSessionCache();
          onEffortChanged?.();
        }}
      />
    </section>
  );
}
