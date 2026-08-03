"use client";

import { CanvasSelect } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  ADD_TASK_TITLE_MAX_PX,
  DueDatePickerControl,
  syncAddTaskTitleHeight,
} from "@/components/task-row";
import { taskPriorityOptions } from "@/lib/integration-task-helpers";
import type { TasksPageTask } from "@/lib/tasks-page-shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const dialogClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[220] max-h-[min(92dvh,52rem)] w-[min(100vw-2rem,44rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

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
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState(todayIso);
  const [saving, setSaving] = useState(false);
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
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => {
        titleRef.current?.focus();
        titleRef.current?.select();
      });
    } else if (dialog.open) {
      dialog.close();
    }
    // Reset form when opening or switching tasks — not on every optimistic task field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on task id only
  }, [open, task?.id, todayIso]);

  useLayoutEffect(() => {
    if (open) syncAddTaskTitleHeight(titleRef.current);
  }, [open, titleDraft]);

  const close = () => dialogRef.current?.close();

  async function handleSave(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!task || saving) return;

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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <form className="add-task-inline-row flex flex-col gap-3" onSubmit={(e) => void handleSave(e)}>
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

            <div className="mt-30 flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-ghost h-9 min-h-9 px-3 text-xs"
                disabled={saving}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !task}
                className="btn-cta-dark h-9 min-h-9 shrink-0 px-3 text-xs whitespace-nowrap"
              >
                {saving ? "Saving…" : "Save"}
              </button>
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
  );
}
