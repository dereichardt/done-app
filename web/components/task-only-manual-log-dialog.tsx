"use client";

import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  formatDurationFromSlots,
  slotToLocalDateTime,
  slotToTimeLabel,
} from "@/components/effort-calendar-grids";
import { formatLocalYmd } from "@/lib/integration-effort-buckets";
import { createInternalTaskWorkSession } from "@/lib/actions/internal-tasks";
import { createTasksCalendarManualEntry } from "@/lib/actions/tasks-calendar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

/** Local calendar day + default 30-minute window aligned to quarter hours from “now”. */
export function defaultManualLogDayAndSlots(): { dayYmd: string; startSlot: number; endSlot: number } {
  const now = new Date();
  const dayYmd = formatLocalYmd(now);
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const startSlot = clamp(Math.floor(totalMinutes / 15), 0, 93);
  const endSlot = clamp(startSlot + 2, 1, 95);
  return { dayYmd, startSlot, endSlot };
}

export type TaskOnlyManualLogDialogProps = {
  open: boolean;
  /**
   * Calendar manual-entry parent: `project_tracks.id`, or an internal initiative id
   * (see `createTasksCalendarManualEntry`). Leave empty when `internalWorkSessionTaskId` is set.
   */
  projectTrackId?: string;
  /**
   * When set, records an `internal_task_work_sessions` row and completes the internal task
   * (Admin / Development / single internal track). Skips calendar manual-entry tables.
   */
  internalWorkSessionTaskId?: string | null;
  /** Shown under the title (e.g. project · integration or project · track). */
  subtitle: string;
  /** Prefilled task title (user may edit before save). */
  initialTitle: string;
  /** Task to mark done when the dialog confirms completion. */
  taskId: string;
  onClose: () => void;
  /** Marks the task complete after manual time is recorded. */
  onCompleteTask: (taskId: string) => Promise<{ error?: string }>;
  /** Called after a successful save+complete, before the dialog closes. */
  onSaved?: () => void | Promise<void>;
};

