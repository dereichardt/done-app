"use client";

import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  formatDurationFromSlots,
  slotToLocalDateTime,
  slotToTimeLabel,
} from "@/components/effort-calendar-grids";
import { defaultManualLogDayAndSlots } from "@/components/task-only-manual-log-dialog";
import {
  createTasksCalendarManualEntry,
  deleteTasksCalendarManualEntry,
  updateTasksCalendarManualEntry,
  type TasksCalendarSession,
} from "@/lib/actions/tasks-calendar";
import { localDayStart, parseLocalYmd } from "@/lib/integration-effort-buckets";
import { clearCalendarSessionCache } from "@/lib/tasks-calendar-session-cache";
import type { TasksPageProject, TasksPageTrack } from "@/lib/tasks-page-shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SLOT_MS = 15 * 60_000;

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function sessionToSlots(
  session: TasksCalendarSession,
  dayYmd: string,
): { startSlot: number; endSlot: number } {
  const dayStart = localDayStart(parseLocalYmd(dayYmd)).getTime();
  const startMs = new Date(session.started_at).getTime() - dayStart;
  const finishedAt = session.finished_at
    ? new Date(session.finished_at).getTime()
    : new Date(session.started_at).getTime();
  const endMs = finishedAt - dayStart;
  const startSlot = clamp(Math.round(startMs / SLOT_MS), 0, 95);
  const endSlot = clamp(Math.round(endMs / SLOT_MS), 1, 95);
  return { startSlot, endSlot: Math.max(endSlot, startSlot + 1) };
}

export type HomeCalendarEntryDialogProps = {
  open: boolean;
  todayIso: string;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
  /** When set, the dialog opens in edit mode for this manual session. */
  editSession?: TasksCalendarSession | null;
};

