"use client";

import { CalendarIcon, TrashIcon, UndoIcon } from "@/components/action-icons";
import { CanvasSelect } from "@/components/canvas-select";
import {
  addDaysIsoUtc,
  formatCompletedOnDate,
  formatDateDisplay,
  nextMondayIsoUtc,
  taskPriorityOptions,
  type IntegrationTaskRow,
} from "@/lib/integration-task-helpers";
import { toggleIntegrationTaskCompletion } from "@/lib/actions/integration-tasks";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** ~2 lines at ~11px / leading-snug */
export const ADD_TASK_TITLE_MAX_PX = 48;

/** Same as Updates "View All Updates" (`.btn-cta-tertiary`); weight/size aligned with add-row Priority (0.875rem, normal). */
const ADD_TASK_DUE_TERTIARY_CLASS =
  "btn-cta-tertiary shrink-0 whitespace-nowrap !font-normal text-sm leading-snug";

export function syncAddTaskTitleHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const h = Math.min(el.scrollHeight, ADD_TASK_TITLE_MAX_PX);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > ADD_TASK_TITLE_MAX_PX ? "auto" : "hidden";
}

/** Activity / pulse — reads as "work in progress" next to the Work on task label. */
function WorkOnTaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M13 2L4 14h6l-1 8 11-14h-6l1-6z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 6 9 17l-5-5"
      />
    </svg>
  );
}

function DueDateQuickButtons({
  quickTomorrow,
  quickNextMonday,
  onPick,
  variant = "dialog",
}: {
  quickTomorrow: string;
  quickNextMonday: string;
  onPick: (iso: string) => void;
  /** `embedded`: compact tertiary inside the add-row Due box; `dialog`: modal-friendly ghost buttons */
  variant?: "dialog" | "embedded";
}) {
  if (variant === "embedded") {
    return (
      <>
        <button type="button" className={ADD_TASK_DUE_TERTIARY_CLASS} onClick={() => onPick(quickTomorrow)}>
          Tomorrow
        </button>
        <button
          type="button"
          className={ADD_TASK_DUE_TERTIARY_CLASS}
          title="Next Monday"
          aria-label="Next Monday"
          onClick={() => onPick(quickNextMonday)}
        >
          Monday
        </button>
      </>
    );
  }

  return (
    <>
      <button type="button" className="btn-ghost text-sm font-normal" onClick={() => onPick(quickTomorrow)}>
        Tomorrow
      </button>
      <button type="button" className="btn-ghost text-sm font-normal" onClick={() => onPick(quickNextMonday)}>
        Next Monday
      </button>
    </>
  );
}

