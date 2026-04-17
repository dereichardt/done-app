"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { ProjectIntegrationListItem } from "@/components/project-integration-list-item";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

const dialogBaseClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[200] max-h-[min(92dvh,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

const labelSm = "text-sm font-medium text-muted-canvas";

const summaryCard =
  "card-canvas flex min-h-[10.5rem] flex-col px-4 py-5 sm:min-h-[11rem]";
const summaryTopLeft = "shrink-0 self-start text-left";
const summaryValueCenter =
  "flex min-h-[2.5rem] flex-1 flex-col items-center justify-center px-1";

/** Summary KPI scale; phase name / days cards use one step smaller in project-summary-strip; ! overrides .btn-cta-tertiary font-size */
const summaryMetricButtonText =
  "!text-3xl sm:!text-4xl font-semibold leading-tight tracking-tight tabular-nums";

type OpenMode = "active" | "blocked_on_hold";

function filterRows(mode: OpenMode, rows: SerializedProjectIntegrationRow[]): SerializedProjectIntegrationRow[] {
  if (mode === "active") {
    return rows.filter((r) => r.integration_state === "active");
  }
  return rows.filter((r) => r.integration_state === "blocked" || r.integration_state === "on_hold");
}

export function ProjectSummaryIntegrationCards({
  projectId,
  integrationRows,
}: {
  projectId: string;
  integrationRows: SerializedProjectIntegrationRow[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openMode, setOpenMode] = useState<OpenMode | null>(null);

  const activeCount = integrationRows.filter((r) => r.integration_state === "active").length;
  const blockedOnHoldCount = integrationRows.filter(
    (r) => r.integration_state === "blocked" || r.integration_state === "on_hold",
  ).length;

  const openDialog = useCallback((mode: OpenMode) => {
    flushSync(() => setOpenMode(mode));
    dialogRef.current?.showModal();
  }, []);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const filtered = openMode ? filterRows(openMode, integrationRows) : [];
  const dialogTitle =
    openMode === "active"
      ? "Active integrations"
      : openMode === "blocked_on_hold"
        ? "Blocked / on hold integrations"
        : "";
  const emptyMessage =
    openMode === "active" ? "No active integrations." : "No blocked or on hold integrations.";

  return (
    <>
      <div className={summaryCard}>
        <div className={summaryTopLeft}>
          <p className={labelSm}>Active integrations</p>
        </div>
        <div className={summaryValueCenter}>
          <button
            type="button"
            className={`btn-cta-tertiary px-3 py-2 text-center ${summaryMetricButtonText}`}
            aria-haspopup="dialog"
            aria-expanded={openMode === "active"}
            aria-label={`Open list of ${activeCount} active ${activeCount === 1 ? "integration" : "integrations"}`}
            onClick={() => openDialog("active")}
          >
            {activeCount}
          </button>
        </div>
      </div>

      <div className={summaryCard}>
        <div className={summaryTopLeft}>
          <p className={labelSm}>Blocked / on hold integrations</p>
        </div>
        <div className={summaryValueCenter}>
          <button
            type="button"
            className={`btn-cta-tertiary px-3 py-2 text-center ${summaryMetricButtonText}`}
            aria-haspopup="dialog"
            aria-expanded={openMode === "blocked_on_hold"}
            aria-label={`Open list of ${blockedOnHoldCount} blocked or on hold ${blockedOnHoldCount === 1 ? "integration" : "integrations"}`}
            onClick={() => openDialog("blocked_on_hold")}
          >
            {blockedOnHoldCount}
          </button>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="project-summary-integrations-dialog-title"
        className={`${dialogBaseClass} h-[min(92dvh,52rem)] w-[min(100vw-2rem,42rem)] max-w-[calc(100vw-2rem)]`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => setOpenMode(null)}
      >
        <div className="flex h-full min-h-0 max-h-full flex-col">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <h2
              id="project-summary-integrations-dialog-title"
              className="text-base font-semibold"
              style={{ color: "var(--app-text)" }}
            >
              {dialogTitle}
              {openMode ? (
                <span className="ml-2 text-sm font-medium tabular-nums text-muted-canvas">
                  ({filtered.length})
                </span>
              ) : null}
            </h2>
            <DialogCloseButton onClick={closeDialog} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--app-surface)" }}>
            {openMode && filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-canvas">{emptyMessage}</p>
            ) : null}
            {openMode && filtered.length > 0 ? (
              <ul className="m-0 w-full list-none p-0">
                {filtered.map((row) => (
                  <ProjectIntegrationListItem
                    key={row.id}
                    projectId={projectId}
                    rowId={row.id}
                    title={row.title}
                    meta={row.meta}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
