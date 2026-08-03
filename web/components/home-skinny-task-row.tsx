"use client";

import { CalendarIcon } from "@/components/action-icons";
import { TaskCompleteButton } from "@/components/task-row";
import type { TasksPageTask } from "@/lib/tasks-page-shared";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

function WorkOnTaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden className="shrink-0">
      <path fill="currentColor" d="M13 2L4 14h6l-1 8 11-14h-6l1-6z" />
    </svg>
  );
}

function priorityLabel(priority: TasksPageTask["priority"]): string {
  if (priority === "low") return "Low";
  if (priority === "medium") return "Medium";
  return "High";
}

function priorityPillClass(priority: TasksPageTask["priority"]): string {
  if (priority === "high") {
    return "integration-state-pill integration-state-pill--on_hold";
  }
  return `task-priority-pill task-priority-pill--${priority}`;
}

export type HomeSkinnyTaskMeta = {
  /** Compact badge — Integration ID (e.g. INT0997) or internal abbreviation. */
  badgeLabel: string;
  projectName: string;
  /** Full integration / context detail name for the hover popover. */
  detailName: string;
  colorVar: string | null;
  href: string;
};

export function IntegrationIdBadge({ meta }: { meta: HomeSkinnyTaskMeta }) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover || !popover.matches(":popover-open")) return;
    const margin = 8;
    const gap = 6;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - popoverRect.width - margin,
      Math.max(margin, triggerRect.left),
    );
    const top =
      triggerRect.bottom + gap + popoverRect.height <= window.innerHeight - margin
        ? triggerRect.bottom + gap
        : Math.max(margin, triggerRect.top - popoverRect.height - gap);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, []);

  const openPopover = useCallback(() => {
    clearCloseTimer();
    const popover = popoverRef.current;
    if (!popover) return;
    if (!popover.matches(":popover-open")) {
      try {
        popover.showPopover();
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(positionPopover);
  }, [clearCloseTimer, positionPopover]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      const popover = popoverRef.current;
      if (popover?.matches(":popover-open")) {
        try {
          popover.hidePopover();
        } catch {
          /* ignore */
        }
      }
    }, 120);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <>
      <Link
        ref={triggerRef}
        href={meta.href}
        className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold tracking-wide no-underline outline-none transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_70%,var(--app-text)_8%)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        style={{
          color: "var(--app-text)",
          background: "var(--app-surface-alt)",
        }}
        aria-describedby={popoverId}
        aria-label={`${meta.badgeLabel}. ${meta.projectName} · ${meta.detailName}. Open integration.`}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClose}
        onFocus={openPopover}
        onBlur={scheduleClose}
      >
        {meta.colorVar ? (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: `var(${meta.colorVar})` }}
            aria-hidden
          />
        ) : null}
        {meta.badgeLabel}
      </Link>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="m-0 w-[min(16rem,calc(100vw-1.5rem))] rounded-[10px] border px-3 py-2.5 shadow-lg"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
          {meta.projectName}
        </p>
        <p className="mt-0.5 text-xs text-muted-canvas">{meta.detailName}</p>
      </div>
    </>
  );
}