export function HomeCalendarEntryDialog({
  open,
  todayIso,
  projects,
  tracks,
  onClose,
  onCreated,
  editSession = null,
}: HomeCalendarEntryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);
  const isEdit = Boolean(editSession);
  const [dayYmd, setDayYmd] = useState(todayIso);
  const [startSlot, setStartSlot] = useState(0);
  const [endSlot, setEndSlot] = useState(2);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectTrackId, setProjectTrackId] = useState("");
  const [entryType, setEntryType] = useState<"meeting" | "task">("meeting");
  const [title, setTitle] = useState("");
  const [workAccomplished, setWorkAccomplished] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t] as const)), [tracks]);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const trackOptionsForProject = useCallback(
    (projectId: string): CanvasSelectOption[] =>
      tracks
        .filter((track) => track.projectId === projectId)
        .map((track) => ({ value: track.id, label: track.label })),
    [tracks],
  );

  const timeOptions = useMemo((): { start: CanvasSelectOption[]; end: CanvasSelectOption[] } => {
    const start: CanvasSelectOption[] = [];
    for (let i = 0; i < 96; i++) start.push({ value: String(i), label: slotToTimeLabel(i) });
    const end: CanvasSelectOption[] = [];
    for (let i = 1; i < 96; i++) end.push({ value: String(i), label: slotToTimeLabel(i) });
    return { start, end };
  }, []);

  const resolveDefaults = useCallback(() => {
    const slots = defaultManualLogDayAndSlots();
    const firstTrack = tracks[0] ?? null;
    return {
      dayYmd: todayIso || slots.dayYmd,
      startSlot: slots.startSlot,
      endSlot: slots.endSlot,
      selectedProjectId: firstTrack?.projectId ?? projects[0]?.id ?? "",
      projectTrackId: firstTrack?.id ?? "",
    };
  }, [projects, todayIso, tracks]);

  const closeDialog = useCallback(() => {
    deleteDialogRef.current?.close();
    dialogRef.current?.close();
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    deleteDialogRef.current?.close();
  }, []);

  const openDeleteConfirm = useCallback(() => {
    if (!editSession) return;
    setDeleteError(null);
    requestAnimationFrame(() => {
      if (!deleteDialogRef.current?.open) deleteDialogRef.current?.showModal();
    });
  }, [editSession]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      const d = resolveDefaults();
      if (editSession) {
        const slots = sessionToSlots(editSession, d.dayYmd);
        setDayYmd(d.dayYmd);
        setStartSlot(slots.startSlot);
        setEndSlot(slots.endSlot);
        setSelectedProjectId(editSession.project_id);
        setProjectTrackId(editSession.project_track_id);
        setEntryType(editSession.entry_type === "meeting" ? "meeting" : "task");
        setTitle(editSession.title ?? "");
        setWorkAccomplished(editSession.work_accomplished ?? "");
      } else {
        setDayYmd(d.dayYmd);
        setStartSlot(d.startSlot);
        setEndSlot(d.endSlot);
        setSelectedProjectId(d.selectedProjectId);
        setProjectTrackId(d.projectTrackId);
        setEntryType("meeting");
        setTitle("");
        setWorkAccomplished("");
      }
      setSaving(false);
      setError(null);
      setDeletePending(false);
      setDeleteError(null);
      requestAnimationFrame(() => {
        if (!dialogRef.current?.open) dialogRef.current?.showModal();
      });
    } else if (el.open) {
      deleteDialogRef.current?.close();
      el.close();
    }
  }, [open, resolveDefaults, editSession]);

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }
    if (!selectedProjectId) {
      setError("Choose a project");
      return;
    }
    if (!projectTrackId) {
      setError("Choose a track");
      return;
    }
    if (endSlot <= startSlot) {
      setError("End time must be after start time");
      return;
    }

    setSaving(true);
    setError(null);
    const started = slotToLocalDateTime(dayYmd, startSlot);
    const finished = slotToLocalDateTime(dayYmd, clamp(endSlot, 1, 95));
    const payload = {
      project_track_id: projectTrackId,
      entry_type: entryType,
      title: trimmedTitle,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      work_accomplished: workAccomplished.trim() ? workAccomplished.trim() : null,
    };
    try {
      const res =
        isEdit && editSession
          ? await updateTasksCalendarManualEntry({
              ...payload,
              manual_entry_id: editSession.source_id,
            })
          : await createTasksCalendarManualEntry(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      // Work calendar reads a client session cache; clear so the new entry is fetched
      // and remains editable/deletable there (same path as in-calendar creates).
      clearCalendarSessionCache();
      closeDialog();
      await onCreated?.();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!editSession) return;
    if (deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await deleteTasksCalendarManualEntry({
        manual_entry_id: editSession.source_id,
      });
      if (res.error) {
        setDeleteError(res.error);
        return;
      }
      clearCalendarSessionCache();
      deleteDialogRef.current?.close();
      closeDialog();
      await onCreated?.();
    } finally {
      setDeletePending(false);
    }
  }

  const subtitle =
    (projectById.get(selectedProjectId)?.name ?? "Project") +
    " · " +
    (trackById.get(projectTrackId)?.label ?? "Track");

  const deleteTitle = title.trim() || (entryType === "meeting" ? "Meeting" : "Task");
  const deleteDurationLabel = formatDurationFromSlots(startSlot, endSlot);

  return (
    <>
      <dialog
        ref={dialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,38rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
        onClose={(e) => {
          if (e.target !== dialogRef.current) return;
          deleteDialogRef.current?.close();
          onClose();
        }}
      >
        <div className="flex max-h-[min(calc(100dvh-2rem),44rem)] min-h-0 flex-col">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                {isEdit ? "Edit Entry" : "Add Task or Meeting"}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-canvas" title={subtitle}>
                {subtitle}
              </p>
            </div>
            <DialogCloseButton onClick={closeDialog} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-5">
            {open ? (
              <div className="grid grid-cols-1 gap-3">
                <label
                  className="canvas-select-field flex flex-col gap-1 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Project
                  <CanvasSelect
                    name="home_calendar_manual_entry_project"
                    options={
                      projectOptions.length > 0
                        ? projectOptions
                        : [{ value: "", label: "No projects available" }]
                    }
                    value={selectedProjectId}
                    onValueChange={(projectId) => {
                      const nextTrackId =
                        tracks.find((track) => track.projectId === projectId)?.id ?? "";
                      setSelectedProjectId(projectId);
                      setProjectTrackId(nextTrackId);
                      setError(null);
                    }}
                  />
                </label>

                <label
                  className="canvas-select-field flex flex-col gap-1 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Track
                  <CanvasSelect
                    name="home_calendar_manual_entry_track"
                    options={
                      trackOptionsForProject(selectedProjectId).length > 0
                        ? trackOptionsForProject(selectedProjectId)
                        : [{ value: "", label: "No tracks for selected project" }]
                    }
                    value={projectTrackId}
                    onValueChange={(v) => {
                      setProjectTrackId(v);
                      setSelectedProjectId(trackById.get(v)?.projectId ?? selectedProjectId);
                      setError(null);
                    }}
                  />
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="text-xs font-medium text-muted-canvas sm:flex-1">
                    Title
                    <input
                      className="input-canvas mt-1 h-9 w-full text-sm placeholder:text-sm placeholder:font-normal placeholder:text-muted-canvas"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setError(null);
                      }}
                      placeholder={entryType === "meeting" ? "e.g. Weekly sync" : "e.g. Fix auth bug"}
                      autoComplete="off"
                    />
                  </label>

                  <div className="flex flex-col gap-1 sm:shrink-0">
                    <p className="text-xs font-medium text-muted-canvas">Type</p>
                    <div
                      role="tablist"
                      aria-label="Manual entry type"
                      className="relative inline-flex overflow-visible rounded-[10px] border"
                      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px]"
                        style={{
                          width: 96,
                          transform: `translateX(${entryType === "meeting" ? 0 : 96}px)`,
                          transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
                          background: "var(--app-cta-dark-fill)",
                          boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
                        }}
                      />
                      <button
                        type="button"
                        role="tab"
                        aria-selected={entryType === "meeting"}
                        className={[
                          "relative z-[2] inline-flex h-9 w-24 cursor-pointer items-center justify-center rounded-l-[10px] px-3 text-center text-xs transition-colors",
                          entryType === "meeting"
                            ? "font-semibold text-[var(--app-cta-dark-fg)]"
                            : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                        ].join(" ")}
                        onClick={() => setEntryType("meeting")}
                      >
                        Meeting
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={entryType === "task"}
                        className={[
                          "relative z-[2] inline-flex h-9 w-24 cursor-pointer items-center justify-center rounded-r-[10px] px-3 text-center text-xs transition-colors",
                          entryType === "task"
                            ? "font-semibold text-[var(--app-cta-dark-fg)]"
                            : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                        ].join(" ")}
                        onClick={() => setEntryType("task")}
                      >
                        Task
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label
                    className="canvas-select-field flex flex-col gap-1 text-xs"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Start Time
                    <CanvasSelect
                      name="home_calendar_manual_entry_started_slot"
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
                      name="home_calendar_manual_entry_finished_slot"
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

                <label className="mt-7 text-xs font-medium text-muted-canvas">
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

                <div
                  className={
                    isEdit
                      ? "flex items-center justify-between gap-2 pt-1"
                      : "flex items-center justify-end gap-2 pt-1"
                  }
                >
                  {isEdit ? (
                    <button
                      type="button"
                      className="btn-ghost h-9 text-sm"
                      onClick={openDeleteConfirm}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost h-9 text-sm"
                      onClick={closeDialog}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-cta-dark h-9 text-sm"
                      onClick={() => void save()}
                      disabled={saving || tracks.length === 0}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[230] w-[min(100vw-2rem,26rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
        onClose={() => {
          setDeleteError(null);
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Delete this entry?
          </h2>
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium" style={{ color: "var(--app-text)" }}>
              {deleteTitle}
            </p>
            <p className="text-muted-canvas">{deleteDurationLabel}</p>
          </div>
          {deleteError ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost h-9 text-sm"
              disabled={deletePending}
              onClick={closeDeleteConfirm}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-[var(--app-radius)] bg-[var(--app-danger)] px-3 py-2 text-sm font-medium text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={deletePending || !editSession}
              onClick={() => void confirmDelete()}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