export function DueDatePickerControl({
  name,
  todayIso,
  dueDate,
  onDueDateChange,
  quickSelectMode = false,
  variant = "default",
}: {
  name: string;
  todayIso: string;
  dueDate: string;
  onDueDateChange: (iso: string) => void;
  quickSelectMode?: boolean;
  /** `inline`: one wrapping row for the add-task bar; `default`: stacked (dialogs). */
  variant?: "default" | "inline";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const quickTomorrow = useMemo(() => addDaysIsoUtc(todayIso, 1), [todayIso]);
  const quickNextMonday = useMemo(() => nextMondayIsoUtc(todayIso), [todayIso]);

  function openPicker() {
    inputRef.current?.showPicker?.();
    inputRef.current?.focus();
  }

  const dateBar =
    variant === "inline" ? null : (
      <div className="input-canvas input-canvas--shell flex min-h-[2.25rem] items-center justify-between gap-2 px-3 py-1.5">
        <span className="min-w-0 truncate text-sm" style={{ color: "var(--app-text)" }}>
          {formatDateDisplay(dueDate)}
        </span>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)]"
          style={{ borderColor: "var(--app-border)" }}
          onClick={openPicker}
          aria-label="Change due date"
        >
          <CalendarIcon />
        </button>
      </div>
    );

  const hiddenDateInput = (
    <input
      ref={inputRef}
      type="date"
      name={name}
      value={dueDate}
      onChange={(e) => onDueDateChange(e.target.value)}
      className="sr-only"
      aria-hidden
      tabIndex={-1}
    />
  );

  if (variant === "inline") {
    return (
      <div className="add-task-due-cluster input-canvas flex w-fit max-w-full min-w-0 items-stretch gap-1.5">
        <button
          type="button"
          className={`${ADD_TASK_DUE_TERTIARY_CLASS} max-w-[11rem] min-w-0 !justify-start truncate text-left tabular-nums`}
          onClick={openPicker}
          aria-label="Choose due date"
        >
          {formatDateDisplay(dueDate)}
        </button>
        {hiddenDateInput}
        {quickSelectMode ? (
          <div className="hidden sm:contents">
            <DueDateQuickButtons
              variant="embedded"
              quickTomorrow={quickTomorrow}
              quickNextMonday={quickNextMonday}
              onPick={onDueDateChange}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {dateBar}
          {hiddenDateInput}
        </div>
      </div>

      {quickSelectMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <DueDateQuickButtons
            variant="dialog"
            quickTomorrow={quickTomorrow}
            quickNextMonday={quickNextMonday}
            onPick={onDueDateChange}
          />
        </div>
      ) : null}
    </div>
  );
}

const LONG_PRESS_MS = 500;

export function TaskCompleteButton({
  taskId,
  isDone,
  onToggleSuccess,
  onLongPressLog,
}: {
  taskId: string;
  isDone: boolean;
  /** When set (e.g. client-cached task list), refetch snapshot after a successful toggle. */
  onToggleSuccess?: () => void | Promise<void>;
  /**
   * When set on an incomplete task, a long-press (~500ms) opens completion logging.
   * The dialog records time and then marks the task complete.
   */
  onLongPressLog?: () => void;
}) {
  const [updState, updAction, updPending] = useActionState(
    async (_prev: { error?: string } | void, _formData: FormData) => toggleIntegrationTaskCompletion(taskId),
    {},
  );

  const toggleSubmitRef = useRef(false);
  const onToggleSuccessRef = useRef(onToggleSuccess);
  onToggleSuccessRef.current = onToggleSuccess;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClickRef = useRef(false);
  const onLongPressLogRef = useRef(onLongPressLog);
  onLongPressLogRef.current = onLongPressLog;
  const docPointerCleanupRef = useRef<(() => void) | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  void updState;

  useEffect(() => {
    if (!toggleSubmitRef.current) return;
    if (updPending) return;
    toggleSubmitRef.current = false;
    if (updState?.error) return;
    void onToggleSuccessRef.current?.();
  }, [updPending, updState]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      docPointerCleanupRef.current?.();
      docPointerCleanupRef.current = null;
    };
  }, []);

  return (
    <form
      action={updAction}
      onSubmit={() => {
        toggleSubmitRef.current = true;
      }}
    >
      <button
        type="submit"
        disabled={updPending}
        className={`task-complete-btn group relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-default select-none touch-manipulation ${
          isDone ? "task-complete-btn--done" : ""
        }`}
        aria-label={isDone ? "Mark as not complete" : "Mark as complete"}
        title={
          !isDone && onLongPressLog
            ? "Click to complete. Hold to record time and complete."
            : undefined
        }
        onClick={(e) => {
          e.stopPropagation();
          if (suppressNextClickRef.current) {
            e.preventDefault();
            suppressNextClickRef.current = false;
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || isDone || !onLongPressLogRef.current || updPending) return;
          e.stopPropagation();
          docPointerCleanupRef.current?.();
          docPointerCleanupRef.current = null;
          clearLongPressTimer();
          suppressNextClickRef.current = false;
          const onDocPointerEnd = () => {
            document.removeEventListener("pointerup", onDocPointerEnd);
            document.removeEventListener("pointercancel", onDocPointerEnd);
            docPointerCleanupRef.current = null;
            clearLongPressTimer();
          };
          docPointerCleanupRef.current = onDocPointerEnd;
          document.addEventListener("pointerup", onDocPointerEnd);
          document.addEventListener("pointercancel", onDocPointerEnd);
          longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            suppressNextClickRef.current = true;
            onLongPressLogRef.current?.();
          }, LONG_PRESS_MS);
        }}
      >
        {isDone ? (
          <CheckIcon />
        ) : (
          <span
            className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          >
            <CheckIcon />
          </span>
        )}
      </button>
    </form>
  );
}

export function TaskUndoButton({
  taskId,
  onUndoSuccess,
}: {
  taskId: string;
  onUndoSuccess?: () => void | Promise<void>;
}) {
  const [undoState, undoAction, undoPending] = useActionState(
    async (_prev: { error?: string } | void, _formData: FormData) => toggleIntegrationTaskCompletion(taskId),
    {},
  );

  const undoSubmitRef = useRef(false);
  const onUndoSuccessRef = useRef(onUndoSuccess);
  onUndoSuccessRef.current = onUndoSuccess;

  void undoState;

  useEffect(() => {
    if (!undoSubmitRef.current) return;
    if (undoPending) return;
    undoSubmitRef.current = false;
    if (undoState?.error) return;
    void onUndoSuccessRef.current?.();
  }, [undoPending, undoState]);

  return (
    <form
      action={undoAction}
      onSubmit={() => {
        undoSubmitRef.current = true;
      }}
    >
      <button
        type="submit"
        disabled={undoPending}
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] disabled:cursor-default disabled:opacity-60"
        style={{ borderColor: "var(--app-border)" }}
        title="Undo completed task"
        aria-label="Undo completed task"
        onClick={(e) => e.stopPropagation()}
      >
        <UndoIcon className="shrink-0 -translate-y-px" />
      </button>
    </form>
  );
}

