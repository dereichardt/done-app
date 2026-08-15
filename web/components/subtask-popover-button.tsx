"use client";

import { ListIcon } from "@/components/action-icons";
import { SubtaskListEditor } from "@/components/subtask-list-editor";
import type { TaskSubtask } from "@/lib/tasks-page-shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function SubtaskPopoverButton({
  subtasks,
  onSubtasksChange,
  taskId,
  scope,
}: {
  subtasks: TaskSubtask[];
  onSubtasksChange: (next: TaskSubtask[]) => void;
  taskId: string;
  scope: "project" | "internal";
}) {
  const rawId = useId();
  const popoverId = `subtasks-${rawId.replace(/:/g, "")}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
      Math.max(margin, triggerRect.right - popoverRect.width),
    );
    const top =
      triggerRect.bottom + gap + popoverRect.height <= window.innerHeight - margin
        ? triggerRect.bottom + gap
        : Math.max(margin, triggerRect.top - popoverRect.height - gap);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.right = "auto";
    popover.style.bottom = "auto";
    popover.style.margin = "0";
  }, []);

  const panel = (
    <div
      ref={popoverRef}
      id={popoverId}
      popover="auto"
      className="m-0 w-[min(22rem,calc(100vw-1.5rem))] rounded-[10px] border px-3 py-2.5 shadow-lg"
      style={{
        position: "fixed",
        margin: 0,
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onToggle={(e) => {
        const next = (e as unknown as { newState?: string }).newState;
        if (next === "open") {
          requestAnimationFrame(positionPopover);
        }
      }}
    >
      <SubtaskListEditor
        subtasks={subtasks}
        onSubtasksChange={onSubtasksChange}
        persist={{ taskId, scope }}
      />
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        title="View subtasks"
        aria-label="View subtasks"
        popoverTarget={popoverId}
        onClick={(e) => e.stopPropagation()}
      >
        <ListIcon size={14} />
      </button>
      {mounted ? createPortal(panel, document.body) : panel}
    </>
  );
}
