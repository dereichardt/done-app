"use client";

import { ActiveWorkSessionDialog } from "@/components/integration-tasks-panel";
import {
  loadActiveWorkSessionIndicator,
  type ActiveWorkSessionDTO,
  type ActiveWorkSessionIndicatorDTO,
} from "@/lib/actions/integration-tasks";
import {
  ACTIVE_WORK_SESSION_CHANGED_EVENT,
  notifyActiveWorkSessionChanged,
  type ActiveWorkSessionChangedDetail,
} from "@/lib/active-work-session-events";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function indicatorToActiveSessionDto(i: ActiveWorkSessionIndicatorDTO): ActiveWorkSessionDTO {
  return {
    scope: i.scope,
    task_id: i.task_id,
    started_at: i.started_at,
    paused_ms_accumulated: i.paused_ms_accumulated,
    pause_started_at: i.pause_started_at,
  };
}

const activeSessionIndicatorButtonClass =
  "active-work-session-indicator--live inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-info)_8%,var(--app-surface)_92%)] text-[var(--app-info)] transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--app-info)_22%,var(--app-surface-alt)_78%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-info)]";

function WorkOnTaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden className="shrink-0">
      <path fill="currentColor" d="M13 2L4 14h6l-1 8 11-14h-6l1-6z" />
    </svg>
  );
}

function isTasksRoute(pathname: string | null): boolean {
  return (
    pathname === "/work" ||
    (pathname?.startsWith("/work/") ?? false) ||
    pathname === "/tasks" ||
    (pathname?.startsWith("/tasks/") ?? false)
  );
}

export function HeaderActiveWorkSession() {
  const pathname = usePathname();
  const router = useRouter();
  const [indicator, setIndicator] = useState<ActiveWorkSessionIndicatorDTO | null>(null);
  const lastIndicatorRef = useRef<ActiveWorkSessionIndicatorDTO | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadEpochRef = useRef(0);
  const hideOnTasksPage = isTasksRoute(pathname);

  const reload = useCallback(async () => {
    const epoch = ++loadEpochRef.current;
    const res = await loadActiveWorkSessionIndicator();
    if (epoch !== loadEpochRef.current) return;
    setIndicator(res.indicator ?? null);
  }, []);

  useEffect(() => {
    if (hideOnTasksPage) return;
    void reload();
  }, [pathname, reload, hideOnTasksPage]);

  useEffect(() => {
    if (hideOnTasksPage) return;
    function onChanged(evt: Event) {
      const detail = (evt as CustomEvent<ActiveWorkSessionChangedDetail>).detail;
      if (detail?.cleared) {
        setIndicator(null);
        return;
      }
      void reload();
    }
    window.addEventListener(ACTIVE_WORK_SESSION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ACTIVE_WORK_SESSION_CHANGED_EVENT, onChanged);
  }, [reload, hideOnTasksPage]);

  useEffect(() => {
    if (indicator) lastIndicatorRef.current = indicator;
  }, [indicator]);

  const openDialog = useCallback(() => {
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }, []);

  const afterCleared = useCallback(
    (_opts?: { completeTask?: boolean; refresh?: boolean }) => {
      setIndicator(null);
      notifyActiveWorkSessionChanged({ cleared: true });
      router.refresh();
    },
    [router],
  );

  const restoreSession = useCallback((session: ActiveWorkSessionDTO) => {
    const last = lastIndicatorRef.current;
    if (!last || last.task_id !== session.task_id) return;
    setIndicator({
      ...last,
      started_at: session.started_at,
      paused_ms_accumulated: session.paused_ms_accumulated,
      pause_started_at: session.pause_started_at,
    });
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }, []);

  // Tasks page already surfaces the active session inline — skip the header control there.
  if (hideOnTasksPage || !indicator) return null;

  return (
    <>
      <button
        type="button"
        className={activeSessionIndicatorButtonClass}
        aria-label="Open active work session"
        title="Active work session"
        onClick={openDialog}
      >
        <WorkOnTaskIcon />
      </button>
      <ActiveWorkSessionDialog
        key={indicator.task_id}
        dialogRef={dialogRef}
        taskId={indicator.task_id}
        taskTitle={indicator.task_title}
        integrationLabel={indicator.integration_label}
        projectLabel={indicator.project_name}
        activeSession={indicatorToActiveSessionDto(indicator)}
        onActiveSessionChange={(s) => {
          setIndicator((prev) =>
            prev && prev.task_id === s.task_id
              ? {
                  ...prev,
                  started_at: s.started_at,
                  paused_ms_accumulated: s.paused_ms_accumulated,
                  pause_started_at: s.pause_started_at,
                }
              : prev,
          );
        }}
        onAfterSessionCleared={afterCleared}
        onRestoreSession={restoreSession}
      />
    </>
  );
}
