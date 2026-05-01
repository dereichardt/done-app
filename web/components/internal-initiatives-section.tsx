"use client";

import { InitiativeRowSummaryMetrics } from "@/components/initiative-row-summary-metrics";
import {
  MetricsVisibilityToggle,
  ROW_METRICS_INITIATIVES_STORAGE_KEY,
  readRowMetricsAlwaysFromStorage,
  subscribeRowMetricsAlways,
  toggleRowMetricsAlways,
} from "@/components/metrics-visibility-toggle";
import { formatDateDisplay } from "@/lib/integration-task-helpers";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

export type InternalInitiativeListRow = {
  id: string;
  title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  completed_at: string | null;
};

export type InitiativeTaskCounts = {
  open: number;
};

export function InternalInitiativesSection({
  initiatives,
  countsByInitiativeId,
  todayIso,
}: {
  initiatives: InternalInitiativeListRow[];
  countsByInitiativeId: Record<string, InitiativeTaskCounts>;
  /** User calendar day YYYY-MM-DD for days-remaining metric. */
  todayIso: string;
}) {
  const showSummaryAlways = useSyncExternalStore(
    (cb) => subscribeRowMetricsAlways(ROW_METRICS_INITIATIVES_STORAGE_KEY, cb),
    () => readRowMetricsAlwaysFromStorage(ROW_METRICS_INITIATIVES_STORAGE_KEY),
    () => false,
  );

  const toggle = useCallback(() => {
    toggleRowMetricsAlways(ROW_METRICS_INITIATIVES_STORAGE_KEY);
  }, []);

  const metricsVisible = showSummaryAlways
    ? "flex"
    : "hidden group-hover:flex group-focus-within:flex";

  if (initiatives.length === 0) {
    return (
      <section className="mt-6">
        <div className="group mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="section-heading m-0">Initiatives</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="invisible flex items-center gap-2 opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <MetricsVisibilityToggle
                showAlways={showSummaryAlways}
                onToggle={toggle}
                ariaLabel="Initiative row metrics visibility"
              />
            </div>
            <Link href="/internal/initiatives/new" className="btn-cta shrink-0 text-sm">
              Add initiative
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted-canvas">No initiatives yet.</p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="group mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="section-heading m-0">Initiatives</h2>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="invisible flex items-center gap-2 opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
            <MetricsVisibilityToggle
              showAlways={showSummaryAlways}
              onToggle={toggle}
              ariaLabel="Initiative row metrics visibility"
            />
          </div>
          <Link href="/internal/initiatives/new" className="btn-cta shrink-0 text-sm">
            Add initiative
          </Link>
        </div>
      </div>
      <div className="mt-4">
        <ul className="card-canvas overflow-hidden p-0">
          {initiatives.map((ini) => {
            const title = (ini.title ?? "").trim() || "Untitled";
            const counts = countsByInitiativeId[ini.id] ?? { open: 0 };
            const completed = ini.completed_at != null;
            const startLabel = formatDateDisplay(ini.starts_on);
            const endLabel = formatDateDisplay(ini.ends_on);
            const rangeSubtitle =
              startLabel === "—" && endLabel === "—"
                ? "Dates not set"
                : `${startLabel} – ${endLabel}`;

            return (
              <li
                key={ini.id}
                className={[
                  "group border-t first:border-t-0",
                  completed ? "opacity-70" : "",
                ].join(" ")}
                style={{ borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" }}
              >
                <Link
                  href={`/internal/initiatives/${ini.id}`}
                  className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:bg-[var(--app-surface-alt)] focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
                      {title}
                      {completed ? (
                        <span className="ml-1.5 font-normal text-muted-canvas">· Completed</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-canvas">{rangeSubtitle}</p>
                  </div>
                  <div className={`${metricsVisible} min-w-0 items-center`}>
                    <InitiativeRowSummaryMetrics
                      startsOn={ini.starts_on}
                      endsOn={ini.ends_on}
                      todayIso={todayIso}
                      openTaskCount={counts.open}
                      isCompleted={completed}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
