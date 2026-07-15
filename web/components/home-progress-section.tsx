"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProjectSummaryStrip } from "@/app/projects/[id]/project-summary-strip";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { HomeProgressKanban } from "@/components/home-progress-kanban";
import { HomeProgressTimeline } from "@/components/home-progress-timeline";
import { loadHomeProjectStatus } from "@/lib/actions/home-project-status";
import type { HomeProjectPickerRow } from "@/lib/actions/home";
import { makeWeekTotals } from "@/lib/home-actuals-vs-forecast";
import type { HomeProjectStatusPayload } from "@/lib/home-project-status";
import { resolvePhaseStatus } from "@/lib/project-phase-status";

export function HomeProgressSection({
  projects,
  initialPayload,
  initialError,
  sectionId,
  onRequestClose,
}: {
  projects: HomeProjectPickerRow[];
  initialPayload?: HomeProjectStatusPayload;
  initialError?: string;
  sectionId?: string;
  onRequestClose?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [payload, setPayload] = useState<HomeProjectStatusPayload | null>(() => initialPayload ?? null);
  const [loadError, setLoadError] = useState<string | null>(() => initialError ?? null);
  const [loading, setLoading] = useState(() => projects.length > 0 && !initialPayload && !initialError);

  const activeProjectId = projects[activeIndex]?.id ?? "";
  const skipFirstFetchForPrefetch = useRef(initialPayload != null);

  const refresh = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    const res = await loadHomeProjectStatus(projectId);
    if (res.error) {
      setLoadError(res.error);
      setPayload(null);
    } else if (res.payload) {
      setPayload(res.payload);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    if (skipFirstFetchForPrefetch.current) {
      skipFirstFetchForPrefetch.current = false;
      if (initialPayload != null && projects[0]?.id === activeProjectId) {
        return;
      }
    }
    queueMicrotask(() => {
      void refresh(activeProjectId);
    });
  }, [activeProjectId, initialPayload, projects, refresh]);

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
        <p className="mt-3 text-sm" style={{ color: "var(--app-danger)" }}>
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-muted-canvas">Loading progress…</p>
      ) : payload ? (
        <div className="mt-6 space-y-8">
          <HomeProgressTimeline phases={payload.phases} todayYmd={payload.todayYmd} />

          <ProjectSummaryStrip
            embedded
            completedAt={null}
            phaseStatus={phaseStatus}
            integrationCount={payload.integrations.length}
            actualsVsForecast={payload.actualsVsForecast ?? makeWeekTotals(0, 0)}
          />

          <HomeProgressKanban integrations={payload.integrations} />
        </div>
      ) : null}
    </section>
  );
}
