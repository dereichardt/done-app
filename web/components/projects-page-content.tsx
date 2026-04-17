"use client";

import { ProjectsActiveSessionList } from "@/components/projects-active-session-list";
import type { ActiveWorkSessionIndicatorDTO } from "@/lib/actions/integration-tasks";
import type { ProjectListRowSummary } from "@/lib/load-project-list-summaries";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

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
  project_types: unknown;
  project_roles: unknown;
};

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

  return (
    <>
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-heading">Active Engagements</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-cta-tertiary whitespace-nowrap text-xs"
              style={{ padding: "0.4rem 0.85rem" }}
              aria-pressed={showSummaryAlways}
              aria-label={
                showSummaryAlways
                  ? "Row summary metrics are always visible. Click to show only on hover."
                  : "Row summary metrics show on hover. Click to always show on every row."
              }
              onClick={toggle}
            >
              {showSummaryAlways ? "Metrics on hover only" : "Always show metrics"}
            </button>
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
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-heading">Completed Engagements</h2>
        <div className="mt-4">
          <ProjectsActiveSessionList
            projects={completedProjects}
            emptyLabel="completed"
            summaryByProjectId={summaryByProjectId}
            showSummaryAlways={showSummaryAlways}
          />
        </div>
      </section>
    </>
  );
}
