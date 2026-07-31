"use client";

import { formatDateDisplay } from "@/lib/integration-task-helpers";
import type { TasksPageTask } from "@/lib/tasks-page-shared";
import { useRef, useState } from "react";

function WorkOnTaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden className="shrink-0">
      <path fill="currentColor" d="M13 2L4 14h6l-1 8 11-14h-6l1-6z" />
    </svg>
  );
}

export type HomeSkinnyTaskMeta = {
  abbreviation: string;
  fullLabel: string;
  colorVar: string | null;
  href: string;
};

export function HomeSkinnyTaskRow({
  task,
  meta,
  todayIso,
  effectiveGlobalActiveTaskId,
  starting,
  onStartWork,
  onSaveDueDate,
}: {
  task: TasksPageTask;
  meta: HomeSkinnyTaskMeta;
  todayIso: string;
  effectiveGlobalActiveTaskId: string | null;
  starting: boolean;
  onStartWork: (task: TasksPageTask) => void | Promise<void>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
}) {
  const isThisActiveTimer = effectiveGlobalActiveTaskId === task.id;
  const hasAnotherActiveTimer = effectiveGlobalActiveTaskId != null && !isThisActiveTimer;
  const shouldDisableStartWork = starting || hasAnotherActiveTimer;

  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className="group flex min-w-0 items-center gap-2 rounded-[10px] border px-2 py-1.5"
      style={{
        borderColor: "var(--app-border)",
        background: meta.colorVar
          ? `color-mix(in oklab, var(${meta.colorVar}) 8%, var(--app-surface))`
          : "var(--app-surface)",
      }}
    >
      <span
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold tracking-wide"
        style={{
          color: "var(--app-text)",
          background: "var(--app-surface-alt)",
        }}
        title={meta.fullLabel}
      >
        {meta.colorVar ? (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: `var(${meta.colorVar})` }}
            aria-hidden
          />
        ) : null}
        {meta.abbreviation}
      </span>

      <a
        href={meta.href}
        className="min-w-0 flex-1 truncate text-sm font-medium no-underline hover:underline underline-offset-2"
        style={{ color: "var(--app-text)" }}
        title={task.title}
      >
        {task.title}
      </a>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="task-due-date-pill cursor-pointer !text-[11px] !px-1.5 !py-0.5"
          onClick={openDuePicker}
          disabled={dueDateSaving}
          aria-label="Change due date"
          title={dueDateError ?? "Click to edit due date"}
        >
          {dueDateSaving ? "…" : formatDateDisplay(task.due_date)}
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
          className="btn-cta-dark inline-flex h-7 shrink-0 items-center gap-1 px-2 text-[10px] font-medium whitespace-nowrap"
          title={
            hasAnotherActiveTimer
              ? "You already have an active timer on another task. Finish or discard it before starting here."
              : "Work on task"
          }
          aria-label="Work on task"
          disabled={shouldDisableStartWork}
          onClick={() => {
            if (hasAnotherActiveTimer) return;
            void onStartWork(task);
          }}
        >
          <WorkOnTaskIcon />
          <span className="hidden sm:inline">{starting ? "Starting…" : "Work"}</span>
        </button>
      </div>

      {dueDateError ? (
        <p className="sr-only" role="alert">
          {dueDateError}
        </p>
      ) : null}
    </div>
  );
}
