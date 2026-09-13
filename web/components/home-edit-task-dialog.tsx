"use client";

import { CanvasSelect } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { SubtaskListEditor } from "@/components/subtask-list-editor";
import {
  ADD_TASK_TITLE_MAX_PX,
  DueDatePickerControl,
  syncAddTaskTitleHeight,
} from "@/components/task-row";
import { taskPriorityOptions, formatDateDisplay } from "@/lib/integration-task-helpers";
import type { TaskSubtask, TasksPageTask } from "@/lib/tasks-page-shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const dialogClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[220] max-h-[min(92dvh,52rem)] w-[min(100vw-2rem,44rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

const confirmDialogClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[240] w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

const deleteButtonClass =
  "cursor-pointer rounded-[var(--app-radius)] bg-[var(--app-danger)] px-3 text-xs font-medium text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] disabled:cursor-not-allowed disabled:opacity-50 h-9 min-h-9";

export function HomeEditTaskDialog({
  open,
  task,
  projectLabel,
  trackLabel,
  todayIso,
  onClose,
  onSaveTitle,
  onSavePriority,
  onSaveDueDate,
  onSubtasksChange,
  onDelete,
}: {
  open: boolean;
  task: TasksPageTask | null;
  projectLabel: string;
  trackLabel: string;
  todayIso: string;
  onClose: () => void;
  onSaveTitle: (taskId: string, title: string) => Promise<{ error?: string }>;
  onSavePriority: (
    taskId: string,
    priority: "low" | "medium" | "high",
  ) => Promise<{ error?: string }>;
  onSaveDueDate: (taskId: string, dueDateIso: string) => Promise<{ error?: string }>;
  onSubtasksChange: (taskId: string, subtasks: TaskSubtask[]) => void;
  onDelete: (task: TasksPageTask) => Promise<{ error?: string }>;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState(todayIso);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && task) {
      setTitleDraft(task.title);
      setPriority(task.priority);
      setDueDate(task.due_date ?? todayIso);
      setError(null);
      setSaving(false);
      setDeleting(false);
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      });
    } else if (dialog.open) {
      deleteDialogRef.current?.close();
      dialog.close();
    }
    // Reset form when opening or switching tasks — not on every optimistic task field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on task id only
  }, [open, task?.id, todayIso]);

  useLayoutEffect(() => {
    if (open) syncAddTaskTitleHeight(titleRef.current);
  }, [open, titleDraft]);

  const close = () => {
    deleteDialogRef.current?.close();
    dialogRef.current?.close();
  };

  async function handleDelete() {
    if (!task || deleting || saving) return;
    setDeleting(true);
    setError(null);
    const res = await onDelete(task);
    setDeleting(false);
    if (res.error) {
      setError(res.error);
      deleteDialogRef.current?.close();
      return;
    }
    close();
  }

  async function handleSave(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!task || saving || deleting) return;

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setError("Title is required.");
      titleRef.current?.focus();
      return;
    }

    setSaving(true);
    setError(null);

    const errors: string[] = [];

    if (nextTitle !== task.title) {
      const res = await onSaveTitle(task.id, nextTitle);
      if (res.error) errors.push(res.error);
    }
    if (priority !== task.priority) {
      const res = await onSavePriority(task.id, priority);
      if (res.error) errors.push(res.error);
    }
    const nextDue = dueDate.trim();
    if (nextDue && nextDue !== (task.due_date ?? "")) {
      const res = await onSaveDueDate(task.id, nextDue);
      if (res.error) errors.push(res.error);
    }

    setSaving(false);

    if (errors.length > 0) {
      setError(errors[0] ?? "Could not save changes.");
      return;
    }

    close();
  }

  const contextOptions = [{ value: "ctx", label: trackLabel || "—" }];
  const projectOptions = [{ value: "proj", label: projectLabel || "—" }];

  return (
    <>
    <dialog
      ref={dialogRef}
      aria-labelledby="home-edit-task-title"
      className={dialogClass}
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClose={onClose}
    >
      <div className="flex max-h-[min(92dvh,48rem)] flex-col overflow-hidden">
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0 flex-1 pr-2">
            <h2
              id="home-edit-task-title"
              className="text-base font-semibold"
              style={{ color: "var(--app-text)" }}
            >
              Edit Task
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-canvas">
              Update the title, priority, or due date, then save.
            </p>
          </div>
          <DialogCloseButton onClick={close} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <form className="add-task-inline-row flex min-h-0 flex-1 flex-col gap-3" onSubmit={(e) => void handleSave(e)}>
            <div className="flex shrink-0 flex-col gap-3">
            <label
              className="canvas-select-field flex w-full min-w-0 flex-col gap-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Title
              <textarea
                ref={titleRef}
                name="title"
                value={titleDraft}
                required
                rows={1}
                placeholder="What needs to be done"
                disabled={saving || !task}
                aria-label="Task title"
                onChange={(e) => {
                  setTitleDraft(e.target.value);
                  syncAddTaskTitleHeight(e.target);
                }}
                className="input-canvas w-full min-w-0 resize-none text-[0.6875rem] leading-snug placeholder:text-muted-canvas"
                style={{ maxHeight: `${ADD_TASK_TITLE_MAX_PX}px` }}
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
              <label
                className="canvas-select-field flex min-w-0 flex-col gap-1 text-xs sm:flex-[28_1_0%]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Project
                <CanvasSelect
                  name="home-edit-project"
                  options={projectOptions}
                  value="proj"
                  disabled
                  onValueChange={() => {}}
                />
              </label>
              <label
                className="canvas-select-field flex min-w-0 flex-col gap-1 text-xs sm:flex-[72_1_0%]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Track
                <CanvasSelect
                  name="home-edit-track"
                  options={contextOptions}
                  value="ctx"
                  disabled
                  onValueChange={() => {}}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
              <label
                className="canvas-select-field flex min-w-0 flex-col gap-1 text-xs sm:flex-[0_0_28%]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Priority
                <CanvasSelect
                  name="home-edit-priority"
                  options={taskPriorityOptions}
                  value={priority}
                  onValueChange={(v) => {
                    if (v === "low" || v === "medium" || v === "high") setPriority(v);
                  }}
                />
              </label>
              <label
                className="canvas-select-field flex w-fit max-w-full shrink-0 flex-col gap-1 text-xs"
                style={{ color: "var(--app-text-muted)" }}
              >
                Due
                <DueDatePickerControl
                  variant="inline"
                  name="home-edit-due"
                  todayIso={todayIso}
                  dueDate={dueDate}
                  onDueDateChange={setDueDate}
                  quickSelectMode
                />
              </label>
            </div>
            </div>

            {task ? (
              <SubtaskListEditor
                subtasks={task.subtasks ?? []}
                onSubtasksChange={(next) => onSubtasksChange(task.id, next)}
                persist={{ taskId: task.id, scope: task.scope }}
                disabled={saving}
                scrollable
              />
            ) : null}

            <div className="flex shrink-0 items-center justify-between gap-2">
              <button
                type="button"
                className={deleteButtonClass}
                disabled={saving || deleting || !task}
                onClick={() => deleteDialogRef.current?.showModal()}
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost h-9 min-h-9 px-3 text-xs"
                  disabled={saving || deleting}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || deleting || !task}
                  className="btn-cta-dark h-9 min-h-9 shrink-0 px-3 text-xs whitespace-nowrap"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            {error ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </dialog>
      <dialog
        ref={deleteDialogRef}
        aria-labelledby="home-edit-task-delete-title"
        className={confirmDialogClass}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2
            id="home-edit-task-delete-title"
            className="text-base font-semibold"
            style={{ color: "var(--app-text)" }}
          >
            Delete this task?
          </h2>
          {task ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-medium text-muted-canvas">Task</p>
                <p className="mt-0.5 text-sm font-medium break-words" style={{ color: "var(--app-text)" }}>
                  {task.title}
                </p>
              </div>
              <p className="text-sm text-muted-canvas">
                This permanently removes the task and its work session history.
              </p>
              <p className="text-sm text-muted-canvas">
                Due date:{" "}
                <span className="font-medium" style={{ color: "var(--app-text)" }}>
                  {formatDateDisplay(task.due_date)}
                </span>
              </p>
            </div>
          ) : null}
          {error ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={deleting}
              onClick={() => deleteDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-[var(--app-radius)] bg-[var(--app-danger)] px-3 py-2 text-sm font-medium text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={deleting || !task}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
