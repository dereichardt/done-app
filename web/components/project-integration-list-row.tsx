"use client";

import { IntegrationStatePill } from "@/components/integration-state-pill";
import { formatIntegrationUpdateWhen, integrationUpdateBubbleBoxClass } from "@/lib/integration-update-display";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";
import Link from "next/link";

const rowBorder = { borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" } as const;

/** Same as timeline read-mode Start/End column labels (`project-timeline.tsx`). */
const detailLabel = "text-xs text-muted-canvas";
const detailValue = "mt-0.5 text-sm leading-snug";
const detailValueTextStyle = { color: "var(--app-text)" } as const;

function emptyDetail(text: string, alignEnd?: boolean) {
  return (
    <p className={`${detailValue} text-muted-canvas ${alignEnd ? "w-full text-right" : ""}`}>{text}</p>
  );
}

/** Same structure as timeline Start/End columns. */
const timelineMetaColumn =
  "flex min-w-[7rem] flex-col items-end text-right text-xs text-muted-canvas";

/** Round control: strong hover so it reads as clickable (matches session affordance on project list). */
const activeSessionIndicatorButtonClass =
  "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-info)_8%,var(--app-surface)_92%)] text-[var(--app-info)] transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_oklab,var(--app-info)_22%,var(--app-surface-alt)_78%)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-info)]";

/** Same pulse icon as work-on-task row (`integration-tasks-panel.tsx`). */
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

export function ProjectIntegrationListRow({
  projectId,
  row,
  expanded,
  onToggleExpanded,
  onOpenTasksModal,
  showActiveSessionIndicator = false,
  onOpenActiveSessionIndicator,
}: {
  projectId: string;
  row: SerializedProjectIntegrationRow;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenTasksModal: (row: SerializedProjectIntegrationRow) => void;
  showActiveSessionIndicator?: boolean;
  onOpenActiveSessionIndicator?: () => void;
}) {
  const href = `/projects/${projectId}/integrations/${row.id}`;
  const panelId = `integration-row-panel-${row.id}`;
  const latest = row.latestUpdateBody?.trim() ?? "";
  const openCount = row.openTaskCount ?? 0;
  const typeLabel = row.integrationTypeLabel?.trim() ?? "";
  const areaLabel = row.functionalAreaLabel?.trim() ?? "";

  return (
    <li className="border-t first:border-t-0" style={rowBorder}>
      <div className="flex w-full items-center gap-2 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] sm:gap-3">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] active:scale-[0.97]"
          style={{ borderColor: "var(--app-border)" }}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? "Collapse integration details" : "Expand integration details"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpanded();
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-5 w-5 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <Link
          href={href}
          className="flex min-w-0 flex-1 cursor-pointer flex-row items-center justify-between gap-3 rounded-sm sm:gap-6"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
              {row.title}
            </p>
            <p className="mt-1 text-xs text-muted-canvas">{row.deliveryProgressLabel}</p>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-2">
            {showActiveSessionIndicator && onOpenActiveSessionIndicator ? (
              <button
                type="button"
                className={activeSessionIndicatorButtonClass}
                aria-label="Open active work session"
                title="Active work session"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenActiveSessionIndicator();
                }}
              >
                <WorkOnTaskIcon />
              </button>
            ) : null}
            <IntegrationStatePill state={row.integration_state} />
          </div>
        </Link>
      </div>

      {expanded ? (
        <div
          id={panelId}
          className="border-t px-4 pb-4 pt-3 sm:pl-[3.75rem]"
          style={rowBorder}
          role="region"
          aria-label="Integration details"
        >
          <div className="flex flex-col gap-5">
            <div className="min-w-0">
              <p className={detailLabel}>Latest update</p>
              {latest.length > 0 ? (
                <div className="mt-0.5 min-w-0">
                  <div className={integrationUpdateBubbleBoxClass}>
                    {row.latestUpdateCreatedAt ? (
                      <time
                        className="block min-w-0 truncate text-xs text-muted-canvas"
                        dateTime={row.latestUpdateCreatedAt}
                      >
                        {formatIntegrationUpdateWhen(row.latestUpdateCreatedAt)}
                      </time>
                    ) : null}
                    <p
                      className={`${row.latestUpdateCreatedAt ? "mt-1" : ""} whitespace-pre-wrap break-words text-sm leading-snug`}
                      style={detailValueTextStyle}
                    >
                      {latest}
                    </p>
                  </div>
                </div>
              ) : (
                emptyDetail("No updates yet.")
              )}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
              <div className="min-w-0">
                <p className={detailLabel}>Tasks coming due</p>
                <button
                  type="button"
                  className="btn-cta-tertiary mt-0.5 inline-flex min-h-9 justify-start px-3 py-2 text-left tabular-nums"
                  title="Manage tasks"
                  onClick={() => onOpenTasksModal(row)}
                >
                  {openCount} open {openCount === 1 ? "task" : "tasks"}
                </button>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-4 sm:ml-auto sm:gap-5">
                <div className={timelineMetaColumn}>
                  <span>Integration type</span>
                  {typeLabel.length > 0 ? (
                    <span className={`${detailValue} block w-full`} style={detailValueTextStyle}>
                      {typeLabel}
                    </span>
                  ) : (
                    <span className={`${detailValue} block w-full text-muted-canvas`}>—</span>
                  )}
                </div>
                <div className={timelineMetaColumn}>
                  <span>Functional area</span>
                  {areaLabel.length > 0 ? (
                    <span className={`${detailValue} block w-full`} style={detailValueTextStyle}>
                      {areaLabel}
                    </span>
                  ) : (
                    <span className={`${detailValue} block w-full text-muted-canvas`}>—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