function TaskDueDateInline({
  task,
  pending,
  onSubmit,
}: {
  task: IntegrationTaskRow;
  pending: boolean;
  onSubmit: (taskId: string, dueDateIso: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
    inputRef.current?.showPicker?.();
    inputRef.current?.focus();
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        className="task-due-date-pill cursor-pointer"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openPicker(e);
        }}
        disabled={pending}
        aria-label="Change due date"
        title="Click to edit due date"
      >
        {pending ? "Saving…" : formatDateDisplay(task.due_date)}
      </button>
      <input
        ref={inputRef}
        type="date"
        className="sr-only"
        value={task.due_date ?? ""}
        onChange={(e) => onSubmit(task.id, e.target.value)}
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

export type TaskRowCrumb = {
  /** Project customer name, e.g. "Acme Corp". */
  projectName: string;
  /** Integration display label, e.g. "Workday → ADP". */
  integrationLabel: string;
  /** Link target for the crumb (typically the integration detail page). */
  href: string;
  /** Optional accent color CSS variable for a tiny dot before the project name. */
  projectColorVar?: string | null;
  /**
   * Optional opacity (0–100) used to mix the project color into the row surface.
   * Lighter project shades should pass higher percentages so the perceived weight
   * is consistent across hue + shade combinations. Defaults to 7.
   */
  projectColorTintPct?: number;
};

export type TaskRowProps = {
  task: IntegrationTaskRow;
  /** When set, renders Project · Track crumb under the title (Tasks page only). */
  crumb?: TaskRowCrumb | null;
  /** Account-wide active timer task id (for disabling Work-on-task on other rows). */
  effectiveGlobalActiveTaskId: string | null;
  /** True while a Start Work request is in flight for THIS task. */
  starting: boolean;
  /** Click "Work on task" — parent decides what to do (start session, open dialog, etc). */
  onStartWork: (task: IntegrationTaskRow) => void | Promise<void>;
  onOpenHistory: (task: IntegrationTaskRow) => void;
  onOpenDelete: (task: IntegrationTaskRow) => void;
  /** Optimistic save handlers. Each must return `{error?: string}` so the row can render inline errors. */
  onSaveTitle: (taskId: string, title: string) => Promise<{ error?: string }>;
  onSavePriority: (
    taskId: string,
    priority: "low" | "medium" | "high",
  ) => Promise<{ error?: string }>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
  /** Forwarded to TaskCompleteButton.onToggleSuccess for snapshot refresh. */
  onAfterToggleComplete?: () => void | Promise<void>;
  /** Forwarded to TaskCompleteButton.onLongPressLog (open task only). */
  onLongPressCompleteLog?: (task: IntegrationTaskRow) => void;
  /** Forwarded to TaskUndoButton.onUndoSuccess. */
  onAfterUndo?: () => void | Promise<void>;
};

export function TaskRow({
  task,
  crumb,
  effectiveGlobalActiveTaskId,
  starting,
  onStartWork,
  onOpenHistory,
  onOpenDelete,
  onSaveTitle,
  onSavePriority,
  onSaveDueDate,
  onAfterToggleComplete,
  onLongPressCompleteLog,
  onAfterUndo,
}: TaskRowProps) {
  const isDone = task.status === "done";
  const isThisActiveTimer = effectiveGlobalActiveTaskId === task.id;
  const hasAnotherActiveTimer = effectiveGlobalActiveTaskId != null && !isThisActiveTimer;
  const shouldDisableStartWork = starting || hasAnotherActiveTimer;

  const [titleEdit, setTitleEdit] = useState<{ draft: string } | null>(null);
  const [titleEditError, setTitleEditError] = useState<string | null>(null);
  const [titleSaving, setTitleSaving] = useState(false);
  const titleCommitRef = useRef(false);
  const skipTitleBlurRef = useRef(false);
  const titleEditRef = useRef<HTMLTextAreaElement | null>(null);

  const [priorityEditing, setPriorityEditing] = useState(false);
  const [priorityEditError, setPriorityEditError] = useState<string | null>(null);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const priorityRootRef = useRef<HTMLDivElement | null>(null);

  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [dueDateEditError, setDueDateEditError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!titleEdit) return;
    const el = titleEditRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    syncAddTaskTitleHeight(el);
  }, [titleEdit !== null]);

  useEffect(() => {
    if (!priorityEditing) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const root = priorityRootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node)) return;
      if (!root.contains(target)) setPriorityEditing(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPriorityEditing(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [priorityEditing]);

  async function commitTitleEdit(draftFromInput?: string) {
    if (!titleEdit) return;
    if (titleCommitRef.current) return;
    const next = (draftFromInput ?? titleEdit.draft).trim();
    if (next === task.title) {
      setTitleEdit(null);
      setTitleEditError(null);
      return;
    }
    if (!next) {
      setTitleEdit(null);
      setTitleEditError(null);
      return;
    }
    titleCommitRef.current = true;
    setTitleSaving(true);
    setTitleEditError(null);
    try {
      const res = await onSaveTitle(task.id, next);
      if (res?.error) {
        setTitleEditError(res.error);
        return;
      }
      setTitleEdit(null);
    } finally {
      titleCommitRef.current = false;
      setTitleSaving(false);
    }
  }

  function cancelTitleEdit() {
    skipTitleBlurRef.current = true;
    setTitleEdit(null);
    setTitleEditError(null);
  }

  async function commitPriorityEdit(nextPriority: "low" | "medium" | "high") {
    if (task.priority === nextPriority) {
      setPriorityEditing(false);
      return;
    }
    setPrioritySaving(true);
    setPriorityEditError(null);
    try {
      const res = await onSavePriority(task.id, nextPriority);
      if (res?.error) {
        setPriorityEditError(res.error);
        return;
      }
      setPriorityEditing(false);
    } finally {
      setPrioritySaving(false);
    }
  }

  async function commitDueDateEdit(_taskId: string, dueDateIso: string) {
    setDueDateSaving(true);
    setDueDateEditError(null);
    try {
      const res = await onSaveDueDate(task.id, dueDateIso);
      if (res?.error) {
        setDueDateEditError(res.error);
        return;
      }
    } finally {
      setDueDateSaving(false);
    }
  }

  /**
   * Optional very-pale project tint for the row background. Mixes the project
   * color into the surface using a per-shade percentage from the crumb
   * (`projectColorTintPct`) so dark/medium/light shades land at a similar
   * perceived weight. Defaults to 7%.
   */
  const tintPct = Math.max(0, Math.min(100, crumb?.projectColorTintPct ?? 7));
  const tintedRowStyle =
    crumb?.projectColorVar
      ? {
          backgroundColor: `color-mix(in oklab, var(${crumb.projectColorVar}) ${tintPct}%, var(--app-surface) ${100 - tintPct}%)`,
        }
      : undefined;

  return (
    <div className="integration-task-row" style={tintedRowStyle}>
      <div className="group">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <TaskCompleteButton
              taskId={task.id}
              isDone={isDone}
              onToggleSuccess={onAfterToggleComplete}
              onLongPressLog={
                !isDone && onLongPressCompleteLog ? () => onLongPressCompleteLog(task) : undefined
              }
            />
            {!isDone && isThisActiveTimer ? (
              <div
                className="active-work-session-indicator--live inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[var(--app-info)]"
                style={{
                  borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)",
                  background: "color-mix(in oklab, var(--app-info) 8%, var(--app-surface) 92%)",
                }}
                title="Active work session"
                aria-label="Active work session"
                role="status"
              >
                <WorkOnTaskIcon />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            {titleEdit ? (
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                <textarea
                  ref={titleEditRef}
                  value={titleEdit.draft}
                  rows={1}
                  aria-label="Edit task title"
                  className="input-canvas w-full min-w-0 resize-none text-sm leading-snug"
                  style={{
                    color: "var(--app-text)",
                    maxHeight: `${ADD_TASK_TITLE_MAX_PX}px`,
                  }}
                  disabled={titleSaving}
                  onChange={(e) => {
                    setTitleEdit((prev) => (prev ? { ...prev, draft: e.target.value } : prev));
                    syncAddTaskTitleHeight(e.target);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => {
                    window.setTimeout(() => {
                      if (skipTitleBlurRef.current) {
                        skipTitleBlurRef.current = false;
                        return;
                      }
                      if (titleCommitRef.current) return;
                      void commitTitleEdit(titleEditRef.current?.value);
                    }, 0);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelTitleEdit();
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void commitTitleEdit(titleEditRef.current?.value);
                    }
                  }}
                />
                {titleEditError ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
                    {titleEditError}
                  </p>
                ) : null}
              </div>
            ) : (
              <p
                className={`inline-block w-fit max-w-full cursor-text break-words leading-snug ${isDone ? "font-normal line-through" : "font-medium"}`}
                style={{
                  color: isDone ? "#7d8b99" : "var(--app-text)",
                }}
                title={isDone ? undefined : "Click to edit title"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDone) return;
                  setTitleEditError(null);
                  setTitleEdit({ draft: task.title });
                }}
                onKeyDown={(e) => {
                  if (isDone) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setTitleEditError(null);
                    setTitleEdit({ draft: task.title });
                  }
                }}
                role={isDone ? undefined : "button"}
                tabIndex={isDone ? undefined : 0}
              >
                {task.title}
              </p>
            )}
            {crumb ? (
              <p className="mt-1 text-xs leading-snug text-muted-canvas">
                {crumb.projectColorVar ? (
                  <span
                    className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ backgroundColor: `var(${crumb.projectColorVar})` }}
                    aria-hidden
                  />
                ) : null}
                <a
                  href={crumb.href}
                  className="inline transition-colors hover:text-[var(--app-text)] hover:underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="font-medium">{crumb.projectName}</span>
                  <span className="mx-1.5">·</span>
                  <span>{crumb.integrationLabel}</span>
                </a>
              </p>
            ) : null}
            {isDone ? (
              <p className="mt-1">
                <span className="task-due-date-pill task-due-date-pill--completed">
                  {formatDateDisplay(task.due_date)}
                </span>
              </p>
            ) : (
              <TaskDueDateInline
                task={task}
                pending={dueDateSaving}
                onSubmit={(taskId, dueDateIso) => void commitDueDateEdit(taskId, dueDateIso)}
              />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className={`flex items-center ${isDone ? "gap-3" : "gap-0.5"}`}>
              <div className="flex shrink-0 items-center gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                {!isDone ? (
                  <button
                    type="button"
                    className="btn-cta-dark inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium whitespace-nowrap"
                    title={
                      hasAnotherActiveTimer
                        ? "You already have an active timer on another task. Finish or discard it before starting here."
                        : "Work on task"
                    }
                    aria-label="Work on task"
                    disabled={shouldDisableStartWork}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasAnotherActiveTimer) return;
                      void onStartWork(task);
                    }}
                  >
                    <WorkOnTaskIcon />
                    {starting ? "Starting…" : "Work on task"}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn-cta inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap"
                  title="View work history"
                  aria-label="View work history"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHistory(task);
                  }}
                >
                  History
                </button>

                {isDone ? <TaskUndoButton taskId={task.id} onUndoSuccess={onAfterUndo} /> : null}

                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)]"
                  style={{ borderColor: "var(--app-border)" }}
                  title="Delete task"
                  aria-label="Delete task"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDelete(task);
                  }}
                >
                  <TrashIcon />
                </button>
              </div>

              <div
                className={`flex shrink-0 items-center justify-end ${
                  !isDone ? "min-w-[5.5rem]" : "min-w-0"
                }`}
              >
                {!isDone ? (
                  priorityEditing ? (
                    <div ref={priorityRootRef} className="w-[7rem]" onClick={(e) => e.stopPropagation()}>
                      <CanvasSelect
                        name={`priority-${task.id}`}
                        options={taskPriorityOptions}
                        value={task.priority}
                        onValueChange={(value) => {
                          if (value === "low" || value === "medium" || value === "high") {
                            void commitPriorityEdit(value);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={
                        task.priority === "high"
                          ? "integration-state-pill integration-state-pill--on_hold cursor-pointer"
                          : `task-priority-pill task-priority-pill--${task.priority} cursor-pointer`
                      }
                      disabled={prioritySaving}
                      aria-label="Edit priority"
                      title="Click to edit priority"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPriorityEditError(null);
                        setPriorityEditing(true);
                      }}
                    >
                      {prioritySaving
                        ? "Saving…"
                        : task.priority === "low"
                          ? "Low"
                          : task.priority === "medium"
                            ? "Medium"
                            : "High"}
                    </button>
                  )
                ) : (
                  <div className="flex w-full min-w-0 flex-col items-end text-right leading-snug">
                    <span className="text-sm" style={{ color: "#7d8b99" }}>
                      Completed on
                    </span>
                    <span className="mt-0.5 text-sm" style={{ color: "#7d8b99" }}>
                      {formatCompletedOnDate(task.completed_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {priorityEditError ? (
          <p className="mt-2 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
            {priorityEditError}
          </p>
        ) : null}
        {dueDateEditError ? (
          <p className="mt-2 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
            {dueDateEditError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
