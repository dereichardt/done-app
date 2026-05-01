"use client";

import { CanvasSelect } from "@/components/canvas-select";
import { ProjectsActiveSessionList } from "@/components/projects-active-session-list";
import type { ActiveWorkSessionIndicatorDTO } from "@/lib/actions/integration-tasks";
import type { ProjectListRowSummary } from "@/lib/load-project-list-summaries";
import {
  COMPLETED_SORT_OPTIONS,
  type CompletedSortKey,
} from "@/lib/project-list-sort-keys";
import {
  MetricsVisibilityToggle,
  ROW_METRICS_PROJECTS_STORAGE_KEY,
  readRowMetricsAlwaysFromStorage,
  subscribeRowMetricsAlways,
  toggleRowMetricsAlways,
} from "@/components/metrics-visibility-toggle";
import Link from "next/link";
import { useCallback, useMemo, useReducer, useSyncExternalStore } from "react";

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
    (cb) => subscribeRowMetricsAlways(ROW_METRICS_PROJECTS_STORAGE_KEY, cb),
    () => readRowMetricsAlwaysFromStorage(ROW_METRICS_PROJECTS_STORAGE_KEY),
    () => false,
  );

  const toggle = useCallback(() => {
    toggleRowMetricsAlways(ROW_METRICS_PROJECTS_STORAGE_KEY);
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
            key={initialActiveSessionIndicator?.task_id ?? "projects-no-active-session"}
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
