"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { InitiativeRowSummaryMetrics } from "@/components/initiative-row-summary-metrics";
import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  MetricsVisibilityToggle,
  ROW_METRICS_INITIATIVES_STORAGE_KEY,
  readRowMetricsAlwaysFromStorage,
  subscribeRowMetricsAlways,
  toggleRowMetricsAlways,
} from "@/components/metrics-visibility-toggle";
import { formatDateDisplay } from "@/lib/integration-task-helpers";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

export type InternalInitiativeListRow = {
  id: string;
  title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  completed_at: string | null;
  icp: boolean | null;
};

export type InitiativeTaskCounts = {
  open: number;
};

function InitiativeList({
  initiatives,
  countsByInitiativeId,
  metricsVisible,
  todayIso,
}: {
  initiatives: InternalInitiativeListRow[];
  countsByInitiativeId: Record<string, InitiativeTaskCounts>;
  metricsVisible: string;
  todayIso: string;
}) {
  return (
    <ul className="card-canvas overflow-hidden p-0">
      {initiatives.map((initiative) => {
        const title = (initiative.title ?? "").trim() || "Untitled";
        const counts = countsByInitiativeId[initiative.id] ?? { open: 0 };
        const completed = initiative.completed_at != null;
        const startLabel = formatDateDisplay(initiative.starts_on);
        const endLabel = formatDateDisplay(initiative.ends_on);
        const rangeSubtitle =
          startLabel === "—" && endLabel === "—"
            ? "Dates not set"
            : `${startLabel} – ${endLabel}`;

        return (
          <li
            key={initiative.id}
            className={[
              "group border-t first:border-t-0",
              completed ? "opacity-70" : "",
            ].join(" ")}
            style={{ borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" }}
          >
            <Link
              href={`/internal/initiatives/${initiative.id}`}
              className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:bg-[var(--app-surface-alt)] focus-visible:outline-none"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium leading-snug" style={{ color: "var(--app-text)" }}>
                  <span className="min-w-0 truncate">{title}</span>
                  {initiative.icp ? <InitiativeIcpPill /> : null}
                  {completed ? (
                    <span className="ml-1.5 font-normal text-muted-canvas">· Completed</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-canvas">{rangeSubtitle}</p>
              </div>
              <div className={`${metricsVisible} min-w-0 items-center`}>
                <InitiativeRowSummaryMetrics
                  startsOn={initiative.starts_on}
                  endsOn={initiative.ends_on}
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
  );
}

export function InternalInitiativesSection({
  activeInitiatives,
  completedInitiatives,
  countsByInitiativeId,
  todayIso,
}: {
  activeInitiatives: InternalInitiativeListRow[];
  completedInitiatives: InternalInitiativeListRow[];
  countsByInitiativeId: Record<string, InitiativeTaskCounts>;
  /** User calendar day YYYY-MM-DD for days-remaining metric. */
  todayIso: string;
}) {
  const completedPopoverId = useId();
  const completedTriggerRef = useRef<HTMLButtonElement>(null);
  const completedPopoverRef = useRef<HTMLDivElement>(null);
  const [completedPopoverOpen, setCompletedPopoverOpen] = useState(false);
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

  const positionCompletedPopover = useCallback(() => {
    const trigger = completedTriggerRef.current;
    const popover = completedPopoverRef.current;
    if (!trigger || !popover || !popover.matches(":popover-open")) return;

    const margin = 8;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - popoverRect.width - margin,
      Math.max(margin, triggerRect.right - popoverRect.width),
    );
    const top =
      triggerRect.bottom + gap + popoverRect.height <= window.innerHeight - margin
        ? triggerRect.bottom + gap
        : Math.max(margin, triggerRect.top - popoverRect.height - gap);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }, []);

  useEffect(() => {
    const popover = completedPopoverRef.current;
    if (!popover) return;

    const onToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === "open";
      setCompletedPopoverOpen(open);
      if (open) requestAnimationFrame(positionCompletedPopover);
    };
    popover.addEventListener("toggle", onToggle);
    return () => popover.removeEventListener("toggle", onToggle);
  }, [positionCompletedPopover]);

  useEffect(() => {
    const reposition = () => positionCompletedPopover();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [positionCompletedPopover]);

  const toggleCompletedPopover = useCallback(() => {
    const popover = completedPopoverRef.current;
    if (!popover) return;
    if (popover.matches(":popover-open")) {
      popover.hidePopover();
    } else {
      popover.showPopover();
    }
  }, []);

  return (
    <>
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
            <button
              ref={completedTriggerRef}
              type="button"
              className="btn-cta-tertiary shrink-0 whitespace-nowrap"
              aria-expanded={completedPopoverOpen}
              aria-controls={completedPopoverId}
              onClick={toggleCompletedPopover}
            >
              Completed Initiatives
            </button>
            <Link href="/internal/initiatives/new" className="btn-cta shrink-0 text-sm">
              Add initiative
            </Link>
          </div>
        </div>
        {activeInitiatives.length === 0 ? (
          <p className="text-sm text-muted-canvas">No active initiatives.</p>
        ) : (
          <div className="mt-4">
            <InitiativeList
              initiatives={activeInitiatives}
              countsByInitiativeId={countsByInitiativeId}
              metricsVisible={metricsVisible}
              todayIso={todayIso}
            />
          </div>
        )}
      </section>

      <div
        ref={completedPopoverRef}
        id={completedPopoverId}
        popover="auto"
        role="dialog"
        aria-labelledby={`${completedPopoverId}-title`}
        className="z-[200] m-0 h-[min(42rem,calc(100vh-2rem))] w-[min(64rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--app-radius)] border p-5 shadow-lg"
        style={{
          position: "fixed",
          inset: "auto",
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id={`${completedPopoverId}-title`} className="section-heading m-0">
            Completed Initiatives
          </h3>
          <DialogCloseButton onClick={() => completedPopoverRef.current?.hidePopover()} />
        </div>
        {completedInitiatives.length === 0 ? (
          <p className="text-sm text-muted-canvas">No completed initiatives.</p>
        ) : (
          <InitiativeList
            initiatives={completedInitiatives}
            countsByInitiativeId={countsByInitiativeId}
            metricsVisible={metricsVisible}
            todayIso={todayIso}
          />
        )}
      </div>
    </>
  );
}
