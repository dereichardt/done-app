"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { HomeCardFab } from "@/components/home-card-fab";
import { TaskWorkRow } from "@/components/integration-tasks-panel";
import {
  HomeSkinnyTaskRow,
  IntegrationIdBadge,
  type HomeSkinnyTaskMeta,
} from "@/components/home-skinny-task-row";
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
import { toggleAnyTaskCompletion, updateAnyTaskDueDate } from "@/lib/actions/tasks-page";
import { notifyActiveWorkSessionChanged } from "@/lib/active-work-session-events";
import {
  computeHomeTaskGroups,
  homeTaskMatchesMode,
  type HomeTasksMode,
} from "@/lib/home-task-buckets";
import { deriveProjectAbbreviation } from "@/lib/project-abbreviation";
import type { TasksPageSnapshot, TasksPageTask } from "@/lib/tasks-page-shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
}: {
  snapshot: TasksPageSnapshot | null;
  error?: string | null;
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
      const fd = new FormData();
      fd.set("due_date", dueDateIso);
      const res = await updateAnyTaskDueDate(taskId, fd, existing.scope);
      if (res?.error) {
        setOpenTasks((prevTasks) =>
          prevTasks.map((t) => (t.id === taskId ? ({ ...t, due_date: prev } as TasksPageTask) : t)),
        );
        return { error: res.error };
      }
      if (!homeTaskMatchesMode(next, mode, todayIso)) {
        setOpenTasks((prevTasks) => prevTasks.filter((t) => t.id !== taskId));
      }
      return {};
    },
    [openTasks, mode, todayIso],
  );

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
        <Link href="/work" className="btn-cta-tertiary shrink-0 !py-1 !px-2 text-xs">
          View all
        </Link>
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
                      compact
                      compactBadge={
                        <IntegrationIdBadge meta={metaForTask(activeTaskOutsideFilter)} />
                      }
                    />
                  </li>
                ) : null}
                {groups.map((group) => (
                  <li key={group.id} className="min-w-0">
                    <p className="mb-1.5 text-xs font-medium text-muted-canvas">{group.title}</p>
                    <ul className="flex list-none flex-col gap-1.5">
                      {group.tasks.map((task) => {
                        const isExpanded =
                          expandedWorkTaskId === task.id && activeWorkSession?.task_id === task.id;
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
                                compact
                                compactBadge={<IntegrationIdBadge meta={metaForTask(task)} />}
                              />
                            </li>
                          );
                        }
                        return (
                          <li key={task.id} className="min-w-0">
                            <HomeSkinnyTaskRow
                              task={task}
                              meta={metaForTask(task)}
                              todayIso={todayIso}
                              effectiveGlobalActiveTaskId={effectiveGlobalActiveTaskId}
                              starting={startingTaskId === task.id}
                              onStartWork={startWorkOnTask}
                              onSaveDueDate={saveTaskDueDate}
                              onToggleCompleteSuccess={markTaskCompletedLocally}
                              onLongPressCompleteLog={(t) => setManualLogTask(t)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
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
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
        }}
      />
    </section>
  );
}