export function TaskOnlyManualLogDialog({
  open,
  projectTrackId = "",
  internalWorkSessionTaskId = null,
  subtitle,
  initialTitle,
  taskId,
  onClose,
  onCompleteTask,
  onSaved,
}: TaskOnlyManualLogDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dayYmd, setDayYmd] = useState(() => defaultManualLogDayAndSlots().dayYmd);
  const [startSlot, setStartSlot] = useState(0);
  const [endSlot, setEndSlot] = useState(2);
  const [title, setTitle] = useState("");
  const [workAccomplished, setWorkAccomplished] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeOptions = useMemo((): { start: CanvasSelectOption[]; end: CanvasSelectOption[] } => {
    const start: CanvasSelectOption[] = [];
    for (let i = 0; i < 96; i++) start.push({ value: String(i), label: slotToTimeLabel(i) });
    const end: CanvasSelectOption[] = [];
    for (let i = 1; i < 96; i++) end.push({ value: String(i), label: slotToTimeLabel(i) });
    return { start, end };
  }, []);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && (projectTrackId || internalWorkSessionTaskId)) {
      const d = defaultManualLogDayAndSlots();
      setDayYmd(d.dayYmd);
      setStartSlot(d.startSlot);
      setEndSlot(d.endSlot);
      setTitle(initialTitle);
      setWorkAccomplished("");
      setSaving(false);
      setError(null);
      requestAnimationFrame(() => {
        if (!dialogRef.current?.open) dialogRef.current?.showModal();
      });
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, projectTrackId, internalWorkSessionTaskId, initialTitle]);

  async function completeTask() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }
    if (endSlot <= startSlot) {
      setError("End time must be after start time");
      return;
    }
    const wsId = internalWorkSessionTaskId?.trim() ?? "";
    const trackOrInitiativeId = projectTrackId.trim();
    if (!wsId && !trackOrInitiativeId) return;
    if (!taskId) return;

    setSaving(true);
    setError(null);
    const started = slotToLocalDateTime(dayYmd, startSlot);
    const finished = slotToLocalDateTime(dayYmd, clamp(endSlot, 1, 95));
    try {
      if (wsId) {
        const durationMs = finished.getTime() - started.getTime();
        const rawHours = durationMs / 3_600_000;
        const duration_hours = Math.round(rawHours * 4) / 4;
        if (!Number.isFinite(duration_hours) || duration_hours <= 0) {
          setError("Invalid duration");
          return;
        }
        if (Math.abs(rawHours - duration_hours) > 1e-6) {
          setError("Duration must be in 15-minute increments");
          return;
        }
        const res = await createInternalTaskWorkSession(wsId, {
          started_at: started.toISOString(),
          finished_at: finished.toISOString(),
          duration_hours,
          work_accomplished: workAccomplished.trim() ? workAccomplished.trim() : null,
          complete_task: true,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        try {
          await onSaved?.();
        } finally {
          closeDialog();
        }
        return;
      }

      const res = await createTasksCalendarManualEntry({
        project_track_id: trackOrInitiativeId,
        entry_type: "task",
        title: trimmedTitle,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        work_accomplished: workAccomplished.trim() ? workAccomplished.trim() : null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      const completeRes = await onCompleteTask(taskId);
      if (completeRes?.error) {
        setError(completeRes.error);
        return;
      }
      try {
        await onSaved?.();
      } finally {
        closeDialog();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,38rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
      style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
      onClose={(e) => {
        if (e.target !== dialogRef.current) return;
        onClose();
      }}
    >
      <div className="flex max-h-[min(92dvh,44rem)] flex-col">
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
              Complete Task
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-canvas" title={subtitle}>
              {subtitle}
            </p>
          </div>
          <DialogCloseButton onClick={closeDialog} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {open && (projectTrackId || internalWorkSessionTaskId) ? (
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs font-medium text-muted-canvas">
                Title
                <input
                  className="input-canvas mt-1 h-9 w-full text-sm placeholder:text-sm placeholder:font-normal placeholder:text-muted-canvas"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. Fix auth bug"
                  autoComplete="off"
                />
              </label>

              <label className="text-xs font-medium text-muted-canvas">
                Date
                <input
                  type="date"
                  className="input-canvas mt-1 h-9 w-full text-sm"
                  value={dayYmd}
                  onChange={(e) => {
                    setDayYmd(e.target.value);
                    setError(null);
                  }}
                />
              </label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label
                  className="canvas-select-field flex flex-col gap-1 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Start Time
                  <CanvasSelect
                    name="task_only_manual_started_slot"
                    options={timeOptions.start}
                    value={String(startSlot)}
                    onValueChange={(v) => {
                      const nextStart = Number(v);
                      setStartSlot(nextStart);
                      setEndSlot((prev) => (prev <= nextStart ? Math.min(nextStart + 1, 95) : prev));
                      setError(null);
                    }}
                  />
                </label>
                <label
                  className="canvas-select-field flex flex-col gap-1 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  End Time
                  <CanvasSelect
                    name="task_only_manual_finished_slot"
                    options={timeOptions.end}
                    value={String(endSlot)}
                    onValueChange={(v) => {
                      setEndSlot(Number(v));
                      setError(null);
                    }}
                  />
                </label>
              </div>

              <p className="-mt-1 text-xs text-muted-canvas">
                Duration:{" "}
                <span className="font-medium" style={{ color: "var(--app-text)" }}>
                  {formatDurationFromSlots(startSlot, endSlot)}
                </span>
              </p>

              <label className="mt-2 text-xs font-medium text-muted-canvas">
                Work Accomplished
                <textarea
                  className="input-canvas mt-1 w-full resize-y p-2 text-sm"
                  rows={5}
                  value={workAccomplished}
                  onChange={(e) => {
                    setWorkAccomplished(e.target.value);
                    setError(null);
                  }}
                  placeholder="Optional"
                />
              </label>

              {error ? (
                <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost h-9 text-sm" onClick={closeDialog} disabled={saving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-cta-dark h-9 text-sm"
                  onClick={() => void completeTask()}
                  disabled={saving}
                >
                  {saving ? "Completing…" : "Complete Task"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
