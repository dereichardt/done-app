"use client";

import {
  createIntegrationTask,
  createIntegrationTaskWorkSession,
  deleteIntegrationTask,
  discardActiveWorkSession,
  startOrReplaceActiveWorkSession,
  syncActiveWorkSessionPause,
  toggleIntegrationTaskCompletion,
  updateActiveWorkSessionStartedAt,
  updateIntegrationTaskDueDate,
  updateIntegrationTaskPriority,
  updateIntegrationTaskTitle,
  updateIntegrationTaskWorkSessionWorkAccomplished,
  type ActiveWorkSessionDTO,
} from "@/lib/actions/integration-tasks";
import {
  activeSessionElapsedMs,
  formatElapsedTimerMs,
  formatRoundedHoursLabelFromRoundedMs,
  roundDurationMsTo15MinBands,
  roundedMsToDurationHours,
  totalPausedMsForDisplay,
} from "@/lib/work-session-duration";
import { CalendarIcon, TrashIcon, UndoIcon } from "@/components/action-icons";
import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { useActionState } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";

const dialogBaseClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[200] max-h-[min(92dvh,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

const finishModalDurationHelpText =
  "Duration uses 15-minute rounding and does not include paused time.";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Keep the local calendar date from `baseMs`; set time from 12-hour clock. */
function applyTime12hPreserveLocalDay(baseMs: number, hour12: number, minute: number, isPm: boolean): number {
  const d = new Date(baseMs);
  const h24 = hour12 === 12 ? (isPm ? 12 : 0) : hour12 + (isPm ? 12 : 0);
  d.setHours(h24, minute, 0, 0);
  return d.getTime();
}

function msTo12hParts(ms: number): { hour12: number; minute: number; isPm: boolean } {
  const d = new Date(ms);
  const h24 = d.getHours();
  const minute = d.getMinutes();
  const isPm = h24 >= 12;
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, isPm };
}

const SESSION_TIME_HOUR_OPTIONS: CanvasSelectOption[] = Array.from({ length: 12 }, (_, i) => {
  const h = i + 1;
  return { value: String(h), label: pad2(h) };
});

const SESSION_TIME_MINUTE_OPTIONS: CanvasSelectOption[] = Array.from({ length: 60 }, (_, i) => ({
  value: String(i),
  label: pad2(i),
}));

const SESSION_TIME_AMPM_OPTIONS: CanvasSelectOption[] = [
  { value: "am", label: "AM" },
  { value: "pm", label: "PM" },
];

const SESSION_TIME_PICKER_WIDTHS = {
  default: {
    selectMinWidthClass: "w-[3.7rem] min-w-[3.7rem]",
    ampmMinWidthClass: "w-[4rem] min-w-[4rem]",
  },
} as const;

function SessionTimeCanvasPickers({
  valueMs,
  onTimeCommit,
  disabled,
  density = "default",
  selectMinWidthClass,
  ampmMinWidthClass,
  className = "",
}: {
  valueMs: number;
  onTimeCommit: (ms: number) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  /** When set, overrides `density` for trigger widths. */
  selectMinWidthClass?: string;
  ampmMinWidthClass?: string;
  density?: keyof typeof SESSION_TIME_PICKER_WIDTHS;
  className?: string;
}) {
  const w = SESSION_TIME_PICKER_WIDTHS[density];
  const selClass = selectMinWidthClass ?? w.selectMinWidthClass;
  const apClass = ampmMinWidthClass ?? w.ampmMinWidthClass;
  const uid = useId();
  const parts = useMemo(() => msTo12hParts(valueMs), [valueMs]);
  const [hour, setHour] = useState(String(parts.hour12));
  const [minute, setMinute] = useState(String(parts.minute));
  const [ap, setAp] = useState(parts.isPm ? "pm" : "am");

  useEffect(() => {
    const p = msTo12hParts(valueMs);
    setHour(String(p.hour12));
    setMinute(String(p.minute));
    setAp(p.isPm ? "pm" : "am");
  }, [valueMs]);

  async function commitWith(h: string, m: string, apv: string) {
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return;
    const ms = applyTime12hPreserveLocalDay(valueMs, hh, mm, apv === "pm");
    await onTimeCommit(ms);
  }

  return (
    <div
      className={`session-time-pickers flex min-w-0 flex-nowrap items-center justify-center gap-1 ${className}`.trim()}
    >
      <div className={`task-sort-compact shrink-0 ${selClass}`}>
        <CanvasSelect
          name={`sth${uid}`}
          options={SESSION_TIME_HOUR_OPTIONS}
          value={hour}
          disabled={disabled}
          triggerClassName="!pr-1"
          chevronClassName="!mr-0"
          onValueChange={(v) => {
            setHour(v);
            void commitWith(v, minute, ap);
          }}
        />
      </div>
      <div className={`task-sort-compact shrink-0 ${selClass}`}>
        <CanvasSelect
          name={`stm${uid}`}
          options={SESSION_TIME_MINUTE_OPTIONS}
          value={minute}
          disabled={disabled}
          triggerClassName="!pr-1"
          chevronClassName="!mr-0"
          onValueChange={(v) => {
            setMinute(v);
            void commitWith(hour, v, ap);
          }}
        />
      </div>
      <div className={`task-sort-compact shrink-0 ${apClass}`}>
        <CanvasSelect
          name={`sta${uid}`}
          options={SESSION_TIME_AMPM_OPTIONS}
          value={ap}
          disabled={disabled}
          triggerClassName="!pr-1"
          chevronClassName="!mr-0"
          onValueChange={(v) => {
            setAp(v);
            void commitWith(hour, minute, v);
          }}
        />
      </div>
    </div>
  );
}

/** Matches previous time-only display when same local day; otherwise short date + time. */
function formatSessionClockDisplay(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

const sessionTimeEditHitInteractive =
  "w-full min-w-0 rounded-md text-center transition-colors cursor-pointer hover:bg-[color-mix(in_oklab,var(--app-info)_10%,var(--app-surface)_90%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-info)]";

const sessionTimeEditTypographyFinishModal = "tabular-nums text-base font-medium px-1.5 py-1";
const sessionTimeEditTypographyWorkMiniCardText =
  "tabular-nums text-xl font-normal leading-tight sm:text-2xl px-1 py-0.5 min-h-0";

/**
 * Click display → three canvas selects (hour 01–12, minute 00–59, AM/PM). Commits on each change.
 * Escape or click outside closes edit mode (does not revert a successful commit).
 */
function ClickToEditSessionTime({
  valueMs,
  onCommit,
  onBeforeOpenEdit,
  onEditingChange,
  pending,
  ariaLabel,
  /** Same size/weight as the Duration mini card (`workMiniCardValue`) for display and edit chrome. */
  matchWorkMiniCard = false,
  /**
   * Idle clock matches the task-row mini card (`workMiniCardValue`); edit UI keeps finish-modal
   * density (same as when both flags are false).
   */
  matchWorkMiniCardDisplayOnly = false,
  /** In the finish modal, overlay the pickers on the display line to limit layout shift. */
  overlayEdit = false,
  pickerDensity = "default",
}: {
  valueMs: number;
  onCommit: (ms: number) => boolean | void | Promise<boolean | void>;
  /** Runs once when entering edit mode (e.g. freeze live “finished at” to a draft). */
  onBeforeOpenEdit?: () => void;
  /** Notified when inline edit opens/closes (for layout around the control). */
  onEditingChange?: (editing: boolean) => void;
  pending?: boolean;
  ariaLabel: string;
  matchWorkMiniCard?: boolean;
  matchWorkMiniCardDisplayOnly?: boolean;
  overlayEdit?: boolean;
  pickerDensity?: keyof typeof SESSION_TIME_PICKER_WIDTHS;
}) {
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /** Keep parent layout (e.g. min-width) in sync on the same tick as edit mode — not in `useEffect`, which runs after paint and causes a visible jump. */
  const setEditingState = useCallback(
    (next: boolean) => {
      setEditing(next);
      onEditingChange?.(next);
    },
    [onEditingChange],
  );

  useEffect(() => {
    if (!editing) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      const t = e.target;
      if (el && t instanceof Node && !el.contains(t)) setEditingState(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setEditingState(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [editing, setEditingState]);

  const buttonTypoClass =
    matchWorkMiniCard || matchWorkMiniCardDisplayOnly
      ? `${sessionTimeEditTypographyWorkMiniCardText} flex w-full items-center justify-center text-center`
      : sessionTimeEditTypographyFinishModal;

  async function handleTimeCommit(ms: number) {
    await onCommit(ms);
  }

  if (editing && overlayEdit) {
    const reserveLine = formatSessionClockDisplay(valueMs);
    return (
      <div ref={rootRef} className="relative w-full min-w-0">
        {/* Full-width row so the overlay clips to the column, not to the narrow reserve text. */}
        <div
          className="pointer-events-none flex min-h-[2rem] w-full items-center justify-center gap-1"
          aria-hidden
        >
          <span className={`invisible whitespace-nowrap tabular-nums ${buttonTypoClass}`}>{reserveLine}</span>
        </div>
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <SessionTimeCanvasPickers
            valueMs={valueMs}
            disabled={pending}
            onTimeCommit={handleTimeCommit}
            density={pickerDensity}
          />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div
        ref={rootRef}
        className={`flex w-fit max-w-full min-w-0 items-center justify-center ${matchWorkMiniCard ? "min-h-[3rem]" : ""}`}
      >
        <SessionTimeCanvasPickers
          valueMs={valueMs}
          disabled={pending}
          onTimeCommit={handleTimeCommit}
          density={pickerDensity}
          className="!min-w-min"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      className={`${sessionTimeEditHitInteractive} ${buttonTypoClass}`}
      style={{ color: "var(--app-text)" }}
      aria-label={ariaLabel}
      onClick={() => {
        onBeforeOpenEdit?.();
        setEditingState(true);
      }}
    >
      {formatSessionClockDisplay(valueMs)}
    </button>
  );
}

export type IntegrationTaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: "low" | "medium" | "high";
  /** ISO timestamp when marked done; null if open or never recorded. */
  completed_at: string | null;
};

export type IntegrationTaskWorkSessionRow = {
  id: string;
  integration_task_id: string;
  started_at: string;
  finished_at: string | null;
  duration_hours: number;
  work_accomplished: string | null;
};

const taskPriorityOptions: CanvasSelectOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const taskSortOptions: CanvasSelectOption[] = [
  { value: "due_date", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
];

function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Completion timestamp (timestamptz); date-only display, not struck through with task title. */
function formatCompletedOnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function sortTasksByDueDate(a: IntegrationTaskRow, b: IntegrationTaskRow): number {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

function sortTasksByPriority(a: IntegrationTaskRow, b: IntegrationTaskRow): number {
  const rank: Record<IntegrationTaskRow["priority"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return rank[a.priority] - rank[b.priority];
}

function sortTasksByTitle(a: IntegrationTaskRow, b: IntegrationTaskRow): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function addDaysIsoUtc(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextMondayIsoUtc(todayIso: string): string {
  const d = new Date(`${todayIso}T12:00:00.000Z`);
  const weekday = d.getUTCDay(); // 0=Sunday, 1=Monday
  const daysUntilMonday = (1 - weekday + 7) % 7;
  return daysUntilMonday === 0 ? addDaysIsoUtc(todayIso, 7) : addDaysIsoUtc(todayIso, daysUntilMonday);
}

/** Activity / pulse — reads as “work in progress” next to the Work on task label. */
function WorkOnTaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden className="shrink-0">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 12h-4l-3 9L9 3l-3 9H2"
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

/** ~2 lines at ~11px / leading-snug */
const ADD_TASK_TITLE_MAX_PX = 48;

/** Same as Updates “View All Updates” (`.btn-cta-tertiary`); weight/size aligned with add-row Priority (0.875rem, normal). */
const ADD_TASK_DUE_TERTIARY_CLASS =
  "btn-cta-tertiary shrink-0 whitespace-nowrap !font-normal text-sm leading-snug";

function syncAddTaskTitleHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const h = Math.min(el.scrollHeight, ADD_TASK_TITLE_MAX_PX);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > ADD_TASK_TITLE_MAX_PX ? "auto" : "hidden";
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

function DueDatePickerControl({
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
    // Native browser date picker for a consistent “classic” experience.
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

function TaskCompleteButton({
  taskId,
  isDone,
  onToggleSuccess,
}: {
  taskId: string;
  isDone: boolean;
  /** When set (e.g. client-cached task list), refetch snapshot after a successful toggle. */
  onToggleSuccess?: () => void | Promise<void>;
}) {
  const [updState, updAction, updPending] = useActionState(
    async (_prev: { error?: string } | void, _formData: FormData) => toggleIntegrationTaskCompletion(taskId),
    {},
  );

  const toggleSubmitRef = useRef(false);
  const onToggleSuccessRef = useRef(onToggleSuccess);
  onToggleSuccessRef.current = onToggleSuccess;

  // Suppress any server error UI on the smallest affordance; keep the interaction crisp.
  void updState;

  useEffect(() => {
    if (!toggleSubmitRef.current) return;
    if (updPending) return;
    toggleSubmitRef.current = false;
    if (updState?.error) return;
    void onToggleSuccessRef.current?.();
  }, [updPending, updState]);

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
        className={`task-complete-btn group relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          isDone ? "task-complete-btn--done" : ""
        }`}
        aria-label={isDone ? "Mark as not complete" : "Mark as complete"}
        onClick={(e) => e.stopPropagation()}
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

function TaskUndoButton({
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
        className="cursor-pointer text-xs text-muted-canvas tabular-nums underline-offset-2 transition-colors hover:text-[var(--app-text)] hover:underline disabled:cursor-default disabled:opacity-60"
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

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden className="shrink-0">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden className="shrink-0">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

const workMiniCardLabel = "text-xs font-medium text-muted-canvas";
const workMiniCardValue =
  "flex min-h-[3rem] flex-1 flex-col items-center justify-center tabular-nums text-xl font-normal leading-tight sm:text-2xl";
const workMiniCardSurface = {
  background: "color-mix(in oklab, var(--app-info) 3%, var(--app-info-surface) 97%)",
} as const;

/** Shell shared by Duration and default-width “Started at” in the active-work row / dialog. */
const integrationTaskWorkMiniCardClass =
  "flex min-h-[5.25rem] min-w-[8rem] flex-1 flex-col rounded-[var(--app-radius)] border-0 px-3 py-2.5 shadow-none sm:min-w-[8.5rem] sm:flex-initial";

const integrationTaskWorkDurationMiniCardClass = `${integrationTaskWorkMiniCardClass} min-w-[7.5rem]`;

/** Equal split with sibling in `ActiveWorkSessionDialog`; parent is `flex w-full gap-*`. */
const activeSessionDialogTimerCardClass =
  "flex min-h-[5.25rem] min-w-0 w-full flex-1 basis-0 flex-col rounded-[var(--app-radius)] border-0 px-3 py-2.5 shadow-none";

/** Same width as Duration when idle; while editing, shrinks to the picker strip (`w-fit` on the control). */
function WorkSessionStartedAtMiniCard({
  valueMs,
  ariaLabel,
  onCommit,
  equalWidthInRow = false,
}: {
  valueMs: number;
  ariaLabel: string;
  onCommit: (ms: number) => boolean | void | Promise<boolean | void>;
  /** When true, share row width 50/50 with the duration card (active session modal). */
  equalWidthInRow?: boolean;
}) {
  const [editingLayout, setEditingLayout] = useState(false);
  const editingShellClass =
    "flex min-h-[5.25rem] w-fit max-w-full shrink-0 flex-col rounded-[var(--app-radius)] border-0 px-3 py-2.5 shadow-none";
  const shellClass = equalWidthInRow
    ? activeSessionDialogTimerCardClass
    : editingLayout
      ? editingShellClass
      : integrationTaskWorkDurationMiniCardClass;

  return (
    <div className={shellClass} style={workMiniCardSurface}>
      <div className={workMiniCardLabel}>Started at</div>
      <div className={workMiniCardValue} style={{ color: "var(--app-text)" }}>
        <ClickToEditSessionTime
          matchWorkMiniCard
          valueMs={valueMs}
          ariaLabel={ariaLabel}
          onEditingChange={setEditingLayout}
          onCommit={onCommit}
        />
      </div>
    </div>
  );
}

/** Very pale info tint for finish-modal timer cards. */
const finishDialogTimeCardSurface = {
  background: "color-mix(in oklab, var(--app-info) 4%, var(--app-surface) 96%)",
} as const;

/** Padding/radius shell shared by Started, Finished, and Duration cards in the finish modal. */
const finishDialogTimeCardShellClass =
  "min-w-0 rounded-[var(--app-radius)] px-3 py-3 shadow-none sm:px-3.5 sm:py-3.5";

const finishSessionContextLabelClass = "text-xs font-medium text-muted-canvas";
const finishSessionContextValueClass = "mt-0.5 text-sm break-words font-medium";

function WorkSessionFinishTaskContext({
  taskTitle,
  integrationLabel,
  projectLabel,
}: {
  taskTitle: string;
  integrationLabel: string;
  projectLabel: string;
}) {
  const show = (s: string) => (s.trim().length > 0 ? s : "—");
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className={finishSessionContextLabelClass}>Task</p>
        <p className={finishSessionContextValueClass} style={{ color: "var(--app-text)" }}>
          {show(taskTitle)}
        </p>
      </div>
      <div>
        <p className={finishSessionContextLabelClass}>Integration</p>
        <p className={finishSessionContextValueClass} style={{ color: "var(--app-text)" }}>
          {show(integrationLabel)}
        </p>
      </div>
      <div>
        <p className={finishSessionContextLabelClass}>Project</p>
        <p className={finishSessionContextValueClass} style={{ color: "var(--app-text)" }}>
          {show(projectLabel)}
        </p>
      </div>
    </div>
  );
}

function WorkSessionFinishTaskContextSeparator() {
  return (
    <hr
      className="m-0 border-0 border-t"
      style={{ borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)" }}
    />
  );
}

/** Same header row as “Add Task or Meeting” (`integration-effort-section` create dialog). */
function WorkSessionFinishModalHeader({
  titleId,
  title = "Finish work session",
  projectLabel,
  integrationLabel,
  onClose,
}: {
  titleId: string;
  title?: string;
  projectLabel: string;
  integrationLabel: string;
  onClose: () => void;
}) {
  const show = (s: string) => (s.trim().length > 0 ? s.trim() : "—");
  const subtitle = `${show(projectLabel)} · ${show(integrationLabel)}`;
  return (
    <div
      className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="min-w-0 flex-1 pr-2">
        <h2 id={titleId} className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
          {title}
        </h2>
        <p className="mt-0.5 truncate text-sm text-muted-canvas" title={subtitle}>
          {subtitle}
        </p>
      </div>
      <DialogCloseButton onClick={onClose} />
    </div>
  );
}

function WorkSessionFinishModalTaskTitle({ taskTitle }: { taskTitle: string }) {
  const show = (s: string) => (s.trim().length > 0 ? s : "—");
  return (
    <div>
      <p className={finishSessionContextLabelClass}>Task</p>
      <p className={finishSessionContextValueClass} style={{ color: "var(--app-text)" }}>
        {show(taskTitle)}
      </p>
    </div>
  );
}

/** One side of the shared Started/Finished card; pickers size to content (`w-fit`) inside a steady flex half. */
function WorkSessionFinishModalTimeHalf({
  label,
  valueMs,
  pending,
  ariaLabel,
  onCommit,
  onBeforeOpenEdit,
}: {
  label: string;
  valueMs: number;
  pending: boolean;
  ariaLabel: string;
  onCommit: (ms: number) => void;
  onBeforeOpenEdit?: () => void;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col items-center justify-center text-center">
      <p className={`w-full ${workMiniCardLabel}`}>{label}</p>
      <div className="mt-1 flex w-full min-w-0 flex-1 items-center justify-center">
        <ClickToEditSessionTime
          matchWorkMiniCardDisplayOnly
          valueMs={valueMs}
          pending={pending}
          ariaLabel={ariaLabel}
          onBeforeOpenEdit={onBeforeOpenEdit}
          onCommit={onCommit}
        />
      </div>
    </div>
  );
}

function WorkSessionFinishTimeSection({
  draftStartMs,
  draftEndMs,
  effectiveEndMs,
  pauseReferenceAtMs,
  finishEndUserEdited,
  onDraftStartChange,
  onDraftEndChange,
  onEndEditBegin,
  pausedMsAccumulated,
  pauseStartedAtMs,
  durationRoundedLabel,
  savePending,
}: {
  draftStartMs: number;
  draftEndMs: number;
  /** Live clock for “Finished at” until the user edits end. */
  effectiveEndMs: number;
  /** Same instant used for duration + paused (total) line (user end or live). */
  pauseReferenceAtMs: number;
  finishEndUserEdited: boolean;
  onDraftStartChange: (ms: number) => void;
  onDraftEndChange: (ms: number) => void;
  onEndEditBegin: () => void;
  pausedMsAccumulated: number;
  pauseStartedAtMs: number | null;
  durationRoundedLabel: string;
  savePending: boolean;
}) {
  const durationHelpId = useId();
  const durationPopoverRef = useRef<HTMLDivElement>(null);
  const durationAnchorRef = useRef<HTMLDivElement>(null);
  const durationHidePopoverTimerRef = useRef<number | null>(null);
  const [durationHintDescribedBy, setDurationHintDescribedBy] = useState<string | undefined>();

  const clearDurationPopoverHideTimer = useCallback(() => {
    if (durationHidePopoverTimerRef.current != null) {
      window.clearTimeout(durationHidePopoverTimerRef.current);
      durationHidePopoverTimerRef.current = null;
    }
  }, []);

  const scheduleDurationPopoverHide = useCallback(() => {
    clearDurationPopoverHideTimer();
    durationHidePopoverTimerRef.current = window.setTimeout(() => {
      durationHidePopoverTimerRef.current = null;
      durationPopoverRef.current?.hidePopover();
    }, 120);
  }, [clearDurationPopoverHideTimer]);

  const positionDurationHintPopover = useCallback(() => {
    const pop = durationPopoverRef.current;
    const anchor = durationAnchorRef.current;
    if (!pop || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    const leftCenter = r.left + r.width / 2;
    pop.style.setProperty("position", "fixed");
    pop.style.setProperty("top", `${r.bottom + margin}px`);
    pop.style.setProperty("left", `${leftCenter}px`);
    pop.style.setProperty("transform", "translateX(-50%)");
    void pop.offsetWidth;
    const pr = pop.getBoundingClientRect();
    const halfW = pr.width / 2;
    const clampedLeft = Math.min(
      window.innerWidth - margin - halfW,
      Math.max(margin + halfW, leftCenter),
    );
    pop.style.setProperty("left", `${clampedLeft}px`);
  }, []);

  const showDurationHintPopover = useCallback(() => {
    clearDurationPopoverHideTimer();
    const pop = durationPopoverRef.current;
    if (!pop) return;
    if (!pop.matches(":popover-open")) {
      pop.showPopover();
    } else {
      requestAnimationFrame(() => positionDurationHintPopover());
    }
  }, [clearDurationPopoverHideTimer, positionDurationHintPopover]);

  useEffect(() => {
    return () => clearDurationPopoverHideTimer();
  }, [clearDurationPopoverHideTimer]);

  useEffect(() => {
    const pop = durationPopoverRef.current;
    if (!pop) return;
    const onToggle = (e: Event) => {
      const te = e as ToggleEvent;
      if (te.newState === "open") {
        setDurationHintDescribedBy(durationHelpId);
        requestAnimationFrame(() => positionDurationHintPopover());
      } else {
        setDurationHintDescribedBy(undefined);
      }
    };
    pop.addEventListener("toggle", onToggle);
    return () => pop.removeEventListener("toggle", onToggle);
  }, [durationHelpId, positionDurationHintPopover]);

  useEffect(() => {
    const onResize = () => {
      if (durationPopoverRef.current?.matches(":popover-open")) {
        positionDurationHintPopover();
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [positionDurationHintPopover]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const pop = durationPopoverRef.current;
      if (pop?.matches(":popover-open")) {
        pop.hidePopover();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const endDisplayMs = finishEndUserEdited ? draftEndMs : effectiveEndMs;
  const pausedTotal = totalPausedMsForDisplay({
    pausedMsAccumulated,
    pauseStartedAtMs,
    atMs: pauseReferenceAtMs,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full min-w-0 gap-3" role="group" aria-label="Session time summary">
        <div
          className={`${finishDialogTimeCardShellClass} flex min-h-0 min-w-0 flex-[2] flex-col justify-center overflow-hidden`}
          style={finishDialogTimeCardSurface}
        >
          <div className="flex min-h-0 w-full min-w-0 flex-row items-stretch gap-4 sm:gap-5">
            <WorkSessionFinishModalTimeHalf
              label="Started at"
              valueMs={draftStartMs}
              pending={savePending}
              ariaLabel="Edit session start time"
              onCommit={(ms) => {
                onDraftStartChange(ms);
              }}
            />
            <WorkSessionFinishModalTimeHalf
              label="Finished at"
              valueMs={endDisplayMs}
              pending={savePending}
              ariaLabel="Edit session end time"
              onBeforeOpenEdit={onEndEditBegin}
              onCommit={(ms) => {
                onDraftEndChange(ms);
              }}
            />
          </div>
        </div>
        <div
          className={`${finishDialogTimeCardShellClass} flex min-w-0 flex-1 flex-col items-center justify-center text-center`}
          style={finishDialogTimeCardSurface}
        >
          <div
            ref={durationAnchorRef}
            tabIndex={0}
            role="group"
            aria-label={`Duration, ${durationRoundedLabel}`}
            aria-describedby={durationHintDescribedBy}
            className="flex min-w-0 flex-col items-center justify-center rounded-[var(--app-radius)] px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-focus)_40%,transparent)]"
            onPointerEnter={showDurationHintPopover}
            onPointerLeave={scheduleDurationPopoverHide}
            onFocus={() => {
              clearDurationPopoverHideTimer();
              showDurationHintPopover();
            }}
            onBlur={scheduleDurationPopoverHide}
          >
            <p className={workMiniCardLabel}>Duration</p>
            <p
              className={`mt-1 text-center ${sessionTimeEditTypographyWorkMiniCardText}`}
              style={{ color: "var(--app-text)" }}
            >
              {durationRoundedLabel}
            </p>
          </div>
          <div
            ref={durationPopoverRef}
            id={durationHelpId}
            popover="manual"
            role="tooltip"
            className="z-[300] m-0 max-w-[min(16rem,calc(100vw-1rem))] border px-3 py-2 text-start text-xs leading-snug text-muted-canvas shadow-lg"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
            }}
            onPointerEnter={clearDurationPopoverHideTimer}
            onPointerLeave={scheduleDurationPopoverHide}
          >
            {finishModalDurationHelpText}
          </div>
        </div>
      </div>
      {pausedTotal > 0 ? (
        <p className="text-xs text-muted-canvas">
          Paused (total): {formatElapsedTimerMs(pausedTotal)}
        </p>
      ) : null}
    </div>
  );
}

/** Finish flow for an active timer whose task is not in the current task list (another integration/project). */
function OffListWorkSessionFinishDialog({
  taskId,
  taskTitle,
  integrationLabel,
  projectLabel,
  activeSession,
  dialogRef,
  onSuccess,
}: {
  taskId: string;
  taskTitle: string;
  integrationLabel: string;
  projectLabel: string;
  activeSession: ActiveWorkSessionDTO;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onSuccess: () => void | Promise<void>;
}) {
  const [pausedMsAccumulated, setPausedMsAccumulated] = useState(activeSession.paused_ms_accumulated);
  const [pauseStartedAtMs, setPauseStartedAtMs] = useState<number | null>(
    activeSession.pause_started_at ? new Date(activeSession.pause_started_at).getTime() : null,
  );
  const [workAccomplished, setWorkAccomplished] = useState("");
  const [finishError, setFinishError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState<"session" | "complete" | null>(null);
  const [finishDraftStartMs, setFinishDraftStartMs] = useState<number | null>(() => {
    const t = new Date(activeSession.started_at).getTime();
    return Number.isNaN(t) ? null : t;
  });
  const [finishDraftEndMs, setFinishDraftEndMs] = useState<number | null>(null);
  const [finishEndUserEdited, setFinishEndUserEdited] = useState(false);
  const [finishModalTick, setFinishModalTick] = useState(0);

  useEffect(() => {
    const t = new Date(activeSession.started_at).getTime();
    setFinishDraftStartMs(Number.isNaN(t) ? null : t);
    setPausedMsAccumulated(activeSession.paused_ms_accumulated);
    setPauseStartedAtMs(
      activeSession.pause_started_at ? new Date(activeSession.pause_started_at).getTime() : null,
    );
    setFinishDraftEndMs(null);
    setFinishEndUserEdited(false);
    setWorkAccomplished("");
    setFinishError(null);
  }, [
    activeSession.started_at,
    activeSession.paused_ms_accumulated,
    activeSession.pause_started_at,
  ]);

  useEffect(() => {
    if (finishDraftStartMs == null) {
      setFinishModalTick(0);
      return;
    }
    if (finishEndUserEdited) return;
    setFinishModalTick(Date.now());
    const id = window.setInterval(() => setFinishModalTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [finishDraftStartMs, finishEndUserEdited]);

  async function confirmFinish(completeTask: boolean) {
    if (finishDraftStartMs == null) return;
    setFinishError(null);
    const effectiveEndMs = finishEndUserEdited ? (finishDraftEndMs ?? finishModalTick) : (finishModalTick || Date.now());
    const draftStart = finishDraftStartMs;
    const elapsed = activeSessionElapsedMs({
      startMs: draftStart,
      endMs: effectiveEndMs,
      pausedMsAccumulated,
      pauseStartedAtMs,
    });
    if (effectiveEndMs <= draftStart) {
      setFinishError("End time must be after start time");
      return;
    }
    if (elapsed <= 0) {
      setFinishError("Duration after pauses must be greater than zero");
      return;
    }
    setSavePending(completeTask ? "complete" : "session");
    const rounded = roundDurationMsTo15MinBands(elapsed);
    const hours = roundedMsToDurationHours(rounded);
    const startedAtIso = new Date(draftStart).toISOString();
    const finishedAtIso = new Date(effectiveEndMs).toISOString();
    const notes = workAccomplished.trim();
    try {
      const res = await createIntegrationTaskWorkSession(taskId, {
        started_at: startedAtIso,
        finished_at: finishedAtIso,
        duration_hours: hours,
        work_accomplished: notes === "" ? null : notes,
        complete_task: completeTask,
      });
      if (res?.error) {
        setFinishError(res.error);
        return;
      }
      dialogRef.current?.close();
      await onSuccess();
    } finally {
      setSavePending(null);
    }
  }

  const finishModalOpen = finishDraftStartMs != null;
  const effectiveFinishEndMs = finishEndUserEdited ? (finishDraftEndMs ?? Date.now()) : (finishModalTick || Date.now());
  const modalElapsedForFinish = finishModalOpen
    ? activeSessionElapsedMs({
        startMs: finishDraftStartMs,
        endMs: effectiveFinishEndMs,
        pausedMsAccumulated,
        pauseStartedAtMs,
      })
    : 0;
  const modalDurationRoundedLabel = finishModalOpen
    ? formatRoundedHoursLabelFromRoundedMs(roundDurationMsTo15MinBands(modalElapsedForFinish))
    : "";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="off-list-work-finish-title"
      className={`${dialogBaseClass} w-[min(100vw-2rem,40rem)] max-w-[calc(100vw-2rem)] p-0 overflow-hidden`}
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
    >
      <div className="flex max-h-[min(92dvh,44rem)] flex-col overflow-hidden">
        <WorkSessionFinishModalHeader
          titleId="off-list-work-finish-title"
          projectLabel={projectLabel}
          integrationLabel={integrationLabel}
          onClose={() => dialogRef.current?.close()}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <WorkSessionFinishModalTaskTitle taskTitle={taskTitle} />
            {finishModalOpen && finishDraftStartMs != null ? (
              <WorkSessionFinishTimeSection
                draftStartMs={finishDraftStartMs}
                draftEndMs={finishDraftEndMs ?? effectiveFinishEndMs}
                effectiveEndMs={finishModalTick || Date.now()}
                pauseReferenceAtMs={effectiveFinishEndMs}
                finishEndUserEdited={finishEndUserEdited}
                onDraftStartChange={setFinishDraftStartMs}
                onDraftEndChange={(ms) => {
                  setFinishDraftEndMs(ms);
                  setFinishEndUserEdited(true);
                }}
                onEndEditBegin={() => {
                  setFinishEndUserEdited(true);
                  setFinishDraftEndMs(finishModalTick || Date.now());
                }}
                pausedMsAccumulated={pausedMsAccumulated}
                pauseStartedAtMs={pauseStartedAtMs}
                durationRoundedLabel={modalDurationRoundedLabel}
                savePending={savePending !== null}
              />
            ) : null}
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
              Work accomplished
              <textarea
                value={workAccomplished}
                onChange={(e) => setWorkAccomplished(e.target.value)}
                rows={3}
                placeholder="What did you accomplish?"
                className="input-canvas resize-y text-sm"
                style={{ color: "var(--app-text)" }}
              />
            </label>
            {finishError ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {finishError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-ghost text-sm"
                disabled={savePending !== null}
                onClick={() => dialogRef.current?.close()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-cta text-sm"
                disabled={savePending !== null || !finishModalOpen}
                onClick={() => void confirmFinish(false)}
              >
                {savePending === "session" ? "Saving…" : "Save Session"}
              </button>
              <button
                type="button"
                className="btn-cta-dark text-sm"
                disabled={savePending !== null || !finishModalOpen}
                onClick={() => void confirmFinish(true)}
              >
                {savePending === "complete" ? "Saving…" : "Save Session & Complete Task"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function TaskWorkRow({
  taskId,
  taskTitle,
  finishSessionIntegrationLabel,
  finishSessionProjectLabel,
  activeSession,
  onActiveSessionChange,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  finishSessionIntegrationLabel: string;
  finishSessionProjectLabel: string;
  activeSession: ActiveWorkSessionDTO;
  onActiveSessionChange: (session: ActiveWorkSessionDTO) => void;
  onClose: () => void | Promise<void>;
}) {
  const [startMs, setStartMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pausedMsAccumulated, setPausedMsAccumulated] = useState(0);
  const [pauseStartedAtMs, setPauseStartedAtMs] = useState<number | null>(null);
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const finishDialogRef = useRef<HTMLDialogElement>(null);
  const [workAccomplished, setWorkAccomplished] = useState("");
  const [finishError, setFinishError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState<"session" | "complete" | null>(null);
  /** Non-null while finish dialog is open (draft start/end for save). */
  const [finishDraftStartMs, setFinishDraftStartMs] = useState<number | null>(null);
  const [finishDraftEndMs, setFinishDraftEndMs] = useState<number | null>(null);
  const [finishEndUserEdited, setFinishEndUserEdited] = useState(false);
  /** Ticks while the finish dialog is open so live "Finished at" and rounded duration stay current until the user edits end. */
  const [finishModalTick, setFinishModalTick] = useState(0);
  const [pauseSyncError, setPauseSyncError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [startTimeEditError, setStartTimeEditError] = useState<string | null>(null);

  useEffect(() => {
    setStartMs(new Date(activeSession.started_at).getTime());
    setPausedMsAccumulated(activeSession.paused_ms_accumulated);
    setPauseStartedAtMs(
      activeSession.pause_started_at ? new Date(activeSession.pause_started_at).getTime() : null,
    );
    setNowMs(Date.now());
    setPauseSyncError(null);
  }, [
    taskId,
    activeSession.started_at,
    activeSession.paused_ms_accumulated,
    activeSession.pause_started_at,
  ]);

  const isPaused = pauseStartedAtMs != null;

  function getElapsedMs(at: number): number {
    if (startMs == null) return 0;
    return activeSessionElapsedMs({
      startMs,
      endMs: at,
      pausedMsAccumulated,
      pauseStartedAtMs,
    });
  }

  useEffect(() => {
    if (startMs == null) return;
    if (isPaused) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startMs, isPaused]);

  const elapsedMs = getElapsedMs(nowMs);
  const durationLive = formatElapsedTimerMs(elapsedMs);

  async function commitInRowStartTime(ms: number) {
    setStartTimeEditError(null);
    if (ms > Date.now() + 120_000) {
      setStartTimeEditError("Start time cannot be in the future");
      return false;
    }
    const res = await updateActiveWorkSessionStartedAt(taskId, new Date(ms).toISOString());
    if (res?.error) {
      setStartTimeEditError(res.error);
      return false;
    }
    if (res?.session) onActiveSessionChange(res.session);
    return true;
  }

  async function togglePause() {
    const now = Date.now();
    const wasPaused = pauseStartedAtMs != null;
    const prevAccum = pausedMsAccumulated;
    const prevPauseStart = pauseStartedAtMs;
    setPauseSyncError(null);
    if (wasPaused) {
      setPausedMsAccumulated((a) => a + (now - pauseStartedAtMs));
      setPauseStartedAtMs(null);
    } else {
      setPauseStartedAtMs(now);
    }
    setNowMs(now);
    const direction = wasPaused ? "resume" : "pause";
    const res = await syncActiveWorkSessionPause(taskId, direction);
    if (res?.error) {
      setPausedMsAccumulated(prevAccum);
      setPauseStartedAtMs(prevPauseStart);
      setNowMs(Date.now());
      setPauseSyncError(res.error);
      return;
    }
    if (res?.session) onActiveSessionChange(res.session);
  }

  useEffect(() => {
    if (finishDraftStartMs == null) {
      setFinishModalTick(0);
      return;
    }
    if (finishEndUserEdited) return;
    setFinishModalTick(Date.now());
    const id = window.setInterval(() => setFinishModalTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [finishDraftStartMs, finishEndUserEdited]);

  function openFinishModal() {
    if (startMs == null) return;
    setFinishDraftStartMs(startMs);
    setFinishDraftEndMs(Date.now());
    setFinishEndUserEdited(false);
    setWorkAccomplished("");
    setFinishError(null);
    requestAnimationFrame(() => finishDialogRef.current?.showModal());
  }

  async function confirmFinish(completeTask: boolean) {
    if (finishDraftStartMs == null || startMs == null) return;
    setFinishError(null);
    const effectiveEndMs = finishEndUserEdited ? (finishDraftEndMs ?? finishModalTick) : (finishModalTick || Date.now());
    const draftStart = finishDraftStartMs;
    const elapsed = activeSessionElapsedMs({
      startMs: draftStart,
      endMs: effectiveEndMs,
      pausedMsAccumulated,
      pauseStartedAtMs,
    });
    if (effectiveEndMs <= draftStart) {
      setFinishError("End time must be after start time");
      return;
    }
    if (elapsed <= 0) {
      setFinishError("Duration after pauses must be greater than zero");
      return;
    }
    setSavePending(completeTask ? "complete" : "session");
    const rounded = roundDurationMsTo15MinBands(elapsed);
    const hours = roundedMsToDurationHours(rounded);
    const startedAtIso = new Date(draftStart).toISOString();
    const finishedAtIso = new Date(effectiveEndMs).toISOString();
    const notes = workAccomplished.trim();
    try {
      const res = await createIntegrationTaskWorkSession(taskId, {
        started_at: startedAtIso,
        finished_at: finishedAtIso,
        duration_hours: hours,
        work_accomplished: notes === "" ? null : notes,
        complete_task: completeTask,
      });
      if (res?.error) {
        setFinishError(res.error);
        return;
      }
      finishDialogRef.current?.close();
      await onClose();
    } finally {
      setSavePending(null);
    }
  }

  if (startMs == null) return null;

  const finishModalOpen = finishDraftStartMs != null;
  const effectiveFinishEndMs = finishEndUserEdited ? (finishDraftEndMs ?? Date.now()) : (finishModalTick || Date.now());
  const modalElapsedForFinish = finishModalOpen
    ? activeSessionElapsedMs({
        startMs: finishDraftStartMs,
        endMs: effectiveFinishEndMs,
        pausedMsAccumulated,
        pauseStartedAtMs,
      })
    : 0;
  const modalDurationRoundedLabel = finishModalOpen
    ? formatRoundedHoursLabelFromRoundedMs(roundDurationMsTo15MinBands(modalElapsedForFinish))
    : "";

  return (
    <>
      <div
        className="integration-task-row border"
        style={{
          borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)",
          background: "var(--app-info-surface)",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[var(--app-info)]"
              style={{
                borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)",
                background: "color-mix(in oklab, var(--app-info) 8%, var(--app-surface) 92%)",
              }}
              aria-hidden
            >
              <WorkOnTaskIcon />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
                  Working on
                </p>
                <p
                  className="mt-0.5 inline-block w-fit max-w-full break-words leading-snug font-medium"
                  style={{ color: "var(--app-text)" }}
                >
                  {taskTitle}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:shrink-0">
                <WorkSessionStartedAtMiniCard
                  valueMs={startMs}
                  ariaLabel="Edit session start time"
                  onCommit={(ms) => commitInRowStartTime(ms)}
                />
                <div className={integrationTaskWorkDurationMiniCardClass} style={workMiniCardSurface}>
                  <div className={workMiniCardLabel}>Duration</div>
                  <div className={workMiniCardValue} style={{ color: "var(--app-text)" }}>
                    {durationLive}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1 sm:items-end">
            <div className="flex flex-wrap items-stretch justify-end gap-2">
              <button
                type="button"
                className="btn-ghost w-[5.25rem] shrink-0 justify-center gap-1 px-2 py-1.5 text-xs font-medium leading-[1.25]"
                onClick={() => void togglePause()}
                aria-pressed={isPaused}
              >
                {isPaused ? (
                  <>
                    <ResumeIcon />
                    Resume
                  </>
                ) : (
                  <>
                    <PauseIcon />
                    Pause
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-xs font-medium leading-[1.25]"
                onClick={() => discardDialogRef.current?.showModal()}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn-cta-dark px-3 py-1.5 text-xs font-medium leading-[1.25] !text-xs"
                onClick={openFinishModal}
              >
                Finish
              </button>
            </div>
            {pauseSyncError ? (
              <p className="max-w-full text-right text-xs break-words" style={{ color: "var(--app-danger)" }} role="alert">
                {pauseSyncError}
              </p>
            ) : null}
            {startTimeEditError ? (
              <p className="max-w-full text-right text-xs break-words" style={{ color: "var(--app-danger)" }} role="alert">
                {startTimeEditError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <dialog
        ref={discardDialogRef}
        aria-labelledby="task-work-discard-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id="task-work-discard-title" className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Discard this work session?
          </h2>
          <p className="text-sm text-muted-canvas">Your timer will stop and this session will not be saved.</p>
          {discardError ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {discardError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => discardDialogRef.current?.close()}>
              Continue
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium cursor-pointer bg-[var(--app-danger)] text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)]"
              onClick={() => {
                setDiscardError(null);
                void (async () => {
                  const res = await discardActiveWorkSession(taskId);
                  if (res?.error) {
                    setDiscardError(res.error);
                    return;
                  }
                  discardDialogRef.current?.close();
                  await onClose();
                })();
              }}
            >
              Discard
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={finishDialogRef}
        aria-labelledby="task-work-finish-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,40rem)] max-w-[calc(100vw-2rem)] p-0 overflow-hidden`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setFinishDraftStartMs(null);
          setFinishDraftEndMs(null);
          setFinishEndUserEdited(false);
        }}
      >
        <div className="flex max-h-[min(92dvh,44rem)] flex-col overflow-hidden">
          <WorkSessionFinishModalHeader
            titleId="task-work-finish-title"
            projectLabel={finishSessionProjectLabel}
            integrationLabel={finishSessionIntegrationLabel}
            onClose={() => finishDialogRef.current?.close()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <WorkSessionFinishModalTaskTitle taskTitle={taskTitle} />
              {finishModalOpen && finishDraftStartMs != null ? (
                <WorkSessionFinishTimeSection
                  draftStartMs={finishDraftStartMs}
                  draftEndMs={finishDraftEndMs ?? effectiveFinishEndMs}
                  effectiveEndMs={finishModalTick || Date.now()}
                  pauseReferenceAtMs={effectiveFinishEndMs}
                  finishEndUserEdited={finishEndUserEdited}
                  onDraftStartChange={setFinishDraftStartMs}
                  onDraftEndChange={(ms) => {
                    setFinishDraftEndMs(ms);
                    setFinishEndUserEdited(true);
                  }}
                  onEndEditBegin={() => {
                    setFinishEndUserEdited(true);
                    setFinishDraftEndMs(finishModalTick || Date.now());
                  }}
                  pausedMsAccumulated={pausedMsAccumulated}
                  pauseStartedAtMs={pauseStartedAtMs}
                  durationRoundedLabel={modalDurationRoundedLabel}
                  savePending={savePending !== null}
                />
              ) : null}
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                Work accomplished
                <textarea
                  value={workAccomplished}
                  onChange={(e) => setWorkAccomplished(e.target.value)}
                  rows={3}
                  placeholder="What did you accomplish?"
                  className="input-canvas resize-y text-sm"
                  style={{ color: "var(--app-text)" }}
                />
              </label>
              {finishError ? (
                <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                  {finishError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  disabled={savePending !== null}
                  onClick={() => finishDialogRef.current?.close()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-cta text-sm"
                  disabled={savePending !== null || !finishModalOpen}
                  onClick={() => void confirmFinish(false)}
                >
                  {savePending === "session" ? "Saving…" : "Save Session"}
                </button>
                <button
                  type="button"
                  className="btn-cta-dark text-sm"
                  disabled={savePending !== null || !finishModalOpen}
                  onClick={() => void confirmFinish(true)}
                >
                  {savePending === "complete" ? "Saving…" : "Save Session & Complete Task"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Modal shell for managing an active work session from integration/project list rows (same controls + nested discard/finish dialogs as `TaskWorkRow`). */
export function ActiveWorkSessionDialog({
  dialogRef,
  taskId,
  taskTitle,
  integrationLabel,
  projectLabel,
  activeSession,
  onActiveSessionChange,
  onAfterSessionCleared,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  taskId: string;
  taskTitle: string;
  integrationLabel: string;
  projectLabel: string;
  activeSession: ActiveWorkSessionDTO;
  onActiveSessionChange: (session: ActiveWorkSessionDTO) => void;
  onAfterSessionCleared: () => void | Promise<void>;
}) {
  const [startMs, setStartMs] = useState<number | null>(() => {
    const t = new Date(activeSession.started_at).getTime();
    return Number.isNaN(t) ? null : t;
  });
  /** `null` until after mount so first SSR/client pass match (avoid `Date.now()` hydration skew). */
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [pausedMsAccumulated, setPausedMsAccumulated] = useState(activeSession.paused_ms_accumulated);
  const [pauseStartedAtMs, setPauseStartedAtMs] = useState<number | null>(() =>
    activeSession.pause_started_at ? new Date(activeSession.pause_started_at).getTime() : null,
  );
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const finishDialogRef = useRef<HTMLDialogElement>(null);
  const [workAccomplished, setWorkAccomplished] = useState("");
  const [finishError, setFinishError] = useState<string | null>(null);
  const [savePending, setSavePending] = useState<"session" | "complete" | null>(null);
  const [finishDraftStartMs, setFinishDraftStartMs] = useState<number | null>(null);
  const [finishDraftEndMs, setFinishDraftEndMs] = useState<number | null>(null);
  const [finishEndUserEdited, setFinishEndUserEdited] = useState(false);
  const [finishModalTick, setFinishModalTick] = useState(0);
  const [pauseSyncError, setPauseSyncError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [startTimeEditError, setStartTimeEditError] = useState<string | null>(null);

  useEffect(() => {
    setStartMs(new Date(activeSession.started_at).getTime());
    setPausedMsAccumulated(activeSession.paused_ms_accumulated);
    setPauseStartedAtMs(
      activeSession.pause_started_at ? new Date(activeSession.pause_started_at).getTime() : null,
    );
    setNowMs(Date.now());
    setPauseSyncError(null);
  }, [
    taskId,
    activeSession.started_at,
    activeSession.paused_ms_accumulated,
    activeSession.pause_started_at,
  ]);

  const isPaused = pauseStartedAtMs != null;

  function getElapsedMs(at: number): number {
    if (startMs == null) return 0;
    return activeSessionElapsedMs({
      startMs,
      endMs: at,
      pausedMsAccumulated,
      pauseStartedAtMs,
    });
  }

  async function commitInRowStartTime(ms: number) {
    setStartTimeEditError(null);
    if (ms > Date.now() + 120_000) {
      setStartTimeEditError("Start time cannot be in the future");
      return false;
    }
    const res = await updateActiveWorkSessionStartedAt(taskId, new Date(ms).toISOString());
    if (res?.error) {
      setStartTimeEditError(res.error);
      return false;
    }
    if (res?.session) onActiveSessionChange(res.session);
    return true;
  }

  useLayoutEffect(() => {
    if (startMs == null) return;
    setNowMs(Date.now());
  }, [startMs]);

  useEffect(() => {
    if (startMs == null) return;
    if (isPaused) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startMs, isPaused]);

  const clockMs = nowMs ?? startMs ?? 0;
  const elapsedMs = getElapsedMs(clockMs);
  const durationLive = formatElapsedTimerMs(elapsedMs);

  async function togglePause() {
    const now = Date.now();
    const wasPaused = pauseStartedAtMs != null;
    const prevAccum = pausedMsAccumulated;
    const prevPauseStart = pauseStartedAtMs;
    setPauseSyncError(null);
    if (wasPaused) {
      setPausedMsAccumulated((a) => a + (now - pauseStartedAtMs));
      setPauseStartedAtMs(null);
    } else {
      setPauseStartedAtMs(now);
    }
    setNowMs(now);
    const direction = wasPaused ? "resume" : "pause";
    const res = await syncActiveWorkSessionPause(taskId, direction);
    if (res?.error) {
      setPausedMsAccumulated(prevAccum);
      setPauseStartedAtMs(prevPauseStart);
      setNowMs(Date.now());
      setPauseSyncError(res.error);
      return;
    }
    if (res?.session) onActiveSessionChange(res.session);
  }

  useEffect(() => {
    if (finishDraftStartMs == null) {
      setFinishModalTick(0);
      return;
    }
    if (finishEndUserEdited) return;
    setFinishModalTick(Date.now());
    const id = window.setInterval(() => setFinishModalTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [finishDraftStartMs, finishEndUserEdited]);

  function openFinishModal() {
    if (startMs == null) return;
    setFinishDraftStartMs(startMs);
    setFinishDraftEndMs(Date.now());
    setFinishEndUserEdited(false);
    setWorkAccomplished("");
    setFinishError(null);
    requestAnimationFrame(() => finishDialogRef.current?.showModal());
  }

  async function confirmFinish(completeTask: boolean) {
    if (finishDraftStartMs == null || startMs == null) return;
    setFinishError(null);
    const effectiveEndMs = finishEndUserEdited ? (finishDraftEndMs ?? finishModalTick) : (finishModalTick || Date.now());
    const draftStart = finishDraftStartMs;
    const elapsed = activeSessionElapsedMs({
      startMs: draftStart,
      endMs: effectiveEndMs,
      pausedMsAccumulated,
      pauseStartedAtMs,
    });
    if (effectiveEndMs <= draftStart) {
      setFinishError("End time must be after start time");
      return;
    }
    if (elapsed <= 0) {
      setFinishError("Duration after pauses must be greater than zero");
      return;
    }
    setSavePending(completeTask ? "complete" : "session");
    const rounded = roundDurationMsTo15MinBands(elapsed);
    const hours = roundedMsToDurationHours(rounded);
    const startedAtIso = new Date(draftStart).toISOString();
    const finishedAtIso = new Date(effectiveEndMs).toISOString();
    const notes = workAccomplished.trim();
    try {
      const res = await createIntegrationTaskWorkSession(taskId, {
        started_at: startedAtIso,
        finished_at: finishedAtIso,
        duration_hours: hours,
        work_accomplished: notes === "" ? null : notes,
        complete_task: completeTask,
      });
      if (res?.error) {
        setFinishError(res.error);
        return;
      }
      finishDialogRef.current?.close();
      dialogRef.current?.close();
      await onAfterSessionCleared();
    } finally {
      setSavePending(null);
    }
  }

  const finishModalOpen = finishDraftStartMs != null;
  const effectiveFinishEndMs = finishEndUserEdited ? (finishDraftEndMs ?? Date.now()) : (finishModalTick || Date.now());
  const modalElapsedForFinish = finishModalOpen
    ? activeSessionElapsedMs({
        startMs: finishDraftStartMs,
        endMs: effectiveFinishEndMs,
        pausedMsAccumulated,
        pauseStartedAtMs,
      })
    : 0;
  const modalDurationRoundedLabel = finishModalOpen
    ? formatRoundedHoursLabelFromRoundedMs(roundDurationMsTo15MinBands(modalElapsedForFinish))
    : "";

  if (startMs == null) return null;

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby="active-session-indicator-main-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,30rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setFinishDraftStartMs(null);
          setFinishDraftEndMs(null);
          setFinishEndUserEdited(false);
        }}
      >
        <div className="flex max-h-[min(92dvh,44rem)] flex-col overflow-hidden">
          <WorkSessionFinishModalHeader
            titleId="active-session-indicator-main-title"
            title="Active work session"
            projectLabel={projectLabel}
            integrationLabel={integrationLabel}
            onClose={() => dialogRef.current?.close()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <WorkSessionFinishModalTaskTitle taskTitle={taskTitle} />
              <div className="flex flex-col">
                <div className="flex w-full gap-3">
                  <WorkSessionStartedAtMiniCard
                    equalWidthInRow
                    valueMs={startMs}
                    ariaLabel="Edit session start time"
                    onCommit={(ms) => commitInRowStartTime(ms)}
                  />
                  <div className={activeSessionDialogTimerCardClass} style={workMiniCardSurface}>
                    <div className={workMiniCardLabel}>Duration</div>
                    <div className={workMiniCardValue} style={{ color: "var(--app-text)" }}>
                      {durationLive}
                    </div>
                  </div>
                </div>
                <div className="mt-10 flex w-full flex-col gap-1 sm:mt-12">
                  <div className="flex flex-wrap items-stretch justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost w-[5.25rem] shrink-0 justify-center gap-1 px-2 py-1.5 text-xs font-medium leading-[1.25]"
                      onClick={() => void togglePause()}
                      aria-pressed={isPaused}
                    >
                      {isPaused ? (
                        <>
                          <ResumeIcon />
                          Resume
                        </>
                      ) : (
                        <>
                          <PauseIcon />
                          Pause
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-xs font-medium leading-[1.25]"
                      onClick={() => discardDialogRef.current?.showModal()}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      className="btn-cta-dark px-3 py-1.5 text-xs font-medium leading-[1.25] !text-xs"
                      onClick={openFinishModal}
                    >
                      Finish
                    </button>
                  </div>
                  {pauseSyncError ? (
                    <p
                      className="max-w-full text-right text-xs break-words"
                      style={{ color: "var(--app-danger)" }}
                      role="alert"
                    >
                      {pauseSyncError}
                    </p>
                  ) : null}
                  {startTimeEditError ? (
                    <p
                      className="max-w-full text-right text-xs break-words"
                      style={{ color: "var(--app-danger)" }}
                      role="alert"
                    >
                      {startTimeEditError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </dialog>

      <dialog
        ref={discardDialogRef}
        aria-labelledby="active-session-indicator-discard-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id="active-session-indicator-discard-title" className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Discard this work session?
          </h2>
          <p className="text-sm text-muted-canvas">Your timer will stop and this session will not be saved.</p>
          {discardError ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {discardError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={() => discardDialogRef.current?.close()}>
              Continue
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium cursor-pointer bg-[var(--app-danger)] text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)]"
              onClick={() => {
                setDiscardError(null);
                void (async () => {
                  const res = await discardActiveWorkSession(taskId);
                  if (res?.error) {
                    setDiscardError(res.error);
                    return;
                  }
                  discardDialogRef.current?.close();
                  dialogRef.current?.close();
                  await onAfterSessionCleared();
                })();
              }}
            >
              Discard
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={finishDialogRef}
        aria-labelledby="active-session-indicator-finish-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,40rem)] max-w-[calc(100vw-2rem)] p-0 overflow-hidden`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setFinishDraftStartMs(null);
          setFinishDraftEndMs(null);
          setFinishEndUserEdited(false);
        }}
      >
        <div className="flex max-h-[min(92dvh,44rem)] flex-col overflow-hidden">
          <WorkSessionFinishModalHeader
            titleId="active-session-indicator-finish-title"
            projectLabel={projectLabel}
            integrationLabel={integrationLabel}
            onClose={() => finishDialogRef.current?.close()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <WorkSessionFinishModalTaskTitle taskTitle={taskTitle} />
              {finishModalOpen && finishDraftStartMs != null ? (
                <WorkSessionFinishTimeSection
                  draftStartMs={finishDraftStartMs}
                  draftEndMs={finishDraftEndMs ?? effectiveFinishEndMs}
                  effectiveEndMs={finishModalTick || Date.now()}
                  pauseReferenceAtMs={effectiveFinishEndMs}
                  finishEndUserEdited={finishEndUserEdited}
                  onDraftStartChange={setFinishDraftStartMs}
                  onDraftEndChange={(ms) => {
                    setFinishDraftEndMs(ms);
                    setFinishEndUserEdited(true);
                  }}
                  onEndEditBegin={() => {
                    setFinishEndUserEdited(true);
                    setFinishDraftEndMs(finishModalTick || Date.now());
                  }}
                  pausedMsAccumulated={pausedMsAccumulated}
                  pauseStartedAtMs={pauseStartedAtMs}
                  durationRoundedLabel={modalDurationRoundedLabel}
                  savePending={savePending !== null}
                />
              ) : null}
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                Work accomplished
                <textarea
                  value={workAccomplished}
                  onChange={(e) => setWorkAccomplished(e.target.value)}
                  rows={3}
                  placeholder="What did you accomplish?"
                  className="input-canvas resize-y text-sm"
                  style={{ color: "var(--app-text)" }}
                />
              </label>
              {finishError ? (
                <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                  {finishError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  disabled={savePending !== null}
                  onClick={() => finishDialogRef.current?.close()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-cta text-sm"
                  disabled={savePending !== null || !finishModalOpen}
                  onClick={() => void confirmFinish(false)}
                >
                  {savePending === "session" ? "Saving…" : "Save Session"}
                </button>
                <button
                  type="button"
                  className="btn-cta-dark text-sm"
                  disabled={savePending !== null || !finishModalOpen}
                  onClick={() => void confirmFinish(true)}
                >
                  {savePending === "complete" ? "Saving…" : "Save Session & Complete Task"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function IntegrationTasksPanel({
  projectIntegrationId,
  tasks,
  workSessionsByTaskId,
  activeWorkSession: activeWorkSessionProp,
  globalActiveWorkSession: globalActiveWorkSessionProp,
  globalActiveWorkSessionTaskTitle: globalActiveWorkSessionTaskTitleProp,
  globalActiveWorkSessionIntegrationLabel: globalActiveWorkSessionIntegrationLabelProp,
  globalActiveWorkSessionProjectName: globalActiveWorkSessionProjectNameProp,
  finishSessionIntegrationLabel = "",
  finishSessionProjectLabel = "",
  todayIso,
  className = "",
  onClientTaskSnapshotInvalidate,
}: {
  projectIntegrationId: string;
  tasks: IntegrationTaskRow[];
  workSessionsByTaskId: Record<string, IntegrationTaskWorkSessionRow[]>;
  activeWorkSession: ActiveWorkSessionDTO | null;
  /** Account-wide active timer (same DB row) whenever one exists. */
  globalActiveWorkSession: ActiveWorkSessionDTO | null;
  globalActiveWorkSessionTaskTitle: string | null;
  globalActiveWorkSessionIntegrationLabel: string | null;
  globalActiveWorkSessionProjectName: string | null;
  /** Integration display line for this panel (finish modal for in-list timers). */
  finishSessionIntegrationLabel?: string;
  /** Project customer name for this panel. */
  finishSessionProjectLabel?: string;
  todayIso: string;
  className?: string;
  /**
   * When this panel is fed from client-cached data (e.g. the project integrations “All Tasks” modal),
   * run after finish/discard/create/toggle-complete so props (`activeWorkSession`, `globalActiveWorkSession`, task list) match
   * the server before `router.refresh`. The integration detail page omits this and relies on RSC after refresh.
   */
  onClientTaskSnapshotInvalidate?: () => void | Promise<void>;
}) {
  const router = useRouter();

  const refreshTaskSnapshotAndRoute = useCallback(async () => {
    try {
      await onClientTaskSnapshotInvalidate?.();
    } finally {
      router.refresh();
    }
  }, [onClientTaskSnapshotInvalidate, router]);

  const [optimisticTasks, setOptimisticTasks] = useState<IntegrationTaskRow[]>(tasks);
  const [taskSortBy, setTaskSortBy] = useState<"due_date" | "priority" | "title">("due_date");

  useEffect(() => {
    setOptimisticTasks(tasks);
  }, [tasks]);

  const { activeTasks, completedTasks } = useMemo(() => {
    const compareBySort = (a: IntegrationTaskRow, b: IntegrationTaskRow): number => {
      if (taskSortBy === "priority") {
        const byPriority = sortTasksByPriority(a, b);
        if (byPriority !== 0) return byPriority;
        return sortTasksByDueDate(a, b);
      }
      if (taskSortBy === "title") {
        const byTitle = sortTasksByTitle(a, b);
        if (byTitle !== 0) return byTitle;
        return sortTasksByDueDate(a, b);
      }
      const byDueDate = sortTasksByDueDate(a, b);
      if (byDueDate !== 0) return byDueDate;
      return sortTasksByPriority(a, b);
    };

    const active = optimisticTasks.filter((t) => t.status !== "done");
    const completed = optimisticTasks.filter((t) => t.status === "done");
    active.sort(compareBySort);
    completed.sort(compareBySort);
    return { activeTasks: active, completedTasks: completed };
  }, [optimisticTasks, taskSortBy]);

  const [createState, createAction, createPending] = useActionState(
    async (_prev: { error?: string } | void, formData: FormData) => createIntegrationTask(projectIntegrationId, formData),
    {},
  );

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<IntegrationTaskRow["priority"]>("medium");
  const [dueDate, setDueDate] = useState(todayIso);
  const submitDidRunRef = useRef(false);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    syncAddTaskTitleHeight(titleTextareaRef.current);
  }, [title]);

  useEffect(() => {
    // Keep defaults aligned to server-provided today (useful if user leaves the page open).
    if (!submitDidRunRef.current) setDueDate(todayIso);
  }, [todayIso]);

  useEffect(() => {
    if (!submitDidRunRef.current) return;
    if (createPending) return;
    if (createState?.error) return;
    setTitle("");
    setPriority("medium");
    setDueDate(todayIso);
    submitDidRunRef.current = false;
    void refreshTaskSnapshotAndRoute();
  }, [createState, createPending, todayIso, refreshTaskSnapshotAndRoute]);

  const [activeWorkSession, setActiveWorkSession] = useState<ActiveWorkSessionDTO | null>(activeWorkSessionProp);

  useEffect(() => {
    setActiveWorkSession(activeWorkSessionProp);
  }, [
    activeWorkSessionProp?.integration_task_id,
    activeWorkSessionProp?.started_at,
    activeWorkSessionProp?.paused_ms_accumulated,
    activeWorkSessionProp?.pause_started_at,
  ]);

  const effectiveGlobalActiveTaskId = useMemo(
    () => activeWorkSession?.integration_task_id ?? globalActiveWorkSessionProp?.integration_task_id ?? null,
    [activeWorkSession?.integration_task_id, globalActiveWorkSessionProp?.integration_task_id],
  );

  const activeTimerIsOnAnotherTaskList = useMemo(
    () => effectiveGlobalActiveTaskId != null && activeWorkSession == null,
    [effectiveGlobalActiveTaskId, activeWorkSession],
  );

  const [expandedWorkTaskId, setExpandedWorkTaskId] = useState<string | null>(null);
  const [workSessionActionError, setWorkSessionActionError] = useState<string | null>(null);
  const [startWorkTaskId, setStartWorkTaskId] = useState<string | null>(null);
  const foreignWorkFinishDialogRef = useRef<HTMLDialogElement>(null);
  const [foreignFinishNonce, setForeignFinishNonce] = useState(0);

  useEffect(() => {
    const aid = activeWorkSession?.integration_task_id;
    if (!aid) {
      setExpandedWorkTaskId(null);
      return;
    }
    const t = optimisticTasks.find((x) => x.id === aid);
    if (!t || t.status === "done") {
      setExpandedWorkTaskId(null);
      return;
    }
    setExpandedWorkTaskId(aid);
  }, [activeWorkSession?.integration_task_id, optimisticTasks]);

  async function closeWorkRow() {
    setActiveWorkSession(null);
    setExpandedWorkTaskId(null);
    await refreshTaskSnapshotAndRoute();
  }

  async function afterOffListWorkSessionSaved() {
    await refreshTaskSnapshotAndRoute();
  }

  const [deleteDialogTask, setDeleteDialogTask] = useState<IntegrationTaskRow | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string } | void, formData: FormData) => {
      const id = String(formData.get("task_id") ?? "").trim();
      if (!id) return { error: "No task selected" };
      return deleteIntegrationTask(id);
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
  }, [deletePending, deleteState]);

  function openDeleteDialog(task: IntegrationTaskRow) {
    setDeleteDialogTask(task);
    requestAnimationFrame(() => deleteDialogRef.current?.showModal());
  }

  const [titleEdit, setTitleEdit] = useState<{ taskId: string; draft: string } | null>(null);
  const [titleEditError, setTitleEditError] = useState<string | null>(null);
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<string | null>(null);
  const [priorityEditError, setPriorityEditError] = useState<string | null>(null);
  const [prioritySavingTaskId, setPrioritySavingTaskId] = useState<string | null>(null);
  const priorityEditRootRef = useRef<HTMLDivElement | null>(null);
  const [dueDateSavingTaskId, setDueDateSavingTaskId] = useState<string | null>(null);
  const [dueDateEditError, setDueDateEditError] = useState<string | null>(null);
  const [historyDialogTask, setHistoryDialogTask] = useState<IntegrationTaskRow | null>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const [historyWorkEdit, setHistoryWorkEdit] = useState<{ sessionId: string; draft: string } | null>(null);
  const [historyWorkEditError, setHistoryWorkEditError] = useState<string | null>(null);
  const [historyWorkSavingSessionId, setHistoryWorkSavingSessionId] = useState<string | null>(null);
  const historyWorkEditRef = useRef<HTMLTextAreaElement | null>(null);
  const historyWorkCommitRef = useRef(false);
  const skipHistoryWorkBlurRef = useRef(false);
  const titleCommitRef = useRef(false);
  const skipTitleBlurRef = useRef(false);
  const titleRowEditRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!titleEdit) return;
    const el = titleRowEditRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    syncAddTaskTitleHeight(el);
  }, [titleEdit?.taskId]);

  useLayoutEffect(() => {
    if (!historyWorkEdit) return;
    const el = historyWorkEditRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [historyWorkEdit?.sessionId]);

  useEffect(() => {
    if (!priorityEditTaskId) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const root = priorityEditRootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node)) return;
      if (!root.contains(target)) setPriorityEditTaskId(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPriorityEditTaskId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [priorityEditTaskId]);

  async function commitTitleEdit(taskId: string, draftFromInput?: string) {
    const edit = titleEdit;
    if (!edit || edit.taskId !== taskId) return;
    if (titleCommitRef.current) return;
    const next = (draftFromInput ?? edit.draft).trim();
    const orig = optimisticTasks.find((x: IntegrationTaskRow) => x.id === taskId)?.title ?? "";
    if (next === orig) {
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
    setTitleEditError(null);
    setOptimisticTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, title: next } : row)));
    try {
      const res = await updateIntegrationTaskTitle(taskId, next);
      if (res?.error) {
        setOptimisticTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, title: orig } : row)));
        setTitleEditError(res.error);
        return;
      }
      setTitleEdit(null);
    } finally {
      titleCommitRef.current = false;
      router.refresh();
    }
  }

  function cancelTitleEdit() {
    skipTitleBlurRef.current = true;
    setTitleEdit(null);
    setTitleEditError(null);
  }

  async function commitPriorityEdit(taskId: string, nextPriority: IntegrationTaskRow["priority"]) {
    const task = optimisticTasks.find((x) => x.id === taskId);
    if (!task) return;
    if (task.priority === nextPriority) {
      setPriorityEditTaskId(null);
      return;
    }
    setPrioritySavingTaskId(taskId);
    setPriorityEditError(null);
    setOptimisticTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, priority: nextPriority } : row)));
    try {
      const res = await updateIntegrationTaskPriority(taskId, nextPriority);
      if (res?.error) {
        setOptimisticTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, priority: task.priority } : row)));
        setPriorityEditError(res.error);
        return;
      }
      setPriorityEditTaskId(null);
    } finally {
      setPrioritySavingTaskId(null);
      router.refresh();
    }
  }

  async function commitDueDateEdit(taskId: string, dueDateIso: string) {
    const task = optimisticTasks.find((x) => x.id === taskId);
    if (!task) return;
    const previousDueDate = task.due_date;
    setDueDateSavingTaskId(taskId);
    setDueDateEditError(null);
    setOptimisticTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, due_date: dueDateIso || null } : row)));
    const fd = new FormData();
    fd.set("due_date", dueDateIso);
    try {
      const res = await updateIntegrationTaskDueDate(taskId, fd);
      if (res?.error) {
        setOptimisticTasks((prev) => prev.map((row) => (row.id === taskId ? { ...row, due_date: previousDueDate } : row)));
        setDueDateEditError(res.error);
        return;
      }
    } finally {
      setDueDateSavingTaskId(null);
      router.refresh();
    }
  }

  function openHistoryDialog(task: IntegrationTaskRow) {
    setHistoryWorkEdit(null);
    setHistoryWorkEditError(null);
    setHistoryDialogTask(task);
    requestAnimationFrame(() => historyDialogRef.current?.showModal());
  }

  async function commitHistoryWorkEdit(sessionId: string, draftFromInput?: string) {
    const edit = historyWorkEdit;
    if (!edit || edit.sessionId !== sessionId) return;
    if (historyWorkCommitRef.current) return;

    const activeTaskId = historyDialogTask?.id ?? null;
    const sessionRows = activeTaskId ? (workSessionsByTaskId[activeTaskId] ?? []) : [];
    const sourceRow = sessionRows.find((row) => row.id === sessionId);
    if (!sourceRow) {
      setHistoryWorkEdit(null);
      return;
    }

    const next = (draftFromInput ?? edit.draft).trim();
    const orig = (sourceRow.work_accomplished ?? "").trim();
    if (next === orig) {
      setHistoryWorkEdit(null);
      setHistoryWorkEditError(null);
      return;
    }

    historyWorkCommitRef.current = true;
    setHistoryWorkEditError(null);
    setHistoryWorkSavingSessionId(sessionId);
    try {
      const res = await updateIntegrationTaskWorkSessionWorkAccomplished(sessionId, next === "" ? null : next);
      if (res?.error) {
        setHistoryWorkEditError(res.error);
        return;
      }
      setHistoryWorkEdit(null);
    } finally {
      historyWorkCommitRef.current = false;
      setHistoryWorkSavingSessionId(null);
      router.refresh();
    }
  }

  function cancelHistoryWorkEdit() {
    skipHistoryWorkBlurRef.current = true;
    setHistoryWorkEdit(null);
    setHistoryWorkEditError(null);
  }

  function renderTaskRow(t: IntegrationTaskRow) {
                const isDone = t.status === "done";
                const isThisActiveTimer = effectiveGlobalActiveTaskId === t.id;
                const hasAnotherActiveTimer = effectiveGlobalActiveTaskId != null && !isThisActiveTimer;
                const shouldDisableStartWork = startWorkTaskId === t.id || hasAnotherActiveTimer;
                if (expandedWorkTaskId === t.id && activeWorkSession?.integration_task_id === t.id) {
                  return (
                    <li key={t.id} className="min-w-0">
                      <TaskWorkRow
                        taskId={t.id}
                        taskTitle={t.title}
                        finishSessionIntegrationLabel={finishSessionIntegrationLabel}
                        finishSessionProjectLabel={finishSessionProjectLabel}
                        activeSession={activeWorkSession}
                        onActiveSessionChange={setActiveWorkSession}
                        onClose={closeWorkRow}
                      />
                    </li>
                  );
                }
                return (
                  <li key={t.id} className="min-w-0">
                    <div className="integration-task-row">
                      <div className="group">
                        <div className="flex items-center gap-3">
                          <div className="flex shrink-0 items-center">
                            <TaskCompleteButton taskId={t.id} isDone={isDone} onToggleSuccess={refreshTaskSnapshotAndRoute} />
                          </div>

                          <div className="min-w-0 flex-1">
                            {titleEdit?.taskId === t.id ? (
                              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  ref={titleRowEditRef}
                                  value={titleEdit.draft}
                                  rows={1}
                                  aria-label="Edit task title"
                                  className="input-canvas w-full min-w-0 resize-none text-sm leading-snug"
                                  style={{
                                    color: "var(--app-text)",
                                    maxHeight: `${ADD_TASK_TITLE_MAX_PX}px`,
                                  }}
                                  onChange={(e) => {
                                    setTitleEdit((prev) =>
                                      prev && prev.taskId === t.id ? { ...prev, draft: e.target.value } : prev,
                                    );
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
                                      void commitTitleEdit(t.id, titleRowEditRef.current?.value);
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
                                      void commitTitleEdit(t.id, titleRowEditRef.current?.value);
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
                                  setTitleEdit({ taskId: t.id, draft: t.title });
                                }}
                                onKeyDown={(e) => {
                                  if (isDone) return;
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTitleEditError(null);
                                    setTitleEdit({ taskId: t.id, draft: t.title });
                                  }
                                }}
                                role={isDone ? undefined : "button"}
                                tabIndex={isDone ? undefined : 0}
                              >
                                {t.title}
                              </p>
                            )}
                            {isDone ? (
                              <p className="mt-1 text-xs line-through" style={{ color: "#7d8b99" }}>
                                {formatDateDisplay(t.due_date)}
                              </p>
                            ) : (
                              <TaskDueDateInline
                                task={t}
                                pending={dueDateSavingTaskId === t.id}
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
                                      setWorkSessionActionError(null);
                                      setStartWorkTaskId(t.id);
                                      void (async () => {
                                        try {
                                          const res = await startOrReplaceActiveWorkSession(t.id);
                                          if (res.error) {
                                            setWorkSessionActionError(res.error);
                                            return;
                                          }
                                          if (res.session) {
                                            setActiveWorkSession(res.session);
                                            setExpandedWorkTaskId(t.id);
                                          }
                                        } finally {
                                          setStartWorkTaskId(null);
                                        }
                                      })();
                                    }}
                                  >
                                    <WorkOnTaskIcon />
                                    {startWorkTaskId === t.id ? "Starting…" : "Work on task"}
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  className="btn-cta inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap"
                                  title="View work history"
                                  aria-label="View work history"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openHistoryDialog(t);
                                  }}
                                >
                                  History
                                </button>

                                {isDone ? (
                                  <TaskUndoButton taskId={t.id} onUndoSuccess={refreshTaskSnapshotAndRoute} />
                                ) : null}

                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)]"
                                  style={{ borderColor: "var(--app-border)" }}
                                  title="Delete task"
                                  aria-label="Delete task"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteDialog(t);
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
                                  priorityEditTaskId === t.id ? (
                                    <div
                                      ref={priorityEditRootRef}
                                      className="w-[7rem]"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <CanvasSelect
                                        name={`priority-${t.id}`}
                                        options={taskPriorityOptions}
                                        value={t.priority}
                                        onValueChange={(value) => {
                                          if (value === "low" || value === "medium" || value === "high") {
                                            void commitPriorityEdit(t.id, value);
                                          }
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className={
                                        t.priority === "high"
                                          ? "integration-state-pill integration-state-pill--on_hold cursor-pointer"
                                          : `task-priority-pill task-priority-pill--${t.priority} cursor-pointer`
                                      }
                                      disabled={prioritySavingTaskId === t.id}
                                      aria-label="Edit priority"
                                      title="Click to edit priority"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPriorityEditError(null);
                                        setPriorityEditTaskId(t.id);
                                      }}
                                    >
                                      {prioritySavingTaskId === t.id
                                        ? "Saving…"
                                        : t.priority === "low"
                                          ? "Low"
                                          : t.priority === "medium"
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
                                      {formatCompletedOnDate(t.completed_at)}
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
                  </li>
                );
  }

  const historySessions = historyDialogTask ? (workSessionsByTaskId[historyDialogTask.id] ?? []) : [];
  const historyTotalMs = historySessions.reduce((acc, row) => acc + Number(row.duration_hours) * 3_600_000, 0);
  const historyTotalLabel = formatRoundedHoursLabelFromRoundedMs(historyTotalMs);

  return (
    <div className={`card-canvas flex h-full min-h-0 flex-col overflow-hidden p-3 ${className}`.trim()}>
      {activeTimerIsOnAnotherTaskList && globalActiveWorkSessionProp ? (
        <div
          className="mb-2 shrink-0 flex flex-col gap-2 rounded-md border px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          style={{
            borderColor: "color-mix(in oklab, var(--app-info) 35%, var(--app-border))",
            background: "color-mix(in oklab, var(--app-info) 6%, var(--app-surface))",
            color: "var(--app-text)",
          }}
          role="status"
        >
          <p className="min-w-0 text-xs leading-snug">
            You have an active working session elsewhere. To start working on a task in this list, use the button to save
            your work session.
          </p>
          <button
            type="button"
            className="btn-cta-tertiary shrink-0 text-sm whitespace-nowrap"
            title="Finish the active work session"
            aria-label="Finish the active work session"
            onClick={() => {
              setForeignFinishNonce((n) => n + 1);
              requestAnimationFrame(() => foreignWorkFinishDialogRef.current?.showModal());
            }}
          >
            Finish
          </button>
        </div>
      ) : null}
      {globalActiveWorkSessionProp && activeWorkSession == null ? (
        <OffListWorkSessionFinishDialog
          key={`${globalActiveWorkSessionProp.integration_task_id}-${foreignFinishNonce}`}
          taskId={globalActiveWorkSessionProp.integration_task_id}
          taskTitle={globalActiveWorkSessionTaskTitleProp ?? "Task"}
          integrationLabel={globalActiveWorkSessionIntegrationLabelProp ?? ""}
          projectLabel={globalActiveWorkSessionProjectNameProp ?? ""}
          activeSession={globalActiveWorkSessionProp}
          dialogRef={foreignWorkFinishDialogRef}
          onSuccess={afterOffListWorkSessionSaved}
        />
      ) : null}
      {workSessionActionError ? (
        <p className="mb-2 shrink-0 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
          {workSessionActionError}
        </p>
      ) : null}
      <form
        action={createAction}
        className="flex min-w-0 flex-col gap-2"
        onSubmit={() => {
          submitDidRunRef.current = true;
        }}
      >
        <div className="add-task-inline-row flex w-full min-w-0 flex-nowrap items-start gap-2 pb-0.5">
          <label
            className="canvas-select-field flex min-w-0 flex-1 flex-col gap-1 text-xs"
            style={{ color: "var(--app-text-muted)" }}
          >
            Title
            <textarea
              ref={titleTextareaRef}
              name="title"
              value={title}
              required
              rows={1}
              placeholder="What needs to be done"
              onChange={(e) => {
                setTitle(e.target.value);
                syncAddTaskTitleHeight(e.target);
              }}
              className="input-canvas w-full min-w-0 resize-none text-[0.6875rem] leading-snug placeholder:text-muted-canvas"
            />
          </label>

          <label
            className="canvas-select-field flex w-[6.75rem] shrink-0 flex-col gap-1 text-xs sm:w-[7rem]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Priority
            <CanvasSelect
              name="priority"
              options={taskPriorityOptions}
              value={priority}
              onValueChange={(v) => {
                if (v === "low" || v === "medium" || v === "high") setPriority(v);
              }}
            />
          </label>

          <label
            className="canvas-select-field flex w-fit min-w-0 max-w-full shrink-0 flex-col gap-1 text-xs"
            style={{ color: "var(--app-text-muted)" }}
          >
            Due
            <DueDatePickerControl
              variant="inline"
              name="due_date"
              todayIso={todayIso}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              quickSelectMode
            />
          </label>

          <div className="flex min-h-0 shrink-0 flex-col items-end">
            <div className="flex shrink-0 flex-col gap-1">
              <span className="select-none text-xs leading-normal text-transparent" aria-hidden="true">
                Title
              </span>
              <button
                type="submit"
                disabled={createPending}
                className="btn-cta-dark h-9 min-h-9 shrink-0 px-3 text-xs whitespace-nowrap"
              >
                {createPending ? "Adding…" : "Add task"}
              </button>
            </div>
          </div>
        </div>

        {createState?.error ? (
          <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
            {createState.error}
          </p>
        ) : null}
      </form>

      <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <h3
            className="flex flex-wrap items-baseline gap-x-2 text-sm font-normal"
            style={{ color: "var(--app-text-muted)" }}
          >
            <span>All Tasks</span>
            <span className="font-medium tabular-nums text-muted-canvas">({optimisticTasks.length})</span>
          </h3>
          <label className="flex items-center gap-2 text-xs text-muted-canvas">
            <span className="whitespace-nowrap">Sort by</span>
            <div className="task-sort-compact w-[8.5rem]">
              <CanvasSelect
                name="task_sort"
                options={taskSortOptions}
                value={taskSortBy}
                onValueChange={(value) => {
                  if (value === "due_date" || value === "priority" || value === "title") setTaskSortBy(value);
                }}
              />
            </div>
          </label>
        </div>
        {optimisticTasks.length === 0 ? (
          <p className="mt-3 min-h-0 flex-1 text-sm text-muted-canvas">No tasks yet.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-0">
            <ul className="mt-0 flex list-none flex-col gap-2.5">
              {activeTasks.length > 0 ? (
                <li key="open-tasks-heading" className="list-none">
                  <h4
                    className="flex flex-wrap items-baseline gap-x-2 text-xs font-normal"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    <span>Open</span>
                    <span className="font-medium tabular-nums text-muted-canvas">
                      ({activeTasks.length})
                    </span>
                  </h4>
                </li>
              ) : null}
              {activeTasks.map(renderTaskRow)}
              {completedTasks.length > 0 ? (
                <li key="completed-tasks-heading" className="list-none pt-2">
                  <h4
                    className="flex flex-wrap items-baseline gap-x-2 text-xs font-normal"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    <span>Completed</span>
                    <span className="font-medium tabular-nums text-muted-canvas">
                      ({completedTasks.length})
                    </span>
                  </h4>
                </li>
              ) : null}
              {completedTasks.map(renderTaskRow)}
            </ul>
          </div>
        )}
      </div>

      <dialog
        ref={historyDialogRef}
        aria-labelledby="task-work-history-title"
        className={`${dialogBaseClass} max-h-[min(98dvh,72rem)] w-[min(100vw-2rem,56rem)] max-w-[calc(100vw-2rem)] p-0 overflow-hidden`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setHistoryDialogTask(null);
          setHistoryWorkEdit(null);
          setHistoryWorkEditError(null);
        }}
      >
        <div className="flex max-h-[min(98dvh,72rem)] flex-col overflow-hidden">
          <WorkSessionFinishModalHeader
            titleId="task-work-history-title"
            title="Work history"
            projectLabel={finishSessionProjectLabel}
            integrationLabel={finishSessionIntegrationLabel}
            onClose={() => historyDialogRef.current?.close()}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {historyDialogTask ? (
              <div className="flex flex-col gap-3">
                <WorkSessionFinishModalTaskTitle taskTitle={historyDialogTask.title} />
                <div>
                  <p className={finishSessionContextLabelClass}>Total time</p>
                  <p className={finishSessionContextValueClass} style={{ color: "var(--app-text)" }}>
                    {historyTotalLabel}
                  </p>
                </div>
                {!historySessions.length ? (
                  <p className="text-sm text-muted-canvas">No work sessions yet.</p>
                ) : (
                  <div
                    className="overflow-x-auto rounded-[var(--app-radius)] border"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <table className="w-full min-w-[32rem] border-collapse text-sm">
                      <thead
                        className="sticky top-0 z-[1] border-b text-left text-xs font-medium text-muted-canvas"
                        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
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
                          const day = started.toLocaleDateString(undefined, { dateStyle: "medium" });
                          const startTime = started.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                          const finished = row.finished_at ? new Date(row.finished_at) : null;
                          const finishedTime =
                            finished && !Number.isNaN(finished.getTime())
                              ? finished.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                              : "—";
                          const durLabel = formatRoundedHoursLabelFromRoundedMs(Number(row.duration_hours) * 3_600_000);
                          return (
                            <tr
                              key={row.id}
                              className="border-b last:border-b-0"
                              style={{ borderColor: "var(--app-border)" }}
                            >
                              <td className="px-3 py-2.5 align-top tabular-nums" style={{ color: "var(--app-text)" }}>
                                {day}
                              </td>
                              <td className="px-3 py-2.5 align-top tabular-nums" style={{ color: "var(--app-text)" }}>
                                {startTime}
                              </td>
                              <td className="px-3 py-2.5 align-top tabular-nums" style={{ color: "var(--app-text)" }}>
                                {finishedTime}
                              </td>
                              <td className="px-3 py-2.5 align-top tabular-nums" style={{ color: "var(--app-text)" }}>
                                {durLabel}
                              </td>
                              <td className="max-w-[min(18rem,40vw)] px-3 py-2.5 align-top break-words text-muted-canvas">
                                {historyWorkEdit?.sessionId === row.id ? (
                                  <div className="min-w-0">
                                    <textarea
                                      ref={historyWorkEditRef}
                                      value={historyWorkEdit.draft}
                                      rows={2}
                                      aria-label="Edit work accomplished"
                                      className="input-canvas w-full min-w-0 resize-y text-sm leading-snug"
                                      style={{ color: "var(--app-text)" }}
                                      disabled={historyWorkSavingSessionId === row.id}
                                      onChange={(e) => {
                                        setHistoryWorkEdit((prev) =>
                                          prev && prev.sessionId === row.id ? { ...prev, draft: e.target.value } : prev,
                                        );
                                      }}
                                      onBlur={() => {
                                        window.setTimeout(() => {
                                          if (skipHistoryWorkBlurRef.current) {
                                            skipHistoryWorkBlurRef.current = false;
                                            return;
                                          }
                                          if (historyWorkCommitRef.current) return;
                                          void commitHistoryWorkEdit(row.id, historyWorkEditRef.current?.value);
                                        }, 0);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          e.preventDefault();
                                          cancelHistoryWorkEdit();
                                          return;
                                        }
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault();
                                          void commitHistoryWorkEdit(row.id, historyWorkEditRef.current?.value);
                                        }
                                      }}
                                    />
                                    {historyWorkEditError ? (
                                      <p className="mt-1 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
                                        {historyWorkEditError}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="w-full cursor-text rounded px-1 py-0.5 text-left text-sm leading-snug transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--app-info)]"
                                    title="Click to edit work accomplished"
                                    aria-label="Edit work accomplished"
                                    disabled={historyWorkSavingSessionId === row.id}
                                    onClick={() => {
                                      if (historyWorkSavingSessionId) return;
                                      setHistoryWorkEditError(null);
                                      setHistoryWorkEdit({ sessionId: row.id, draft: row.work_accomplished ?? "" });
                                    }}
                                  >
                                    {row.work_accomplished?.trim() ? (
                                      row.work_accomplished
                                    ) : (
                                      <span style={{ color: "var(--app-text-muted)" }}>Click to add…</span>
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        aria-labelledby="task-delete-title"
        className={`${dialogBaseClass} w-[min(100vw-2rem,36rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => setDeleteDialogTask(null)}
      >
        <div className="flex flex-col gap-4 p-5">
          <div>
            <h2 id="task-delete-title" className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
              Delete this task?
            </h2>
            <div className="mt-3">
              <WorkSessionFinishTaskContext
                taskTitle={deleteDialogTask?.title ?? ""}
                integrationLabel={finishSessionIntegrationLabel}
                projectLabel={finishSessionProjectLabel}
              />
            </div>
          </div>
          <WorkSessionFinishTaskContextSeparator />
          {deleteDialogTask ? (
            <div className="text-sm text-muted-canvas">
              <p>This permanently removes the task and its work session history from this integration.</p>
              <p className="mt-2">
                Due date: <span className="font-medium" style={{ color: "var(--app-text)" }}>{formatDateDisplay(deleteDialogTask.due_date)}</span>
              </p>
            </div>
          ) : null}

          {deleteState?.error ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {deleteState.error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" disabled={deletePending} onClick={() => deleteDialogRef.current?.close()}>
              Cancel
            </button>
            <form
              action={deleteAction}
              onSubmit={() => {
                deleteSubmitDidRunRef.current = true;
              }}
            >
              <input type="hidden" name="task_id" value={deleteDialogTask?.id ?? ""} />
              <button
                type="submit"
                className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--app-danger)", color: "var(--app-surface)" }}
                disabled={deletePending || !deleteDialogTask}
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  );
}