export function HomeSkinnyTaskRow({
  task,
  meta,
  todayIso,
  effectiveGlobalActiveTaskId,
  starting,
  onStartWork,
  onSaveDueDate,
  onToggleCompleteSuccess,
  onLongPressCompleteLog,
  onOpenEdit,
  dragHandle,
}: {
  task: TasksPageTask;
  meta: HomeSkinnyTaskMeta;
  todayIso: string;
  effectiveGlobalActiveTaskId: string | null;
  starting: boolean;
  onStartWork: (task: TasksPageTask) => void | Promise<void>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
  onToggleCompleteSuccess?: (taskId: string) => void;
  onLongPressCompleteLog?: (task: TasksPageTask) => void;
  /** Open edit dialog when clicking the row outside action controls. */
  onOpenEdit?: (task: TasksPageTask) => void;
  /** Optional hover-reveal grip for drag reorder (listeners attached by parent). */
  dragHandle?: ReactNode;
}) {
  const isThisActiveTimer = effectiveGlobalActiveTaskId === task.id;
  const hasAnotherActiveTimer = effectiveGlobalActiveTaskId != null && !isThisActiveTimer;
  const shouldDisableStartWork = starting || hasAnotherActiveTimer;

  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);

  const rowBg = meta.colorVar
    ? `color-mix(in oklab, var(${meta.colorVar}) 8%, var(--app-surface))`
    : "var(--app-surface)";

  async function commitDueDate(iso: string) {
    if (!iso || iso === (task.due_date ?? "")) return;
    setDueDateSaving(true);
    setDueDateError(null);
    const res = await onSaveDueDate(task.id, iso);
    if (res.error) setDueDateError(res.error);
    setDueDateSaving(false);
  }

  function openDuePicker(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
    dueInputRef.current?.showPicker?.();
    dueInputRef.current?.focus();
  }

  function openEdit() {
    onOpenEdit?.(task);
  }

  return (
    <div
      className={[
        "group relative flex min-w-0 items-center gap-2 rounded-[10px] border px-2 py-2",
        dragHandle ? "pl-6" : "",
        onOpenEdit
          ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
          : "",
      ].join(" ")}
      style={{
        borderColor: "var(--app-border)",
        background: rowBg,
      }}
      role={onOpenEdit ? "button" : undefined}
      tabIndex={onOpenEdit ? 0 : undefined}
      aria-label={onOpenEdit ? `Edit task: ${task.title}` : undefined}
      onClick={onOpenEdit ? openEdit : undefined}
      onKeyDown={
        onOpenEdit
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openEdit();
              }
            }
          : undefined
      }
    >
      {dragHandle ? <div onClick={(e) => e.stopPropagation()}>{dragHandle}</div> : null}

      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <TaskCompleteButton
          taskId={task.id}
          taskScope={task.scope === "internal" ? "internal" : "project"}
          isDone={false}
          onToggleSuccess={onToggleCompleteSuccess}
          onLongPressLog={
            onLongPressCompleteLog ? () => onLongPressCompleteLog(task) : undefined
          }
        />
      </div>

      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <IntegrationIdBadge meta={meta} />
      </div>

      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        style={{ color: "var(--app-text)" }}
        title={task.title}
      >
        {task.title}
      </span>

      <div className="relative flex h-8 min-w-[4.75rem] shrink-0 items-center justify-end">
        <span
          className={[
            priorityPillClass(task.priority),
            "pointer-events-none transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 motion-reduce:transition-none",
          ].join(" ")}
          aria-label={`Priority: ${priorityLabel(task.priority)}`}
        >
          {priorityLabel(task.priority)}
        </span>

        <div
          className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-[8px] py-0.5 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto motion-reduce:transition-none"
          style={{
            background: rowBg,
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] disabled:cursor-default disabled:opacity-50"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
            }}
            onClick={openDuePicker}
            disabled={dueDateSaving}
            aria-label="Change due date"
            title={dueDateError ?? "Change due date"}
          >
            <CalendarIcon size={14} />
          </button>
          <input
            ref={dueInputRef}
            type="date"
            className="sr-only"
            value={task.due_date ?? todayIso}
            onChange={(e) => void commitDueDate(e.target.value)}
            aria-hidden
            tabIndex={-1}
          />

          <button
            type="button"
            className="btn-cta-dark inline-flex h-8 w-8 shrink-0 items-center justify-center !rounded-full !p-0"
            title={
              hasAnotherActiveTimer
                ? "You already have an active timer on another task. Finish or discard it before starting here."
                : starting
                  ? "Starting…"
                  : "Work on task"
            }
            aria-label={starting ? "Starting work session" : "Work on task"}
            disabled={shouldDisableStartWork}
            onClick={() => {
              if (hasAnotherActiveTimer) return;
              void onStartWork(task);
            }}
          >
            <WorkOnTaskIcon />
          </button>
        </div>
      </div>

      {dueDateError ? (
        <p className="sr-only" role="alert">
          {dueDateError}
        </p>
      ) : null}
    </div>
  );
}
