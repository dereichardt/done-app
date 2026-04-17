"use client";

import {
  ActiveWorkSessionDialog,
  IntegrationTasksPanel,
  type IntegrationTaskRow,
  type IntegrationTaskWorkSessionRow,
} from "@/components/integration-tasks-panel";
import {
  fetchIntegrationTaskSnapshot,
  type ActiveWorkSessionIndicatorDTO,
  type IntegrationTaskSnapshot,
} from "@/lib/actions/integration-tasks";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { ProjectIntegrationListRow } from "@/components/project-integration-list-row";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";
import { todayISO } from "@/lib/project-phase-status";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Chevrons point outward (up / down) — “expand” rows apart. */
function ExpandAllRowsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m9 7 3-3 3 3" />
      <path d="m9 17 3 3 3-3" />
    </svg>
  );
}

/** Chevrons point toward the middle — “collapse” rows together (tips separated so strokes don’t meet). */
function CollapseAllRowsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m9 6 3 3 3-3" />
      <path d="m9 18 3-3 3 3" />
    </svg>
  );
}

const dialogBaseClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[200] max-h-[min(92dvh,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

function indicatorToActiveSessionDto(i: ActiveWorkSessionIndicatorDTO) {
  return {
    integration_task_id: i.integration_task_id,
    started_at: i.started_at,
    paused_ms_accumulated: i.paused_ms_accumulated,
    pause_started_at: i.pause_started_at,
  };
}

export function ProjectIntegrationsSection({
  projectId,
  rows,
  projectCustomerName = "",
  initialActiveSessionIndicator = null,
}: {
  projectId: string;
  rows: SerializedProjectIntegrationRow[];
  /** Shown in finish-session modal when working from this project’s “All Tasks” list. */
  projectCustomerName?: string;
  /** Present when this user has an active timer on an integration belonging to this project. */
  initialActiveSessionIndicator?: ActiveWorkSessionIndicatorDTO | null;
}) {
  const router = useRouter();
  const rowIdsKey = useMemo(() => rows.map((r) => r.id).join("\0"), [rows]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [tasksModalRow, setTasksModalRow] = useState<SerializedProjectIntegrationRow | null>(null);
  const tasksDialogRef = useRef<HTMLDialogElement>(null);
  const [snapshotByIntegrationId, setSnapshotByIntegrationId] = useState<Record<string, IntegrationTaskSnapshot>>({});
  const [loadingIntegrationId, setLoadingIntegrationId] = useState<string | null>(null);
  const [loadErrorByIntegrationId, setLoadErrorByIntegrationId] = useState<Record<string, string>>({});
  /** Discards stale snapshot responses when multiple fetches overlap (open vs. invalidate after work session). */
  const snapshotFetchEpochRef = useRef<Record<string, number>>({});
  const todayIso = useMemo(() => todayISO(), []);

  const [activeSessionIndicator, setActiveSessionIndicator] = useState<ActiveWorkSessionIndicatorDTO | null>(
    initialActiveSessionIndicator ?? null,
  );
  const activeWorkSessionDialogRef = useRef<HTMLDialogElement>(null);

  const openActiveWorkSessionModal = useCallback(() => {
    requestAnimationFrame(() => activeWorkSessionDialogRef.current?.showModal());
  }, []);

  const afterActiveWorkSessionCleared = useCallback(async () => {
    setActiveSessionIndicator(null);
    router.refresh();
  }, [router]);

  const toggleRow = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const allExpanded = rows.length > 0 && expandedIds.size === rows.length;

  const toggleExpandAll = useCallback(() => {
    if (allExpanded) collapseAll();
    else expandAll();
  }, [allExpanded, expandAll, collapseAll]);

  useEffect(() => {
    setExpandedIds(new Set());
  }, [rowIdsKey]);

  // All Tasks modal: same IntegrationTasksPanel as the integration detail page (persistent work timers, etc.).
  // We refetch the task snapshot on every open and after finish/discard so client cache matches the server.

  const loadTaskSnapshot = useCallback(async (projectIntegrationId: string) => {
    const epoch = (snapshotFetchEpochRef.current[projectIntegrationId] ?? 0) + 1;
    snapshotFetchEpochRef.current[projectIntegrationId] = epoch;

    setLoadingIntegrationId(projectIntegrationId);
    setLoadErrorByIntegrationId((prev) => {
      if (!prev[projectIntegrationId]) return prev;
      const next = { ...prev };
      delete next[projectIntegrationId];
      return next;
    });
    try {
      const res = await fetchIntegrationTaskSnapshot(projectIntegrationId);
      if (snapshotFetchEpochRef.current[projectIntegrationId] !== epoch) return;

      if (res?.error || !res.snapshot) {
        setLoadErrorByIntegrationId((prev) => ({
          ...prev,
          [projectIntegrationId]: res?.error ?? "Could not load tasks.",
        }));
        return;
      }
      setSnapshotByIntegrationId((prev) => ({ ...prev, [projectIntegrationId]: res.snapshot! }));
    } finally {
      if (snapshotFetchEpochRef.current[projectIntegrationId] === epoch) {
        setLoadingIntegrationId((prev) => (prev === projectIntegrationId ? null : prev));
      }
    }
  }, []);

  const openTasksModal = useCallback((row: SerializedProjectIntegrationRow) => {
    setTasksModalRow(row);
    requestAnimationFrame(() => {
      const dialog = tasksDialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
    });
    // Always refetch: client cache must include current `activeWorkSession` (timers started elsewhere or in a prior visit).
    void loadTaskSnapshot(row.id);
  }, [loadTaskSnapshot]);

  const closeTasksModal = useCallback(() => {
    tasksDialogRef.current?.close();
  }, []);

  const modalRowId = tasksModalRow?.id ?? null;
  const modalSnapshot = modalRowId ? snapshotByIntegrationId[modalRowId] : undefined;
  const modalLoadError = modalRowId ? loadErrorByIntegrationId[modalRowId] : undefined;
  const modalIsLoading = modalRowId != null && loadingIntegrationId === modalRowId;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">Integrations</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: "var(--app-border)" }}
            aria-label={allExpanded ? "Collapse all integrations" : "Expand all integrations"}
            disabled={rows.length === 0}
            onClick={toggleExpandAll}
          >
            {allExpanded ? (
              <CollapseAllRowsIcon className="h-[22px] w-[22px]" />
            ) : (
              <ExpandAllRowsIcon className="h-[22px] w-[22px]" />
            )}
          </button>
          <Link
            href={`/projects/${projectId}/integrations/new`}
            className="btn-cta inline-flex h-9 min-h-9 shrink-0 items-center px-3 text-xs whitespace-nowrap"
          >
            Add integration
          </Link>
        </div>
      </div>

      <div className="card-canvas mt-4 min-h-0 max-h-[var(--integrations-list-max-height)] overflow-y-auto p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-canvas">No integrations linked yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((row) => (
              <ProjectIntegrationListRow
                key={row.id}
                projectId={projectId}
                row={row}
                expanded={expandedIds.has(row.id)}
                onToggleExpanded={() => toggleRow(row.id)}
                onOpenTasksModal={openTasksModal}
                showActiveSessionIndicator={
                  activeSessionIndicator != null && activeSessionIndicator.project_integration_id === row.id
                }
                onOpenActiveSessionIndicator={openActiveWorkSessionModal}
              />
            ))}
          </ul>
        )}
      </div>

      <dialog
        ref={tasksDialogRef}
        className={`${dialogBaseClass} h-[min(44rem,84vh)] w-[min(100vw-2rem,72rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={(e) => {
          // Nested <dialog>s (finish session, discard, etc.) bubble `close` to ancestors. Only react when *this* dialog closed.
          if (e.target !== tasksDialogRef.current) return;
          setTasksModalRow(null);
        }}
      >
        <div className="flex h-full min-h-0 max-h-full flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                All Tasks
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-canvas" title={tasksModalRow?.title ?? ""}>
                {tasksModalRow?.title ?? ""}
              </p>
            </div>
            <DialogCloseButton onClick={closeTasksModal} />
          </div>

          <div className="min-h-0 flex-1 p-4">
            {modalRowId == null ? null : modalSnapshot ? (
              <IntegrationTasksPanel
                className="h-full min-h-0"
                projectIntegrationId={modalRowId}
                tasks={modalSnapshot.tasks as IntegrationTaskRow[]}
                workSessionsByTaskId={modalSnapshot.workSessionsByTaskId as Record<
                  string,
                  IntegrationTaskWorkSessionRow[]
                >}
                activeWorkSession={modalSnapshot.activeWorkSession ?? null}
                globalActiveWorkSession={modalSnapshot.globalActiveWorkSession ?? null}
                globalActiveWorkSessionTaskTitle={modalSnapshot.globalActiveWorkSessionTaskTitle ?? null}
                globalActiveWorkSessionIntegrationLabel={
                  modalSnapshot.globalActiveWorkSessionIntegrationLabel ?? null
                }
                globalActiveWorkSessionProjectName={modalSnapshot.globalActiveWorkSessionProjectName ?? null}
                finishSessionIntegrationLabel={tasksModalRow?.title ?? ""}
                finishSessionProjectLabel={projectCustomerName}
                todayIso={todayIso}
                onClientTaskSnapshotInvalidate={() => loadTaskSnapshot(modalRowId)}
              />
            ) : modalLoadError ? (
              <div className="card-canvas flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm" style={{ color: "var(--app-danger)" }}>
                  {modalLoadError}
                </p>
                <button
                  type="button"
                  className="btn-cta-tertiary text-sm"
                  onClick={() => {
                    if (modalRowId) void loadTaskSnapshot(modalRowId);
                  }}
                  disabled={modalIsLoading}
                >
                  {modalIsLoading ? "Retrying..." : "Retry"}
                </button>
              </div>
            ) : (
              <div className="card-canvas flex h-full min-h-0 items-center justify-center p-6">
                <p className="text-sm text-muted-canvas">{modalIsLoading ? "Loading tasks..." : "Preparing tasks..."}</p>
              </div>
            )}
          </div>
        </div>
      </dialog>

      {activeSessionIndicator && activeSessionIndicator.project_id === projectId ? (
        <ActiveWorkSessionDialog
          key={activeSessionIndicator.integration_task_id}
          dialogRef={activeWorkSessionDialogRef}
          taskId={activeSessionIndicator.integration_task_id}
          taskTitle={activeSessionIndicator.task_title}
          integrationLabel={activeSessionIndicator.integration_label}
          projectLabel={activeSessionIndicator.project_name}
          activeSession={indicatorToActiveSessionDto(activeSessionIndicator)}
          onActiveSessionChange={(s) => {
            setActiveSessionIndicator((prev) =>
              prev && prev.integration_task_id === s.integration_task_id
                ? {
                    ...prev,
                    started_at: s.started_at,
                    paused_ms_accumulated: s.paused_ms_accumulated,
                    pause_started_at: s.pause_started_at,
                  }
                : prev,
            );
          }}
          onAfterSessionCleared={afterActiveWorkSessionCleared}
        />
      ) : null}
    </>
  );
}
