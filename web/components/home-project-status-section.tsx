"use client";

import { HomeStatusMeter } from "@/components/home-status-meter";
import { loadHomeProjectStatus } from "@/lib/actions/home-project-status";
import type { HomeProjectPickerRow } from "@/lib/actions/home";
import {
  buildTimelineModel,
  deliveryFillRatio,
  formatStatusHours,
  hoursFillRatio,
  type HomeProjectStatusPayload,
} from "@/lib/home-project-status";
import { PROJECT_DELIVERY_PROGRESS_VALUES } from "@/lib/integration-metadata";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function deliveryProgressMarkers(): { position: number }[] {
  const values = PROJECT_DELIVERY_PROGRESS_VALUES;
  if (values.length <= 2) return [];
  const out: { position: number }[] = [];
  for (let i = 1; i < values.length - 1; i += 1) {
    out.push({ position: i / (values.length - 1) });
  }
  return out;
}

const DELIVERY_MARKERS = deliveryProgressMarkers();

export function HomeProjectStatusSection({
  projects,
  initialPayload,
  initialError,
}: {
  projects: HomeProjectPickerRow[];
  initialPayload?: HomeProjectStatusPayload;
  initialError?: string;
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

  const timeline = useMemo(() => {
    if (!payload) return null;
    return buildTimelineModel(payload.phases, payload.todayYmd);
  }, [payload]);

  const projectHours = useMemo(() => {
    if (!payload) return null;
    const { actualHours, estimatedHours } = payload.projectTotals;
    const { fill, overEstimate } = hoursFillRatio(actualHours, estimatedHours > 0 ? estimatedHours : null);
    let caption: string;
    if (estimatedHours > 0) {
      caption = `${formatStatusHours(actualHours)} / ${formatStatusHours(estimatedHours)}`;
      if (overEstimate) caption += " (over estimate)";
    } else {
      caption =
        actualHours > 0 ? `${formatStatusHours(actualHours)} logged` : "No time logged yet";
    }
    return { fill, caption, actualHours, estimatedHours };
  }, [payload]);

  if (projects.length === 0) return null;

  const n = projects.length;
  const pillWidth = `calc((100% - 0.5rem) / ${n})`;

  return (
    <section aria-label="Project status" className="mt-10">
      <h2 className="section-heading">Status</h2>

      <div className="mt-4 overflow-x-auto pb-1">
        <div
          role="tablist"
          aria-label="Choose project for status"
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
                  selected ? "font-medium text-[var(--app-surface)]" : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
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
        <p className="mt-4 text-sm text-muted-canvas">Loading status…</p>
      ) : payload ? (
        <div className="mt-6 space-y-6">
          {payload.phases.length === 0 ? (
            <p className="text-sm text-muted-canvas">Add project phases to see a timeline.</p>
          ) : timeline && timeline.kind !== "empty" ? (
            <HomeStatusMeter
              label="Timeline"
              captionRight={
                timeline.kind === "dated"
                  ? `${timeline.spanStart} → ${timeline.spanEnd}`
                  : `${payload.phases.length} phases`
              }
              fillRatio={timeline.fillRatio}
              markers={
                timeline.kind === "dated"
                  ? timeline.phaseEndMarkers.map((m) => ({ position: m.ratio }))
                  : timeline.segmentMarkers.map((m) => ({ position: m.ratio }))
              }
              aria-label="Project phase timeline progress"
            />
          ) : null}

          {projectHours ? (
            <HomeStatusMeter
              label="Hours (project)"
              captionRight={projectHours.caption}
              fillRatio={projectHours.fill}
              markers={[]}
              aria-label="Total logged hours versus estimated hours for this project"
            />
          ) : null}

          {payload.integrations.length > 0 ? (
            <ul className="space-y-5 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
              {payload.integrations.map((integ) => {
                const dFill = deliveryFillRatio(integ.deliveryProgressIndex);
                const h = hoursFillRatio(integ.actualHours, integ.estimatedHours);
                const hoursCaption =
                  integ.estimatedHours != null && integ.estimatedHours > 0
                    ? `${formatStatusHours(integ.actualHours)} / ${formatStatusHours(integ.estimatedHours)}${
                        h.overEstimate ? " (over)" : ""
                      }`
                    : integ.actualHours > 0
                      ? `${formatStatusHours(integ.actualHours)} logged`
                      : "—";

                return (
                  <li key={integ.id} className="space-y-3">
                    <p className="text-sm font-medium text-[var(--app-text)]">{integ.title}</p>
                    <HomeStatusMeter
                      label="Delivery"
                      captionRight={integ.deliveryProgressLabel}
                      fillRatio={dFill}
                      markers={DELIVERY_MARKERS}
                      aria-label={`Delivery progress for ${integ.title}`}
                    />
                    <HomeStatusMeter
                      label="Hours"
                      captionRight={hoursCaption}
                      fillRatio={h.fill}
                      markers={[]}
                      aria-label={`Hours logged for ${integ.title}`}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-canvas">No integrations on this project yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
