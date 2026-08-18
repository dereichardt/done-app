"use client";

import { ListIcon } from "@/components/action-icons";
import { useSubtaskDialog } from "@/components/subtask-dialog";
import type { TaskSubtask } from "@/lib/tasks-page-shared";
import type { MouseEvent } from "react";

export function SubtaskPopoverButton({
  subtasks,
  onSubtasksChange,
  taskId,
  scope,
  taskTitle,
  projectName,
  integrationLabel,
}: {
  subtasks: TaskSubtask[];
  onSubtasksChange: (next: TaskSubtask[]) => void;
  taskId: string;
  scope: "project" | "internal";
  taskTitle: string;
  projectName?: string;
  integrationLabel?: string;
}) {
  const { openSubtaskDialog } = useSubtaskDialog();

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    openSubtaskDialog({
      taskId,
      scope,
      taskTitle,
      projectName,
      integrationLabel,
      subtasks,
      onSubtasksChange,
    });
  }

  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      title="View subtasks"
      aria-label="View subtasks"
      aria-haspopup="dialog"
      onClick={handleClick}
    >
      <ListIcon size={14} />
    </button>
  );
}
