"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { SubtaskListEditor } from "@/components/subtask-list-editor";
import type { TaskSubtask } from "@/lib/tasks-page-shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const dialogClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[220] max-h-[min(92dvh,52rem)] w-[min(100vw-2rem,32rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

export type SubtaskDialogRequest = {
  taskId: string;
  scope: "project" | "internal";
  taskTitle: string;
  projectName?: string;
  integrationLabel?: string;
  subtasks: TaskSubtask[];
  onSubtasksChange: (next: TaskSubtask[]) => void;
};

type SubtaskDialogContextValue = {
  openSubtaskDialog: (request: SubtaskDialogRequest) => void;
};

const SubtaskDialogContext = createContext<SubtaskDialogContextValue | null>(null);

function removeLegacySubtaskPopovers() {
  for (const node of document.querySelectorAll('[data-subtask-popover], [id^="subtasks-"][popover]')) {
    try {
      (node as HTMLElement & { hidePopover?: () => void }).hidePopover?.();
    } catch {
      /* ignore */
    }
    node.remove();
  }
}

function SubtaskDialogPanel({
  request,
  onSubtasksChange,
  onClose,
}: {
  request: SubtaskDialogRequest;
  onSubtasksChange: (next: TaskSubtask[]) => void;
  onClose: () => void;
}) {
  const subtitle = useMemo(() => {
    const parts = [request.projectName?.trim(), request.integrationLabel?.trim()].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [request.projectName, request.integrationLabel]);

  return (
    <>
      <div
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="min-w-0 flex-1 pr-2">
          <h2
            id="subtask-dialog-title"
            className="truncate text-base font-medium"
            style={{ color: "var(--app-text)" }}
            title={request.taskTitle}
          >
            {request.taskTitle}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-muted-canvas" title={subtitle}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <DialogCloseButton onClick={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        <h3 className="mb-2 shrink-0 text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Subtasks
        </h3>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SubtaskListEditor
            subtasks={request.subtasks}
            onSubtasksChange={onSubtasksChange}
            persist={{ taskId: request.taskId, scope: request.scope }}
            showLabel={false}
            scrollable
          />
        </div>
      </div>
    </>
  );
}

export function SubtaskDialogProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<SubtaskDialogRequest | null>(null);
  const requestRef = useRef<SubtaskDialogRequest | null>(null);
  requestRef.current = request;

  useEffect(() => {
    removeLegacySubtaskPopovers();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const openSubtaskDialog = useCallback((next: SubtaskDialogRequest) => {
    setRequest(next);
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (!dialog.open) dialog.showModal();
    });
  }, []);

  const handleSubtasksChange = useCallback((next: TaskSubtask[]) => {
    requestRef.current?.onSubtasksChange(next);
    setRequest((prev) => (prev ? { ...prev, subtasks: next } : null));
  }, []);

  const handleDialogClose = useCallback(() => {
    setRequest(null);
  }, []);

  const value = useMemo(() => ({ openSubtaskDialog }), [openSubtaskDialog]);

  return (
    <SubtaskDialogContext.Provider value={value}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="subtask-dialog-title"
        className={dialogClass}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={handleDialogClose}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="flex max-h-[min(92dvh,48rem)] flex-col overflow-hidden">
          {request ? (
            <SubtaskDialogPanel
              request={request}
              onSubtasksChange={handleSubtasksChange}
              onClose={close}
            />
          ) : null}
        </div>
      </dialog>
    </SubtaskDialogContext.Provider>
  );
}

export function useSubtaskDialog() {
  const ctx = useContext(SubtaskDialogContext);
  if (!ctx) {
    throw new Error("useSubtaskDialog must be used within SubtaskDialogProvider");
  }
  return ctx;
}
