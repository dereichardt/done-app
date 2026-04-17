"use client";

import { ActiveWorkSessionDialog } from "@/components/integration-tasks-panel";
import { ProjectRowSummaryMetrics } from "@/components/project-row-summary-metrics";
import type { ActiveWorkSessionIndicatorDTO } from "@/lib/actions/integration-tasks";
import type { ProjectListRowSummary } from "@/lib/load-project-list-summaries";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

function relationName(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const row = value[0];
    if (row && typeof row === "object" && "name" in row) {
      return String((row as { name: string }).name);
    }
    return undefined;
  }
  if (typeof value === "object" && "name" in value) {
    return String((value as { name: string }).name);
  }
  return undefined;
}

function indicatorToActiveSessionDto(i: ActiveWorkSessionIndicatorDTO) {
  return {
    integration_task_id: i.integration_task_id,
    started_at: i.started_at,
    paused_ms_accumulated: i.paused_ms_accumulated,
    pause_started_at: i.pause_started_at,
  };
}

const activeSessionIndicatorButtonClass =
  "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-info)_8%,var(--app-surface)_92%)] text-[var(--app-info)] transition-[background-color,transform] duration-150 hover:bg-[color-mix(in_oklab,var(--app-info)_22%,var(--app-surface-alt)_78%)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-info)]";

/** Keeps summary metrics right edge aligned with rows that have the active-session control. */
const activeSessionSlotClass = "inline-flex h-9 w-9 shrink-0";

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

export type ProjectsActiveSessionListProjectRow = {
  id: string;
  customer_name: string | null;
  project_types: unknown;
  project_roles: unknown;
};

export function ProjectsActiveSessionList({
  projects,
  initialActiveSessionIndicator = null,
  emptyLabel = "active",
  summaryByProjectId = {},
  showSummaryAlways = false,
}: {
  projects: ProjectsActiveSessionListProjectRow[];
  initialActiveSessionIndicator?: ActiveWorkSessionIndicatorDTO | null;
  /** Which empty-state copy to show when there are no rows. */
  emptyLabel?: "active" | "completed";
  summaryByProjectId?: Record<string, ProjectListRowSummary>;
  showSummaryAlways?: boolean;
}) {
  const router = useRouter();
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

  const emptyMessage =
    emptyLabel === "completed"
      ? "No completed engagements yet. When you mark a project complete, it will appear here."
      : "No active engagements yet. Create a project to get started.";

  return (
    <>
      <ul className="card-canvas overflow-hidden p-0">
        {projects.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-canvas">{emptyMessage}</li>
        ) : (
          projects.map((p) => {
            const attrs =
              [relationName(p.project_types), relationName(p.project_roles)].filter(Boolean).join(" · ") || "—";
            const showIndicator =
              activeSessionIndicator != null && activeSessionIndicator.project_id === p.id;

            const summary = summaryByProjectId[p.id];
            const metricsVisible = showSummaryAlways
              ? "flex"
              : "hidden group-hover:flex group-focus-within:flex";

            return (
              <li
                key={p.id}
                className="group border-t first:border-t-0"
                style={{ borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" }}
              >
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:bg-[var(--app-surface-alt)] focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
                      {p.customer_name}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-canvas">{attrs}</p>
                  </div>
                  {summary ? (
                    <div className={`${metricsVisible} min-w-0 items-center`}>
                      <ProjectRowSummaryMetrics {...summary} />
                    </div>
                  ) : null}
                  {showIndicator ? (
                    <button
                      type="button"
                      className={activeSessionIndicatorButtonClass}
                      aria-label="Open active work session"
                      title="Active work session"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openActiveWorkSessionModal();
                      }}
                    >
                      <WorkOnTaskIcon />
                    </button>
                  ) : (
                    <span className={activeSessionSlotClass} aria-hidden />
                  )}
                </Link>
              </li>
            );
          })
        )}
      </ul>

      {activeSessionIndicator ? (
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
