"use client";

import { useMemo, useState } from "react";

import { ProjectSummaryStrip } from "@/app/projects/[id]/project-summary-strip";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { HomeProgressKanban } from "@/components/home-progress-kanban";
import { HomeProgressTimeline } from "@/components/home-progress-timeline";
import type { HomeProjectStatusCacheEntry } from "@/lib/actions/home-project-status";
import type { HomeProjectPickerRow } from "@/lib/actions/home";
import { makeWeekTotals } from "@/lib/home-actuals-vs-forecast";
import type { HomeProjectStatusPayload } from "@/lib/home-project-status";
import { resolvePhaseStatus } from "@/lib/project-phase-status";

export function HomeProgressSection({
  projects,
  entries,
  backgroundLoading,
  onRetry,
  onPayloadChange,
  sectionId,
  onRequestClose,
}: {
  projects: HomeProjectPickerRow[];
  entries: Record<string, HomeProjectStatusCacheEntry>;
  backgroundLoading: boolean;
  onRetry: (projectId: string) => void;
  onPayloadChange: (projectId: string, payload: HomeProjectStatusPayload) => void;
  sectionId?: string;
  onRequestClose?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeProjectId = projects[activeIndex]?.id ?? "";
  const entry = entries[activeProjectId];
  const payload = entry?.payload ?? null;
  const loadError = entry?.error ?? null;
  const loading = backgroundLoading && !entry;

  const phaseStatus = useMemo(() => {
    if (!payload) return resolvePhaseStatus([], "");
    return resolvePhaseStatus(payload.phases, payload.todayYmd);
  }, [payload]);

  if (projects.length === 0) return null;

  const n = projects.length;
  const pillWidth = `calc((100% - 0.5rem) / ${n})`;

  return (
    <section id={sectionId} aria-label="Project progress" className="mt-10">
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        <h2 className="section-heading shrink-0">Progress</h2>
        {onRequestClose ? (
          <DialogCloseButton aria-label="Close progress" className="shrink-0" onClick={onRequestClose} />
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div
          role="tablist"
          aria-label="Choose project for progress"
          className="relative mx-auto inline-flex min-w-min shrink-0 rounded-full border p-1"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1 top-1 bottom-1 z-[1] rounded-full motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0.2,1)]"
            style={{
              width: pillWidth,
              transform: `translateX(calc(${activeIndex} * 100%))`,
              background: "var(--app-text)",
              boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
            }}
          />
          {projects.map((p, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={[
                  "relative z-[2] inline-flex h-10 min-w-[6rem] shrink-0 flex-1 items-center justify-center rounded-full px-3 text-center text-sm transition-colors cursor-pointer",
                  selected
                    ? "font-medium text-[var(--app-surface)]"
                    : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                ].join(" ")}
                onClick={() => setActiveIndex(i)}
              >
                <span className="max-w-[10rem] truncate">{p.customer_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loadError ? (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-sm" style={{ color: "var(--app-danger)" }}>{loadError}</p>
          <button type="button" className="btn-secondary text-xs" onClick={() => onRetry(activeProjectId)}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-muted-canvas">Loading progress…</p>
      ) : payload ? (
        <div className="mt-6 space-y-8">
          <ProjectSummaryStrip
            embedded
            completedAt={null}
            phaseStatus={phaseStatus}
            integrationCount={payload.integrations.length}
            actualsVsForecast={payload.actualsVsForecast ?? makeWeekTotals(0, 0)}
            projectForecastStats={payload.projectForecastStats}
          />

          <HomeProgressTimeline phases={payload.phases} todayYmd={payload.todayYmd} />

          <HomeProgressKanban
            integrations={payload.integrations}
            onIntegrationsChange={(integrations) =>
              onPayloadChange(activeProjectId, { ...payload, integrations })
            }
          />
        </div>
      ) : null}
    </section>
  );
}
