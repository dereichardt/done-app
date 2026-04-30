"use client";

import { patchProjectIntegrationStatus } from "@/lib/actions/projects";
import {
  formatDeliveryProgressLabel,
  PROJECT_DELIVERY_PROGRESS_VALUES,
} from "@/lib/integration-metadata";
import { formatIntegrationUpdateWhen } from "@/lib/integration-update-display";
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DeliveryProgressTransitionRow } from "./integration-status-and-progress-section";

type DeliveryTrackProps = {
  projectIntegrationId: string;
  integrationState: string;
  integrationStateReason: string | null;
  value: string;
  transitions: DeliveryProgressTransitionRow[];
  onChange: (next: string) => void;
};

export function IntegrationDeliveryProgressTrack({
  projectIntegrationId,
  integrationState,
  integrationStateReason,
  value,
  transitions,
  onChange,
}: DeliveryTrackProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveGen = useRef(0);
  const values = PROJECT_DELIVERY_PROGRESS_VALUES as readonly string[];
  const milestoneDeliverables = useMemo(
    () => new Set(["ready_for_e2e_testing", "ready_for_production"]),
    [],
  );

  const currentIndex = useMemo(() => {
    const idx = values.indexOf(value);
    return idx >= 0 ? idx : 0;
  }, [value, values]);

  const transitionMetaByStep = useMemo(() => {
    const stepOrder = new Map(values.map((step, index) => [step, index] as const));
    const meta: Record<string, { completedAt: string | null; skippedAt: string | null }> = Object.fromEntries(
      values.map((step) => [step, { completedAt: null, skippedAt: null }] as const),
    );
    const entered = new Set<string>();

    for (const transition of transitions) {
      const fromIdx = stepOrder.get(transition.from_delivery_progress);
      const toIdx = stepOrder.get(transition.to_delivery_progress);
      if (fromIdx == null || toIdx == null) continue;

      if (toIdx > fromIdx) {
        for (let idx = fromIdx + 1; idx < toIdx; idx += 1) {
          const skippedStep = values[idx];
          if (entered.has(skippedStep)) continue;
          meta[skippedStep].skippedAt = transition.created_at;
        }
      }

      const toStep = values[toIdx];
      entered.add(toStep);
      meta[toStep].completedAt = transition.created_at;
      meta[toStep].skippedAt = null;
    }

    return meta;
  }, [transitions, values]);

  const reasonOrNull = useCallback(
    (r: string | null) => {
      const t = String(r ?? "").trim();
      if (integrationState === "active") return null;
      return t === "" ? null : t;
    },
    [integrationState],
  );

  const patchDelivery = useCallback(
    (next: string) => {
      const gen = ++saveGen.current;
      onChange(next);
      setSaveError(null);
      void (async () => {
        const res = await patchProjectIntegrationStatus(projectIntegrationId, {
          delivery_progress: next,
          integration_state: integrationState,
          integration_state_reason: reasonOrNull(integrationStateReason),
        });
        if (gen !== saveGen.current) return;
        if (res.error) {
          setSaveError(res.error);
          return;
        }
        setSaveError(null);
      })();
    },
    [integrationState, integrationStateReason, onChange, projectIntegrationId, reasonOrNull],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(values.length - 1, currentIndex + delta));
    const nextValue = values[nextIndex];
    if (nextValue === value) return;
    patchDelivery(nextValue);
  };

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-2">
        <h2 className="section-heading">Delivery Progress</h2>
        <div className="card-canvas p-3 sm:p-4">
          <div
            role="radiogroup"
            aria-label="Delivery progress timeline"
            className="relative overflow-x-auto pt-2 pb-1"
            onKeyDown={handleKeyDown}
          >
            <div className="relative min-w-max">
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 top-3 h-[2px]"
                style={{ background: "var(--app-border)" }}
              />
              <ol
                className="relative z-[1] grid list-none gap-x-3 p-0"
                style={{ gridTemplateColumns: `repeat(${values.length}, minmax(7.5rem, 1fr))` }}
              >
                {values.map((step, index) => {
                  const completed = index < currentIndex;
                  const current = index === currentIndex;
                  const isMilestoneDeliverable = milestoneDeliverables.has(step);
                  const milestoneUpcoming = isMilestoneDeliverable && !completed && !current;
                  const label = formatDeliveryProgressLabel(step);
                  const stateLabel = current ? "Current step" : completed ? "Completed step" : "Upcoming step";
                  const completionMeta = transitionMetaByStep[step] ?? { completedAt: null, skippedAt: null };
                  const hoverText = completionMeta.skippedAt
                    ? `Skipped on ${formatIntegrationUpdateWhen(completionMeta.skippedAt)}`
                    : completionMeta.completedAt
                      ? `Completed on ${formatIntegrationUpdateWhen(completionMeta.completedAt)}`
                      : "Completed date unavailable";

                  return (
                    <li key={step} className="flex min-w-[7.5rem] flex-col items-center gap-1.5 text-center">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={current}
                        aria-label={`${label}. ${stateLabel}.`}
                        className={`group relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] transition-[background-color,border-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${current ? "active-work-session-indicator--live focus-visible:outline-[var(--app-action)]" : "focus-visible:outline-[var(--app-focus)]"}`}
                        style={{
                          borderColor: completed
                            ? "var(--app-text)"
                            : current
                              ? "var(--app-action)"
                              : milestoneUpcoming
                                ? "var(--app-text-muted)"
                                : "var(--app-border)",
                          borderStyle: current ? "dotted" : "solid",
                          borderWidth: current || milestoneUpcoming ? "2px" : "1px",
                          background: completed
                            ? "var(--app-text)"
                            : current
                              ? "color-mix(in oklab, var(--app-action) 14%, var(--app-surface) 86%)"
                              : "var(--app-surface)",
                        }}
                        onClick={() => patchDelivery(step)}
                      />
                      {current ? (
                        <span
                          className="mt-2 inline-flex min-h-[2rem] max-w-full items-center justify-center text-xs leading-tight font-semibold"
                          style={{
                            color: "var(--app-action)",
                          }}
                        >
                          {label}
                        </span>
                      ) : (
                        <span
                          className="line-clamp-2 mt-2 inline-flex min-h-[2rem] items-center justify-center text-[11px] leading-tight"
                          style={{ color: "var(--app-text-muted)" }}
                          title={completed ? hoverText : undefined}
                        >
                          {label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          {saveError ? (
            <p className="mt-2 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
