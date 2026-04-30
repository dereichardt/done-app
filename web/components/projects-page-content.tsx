"use client";

import { CanvasSelect } from "@/components/canvas-select";
import { ProjectsActiveSessionList } from "@/components/projects-active-session-list";
import type { ActiveWorkSessionIndicatorDTO } from "@/lib/actions/integration-tasks";
import type { ProjectListRowSummary } from "@/lib/load-project-list-summaries";
import {
  COMPLETED_SORT_OPTIONS,
  type CompletedSortKey,
} from "@/lib/project-list-sort-keys";
import Link from "next/link";
import { useCallback, useMemo, useReducer, useSyncExternalStore } from "react";

const STORAGE_KEY = "done-app-projects-summary-always";

const summaryAlwaysListeners = new Set<() => void>();

function readSummaryAlwaysFromStorage(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function subscribeSummaryAlways(onStoreChange: () => void) {
  summaryAlwaysListeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onStoreChange();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    summaryAlwaysListeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function notifySummaryAlwaysListeners() {
  for (const cb of summaryAlwaysListeners) cb();
}

export type ProjectsPageContentProjectRow = {
  id: string;
  customer_name: string | null;
  completed_at: string | null;
  project_types: unknown;
  project_roles: unknown;
};

function sortCompletedProjects(
  projects: ProjectsPageContentProjectRow[],
  key: CompletedSortKey,
): ProjectsPageContentProjectRow[] {
  return [...projects].sort((a, b) => {
    if (key === "name") {
      return (a.customer_name ?? "").localeCompare(b.customer_name ?? "");
    }
    const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return tb - ta;
  });
}

/**
 * Sliding-pill toggle — visual language matches the Meeting/Task and Day/Week/Month
 * toggles in `integration-effort-section.tsx`. Two segments: "On Hover" / "Show".
 */
function MetricsVisibilityToggle({
  showAlways,
  onToggle,
}: {
  showAlways: boolean;
  onToggle: () => void;
}) {
  const segWidth = 88; // px per segment — fits "On Hover" on a single line
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-canvas">Metrics</span>
      <div
        role="tablist"
        aria-label="Row metrics visibility"
        className="relative inline-flex overflow-visible rounded-[10px] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px]"
          style={{
            width: segWidth,
            transform: `translateX(${showAlways ? segWidth : 0}px)`,
            transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
            background: "#1f2937",
            boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
          }}
        />
        <button
          type="button"
          role="tab"
          aria-selected={!showAlways}
          className={[
            "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-center text-xs transition-colors cursor-pointer rounded-l-[10px]",
            !showAlways
              ? "font-semibold text-[#f3f5f8]"
              : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
          ].join(" ")}
          style={{ width: segWidth }}
          onClick={() => {
            if (showAlways) onToggle();
          }}
        >
          On Hover
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showAlways}
          className={[
            "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-center text-xs transition-colors cursor-pointer rounded-r-[10px]",
            showAlways
              ? "font-semibold text-[#f3f5f8]"
              : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
          ].join(" ")}
          style={{ width: segWidth }}
          onClick={() => {
            if (!showAlways) onToggle();
          }}
        >
          Show
        </button>
      </div>
    </div>
  );
}

export function ProjectsPageContent({
  activeProjects,
  completedProjects,
  summaryByProjectId,
  initialActiveSessionIndicator,
}: {
  activeProjects: ProjectsPageContentProjectRow[];
  completedProjects: ProjectsPageContentProjectRow[];
  summaryByProjectId: Record<string, ProjectListRowSummary>;
  initialActiveSessionIndicator: ActiveWorkSessionIndicatorDTO | null;
}) {
  const showSummaryAlways = useSyncExternalStore(
    subscribeSummaryAlways,
    readSummaryAlwaysFromStorage,
    () => false,
  );

  const toggle = useCallback(() => {
    const next = !readSummaryAlwaysFromStorage();
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    notifySummaryAlwaysListeners();
  }, []);

  const [completedSort, setCompletedSort] = useReducer(
    (_: CompletedSortKey, next: CompletedSortKey) => next,
    "completed_at",
  );

  const sortedCompleted = useMemo(
    () => sortCompletedProjects(completedProjects, completedSort),
    [completedProjects, completedSort],
  );

  return (
    <>
      <section className="mt-6">
        {/* group spans heading + controls so hovering either area reveals the soft controls */}
        <div className="group flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-heading">Active Engagements</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Soft controls: hidden until hover / focus-within */}
            <div className="invisible flex items-center gap-2 opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <MetricsVisibilityToggle showAlways={showSummaryAlways} onToggle={toggle} />
            </div>
            {/* Always visible */}
            <Link
              href="/projects/new"
              className="btn-cta shrink-0 whitespace-nowrap text-xs"
              style={{ padding: "0.4rem 0.85rem" }}
            >
              New Project
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <ProjectsActiveSessionList
            key={initialActiveSessionIndicator?.integration_task_id ?? "projects-no-active-session"}
            projects={activeProjects}
            initialActiveSessionIndicator={initialActiveSessionIndicator}
            emptyLabel="active"
            summaryByProjectId={summaryByProjectId}
            showSummaryAlways={showSummaryAlways}
            allowReorder
          />
        </div>
      </section>

      <section className="mt-10">
        <div className="group flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-heading">Completed Engagements</h2>
          <div className="flex shrink-0 items-center gap-2">
            <label className="invisible flex items-center gap-2 text-xs text-muted-canvas opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <span className="whitespace-nowrap">Sort by</span>
              <div className="task-sort-compact w-[11rem]">
                <CanvasSelect
                  name="completed_sort"
                  options={COMPLETED_SORT_OPTIONS}
                  value={completedSort}
                  onValueChange={(v) => setCompletedSort(v as CompletedSortKey)}
                />
              </div>
            </label>
          </div>
        </div>
        <div className="mt-4">
          <ProjectsActiveSessionList
            projects={sortedCompleted}
            emptyLabel="completed"
            summaryByProjectId={summaryByProjectId}
            showSummaryAlways={showSummaryAlways}
            summaryMetricsVariant="completed"
          />
        </div>
      </section>
    </>
  );
}
