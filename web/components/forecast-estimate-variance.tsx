"use client";

import { useCallback, useEffect, useId, useRef, useState, type AriaRole, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  formatSignedVarianceHours,
  type EstimateVariance,
  type ForecastPastPhaseSummary,
} from "@/lib/project-forecast";

function formatVarianceAbsHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  return `${Math.round(hours)}h`;
}

/**
 * Compact meter: fill vs a center target line.
 * Under = short of line, on = meets line, over = past line.
 * On-target fill matches portfolio capacity green at 32h.
 */
function VarianceTargetBar({
  kind,
  size = 20,
  className = "shrink-0",
}: {
  kind: EstimateVariance["kind"];
  size?: number;
  className?: string;
}) {
  // Track is x=1..21 (width 20). Center target at x=11.
  // Under/over leave a clear gap on either side of the line.
  const fillWidth = kind === "over" ? 16 : kind === "under" ? 4 : 10;
  const fillColor =
    kind === "on"
      ? "color-mix(in oklab, var(--app-success) 75%, transparent)"
      : "var(--app-text)";

  return (
    <svg
      viewBox="0 0 22 12"
      width={size}
      height={Math.round((size * 12) / 22)}
      aria-hidden
      className={`text-[var(--app-text-muted)] ${className}`}
    >
      <rect
        x="1"
        y="3.5"
        width="20"
        height="5"
        rx="1"
        fill="currentColor"
        opacity="0.22"
      />
      <rect
        x="1"
        y="3.5"
        width={fillWidth}
        height="5"
        rx="1"
        fill={fillColor}
      />
      <path
        d="M11 1.25v9.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M8 7.25v4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="8" cy="5" r="0.85" fill="currentColor" />
    </svg>
  );
}

function PastPhaseDetailsContent({ summary }: { summary: ForecastPastPhaseSummary }) {
  const pastLabels = summary.pastPhases
    .filter((p) => p.hours > 0)
    .map((p) => `${p.label} (${p.percent}%)`)
    .join(", ");
  const activeLabels = summary.activePhases.map((p) => p.label).join(", ");

  return (
    <>
      <p className="text-[var(--app-text-muted)]">
        From prior stages{pastLabels ? ` (${pastLabels})` : ""} that are already past the
        forecast start
        {activeLabels ? `. Still spreading ${activeLabels}` : ""}. Held as under estimate
        unless included in the forecast spread.
      </p>
      {summary.pastPhases.some((p) => p.hours > 0) ? (
        <ul className="mt-2 space-y-0.5 text-[var(--app-text-muted)]">
          {summary.pastPhases
            .filter((p) => p.hours > 0)
            .map((p) => (
              <li key={p.phase_key} className="flex justify-between gap-4 tabular-nums">
                <span>{p.label}</span>
                <span>
                  {p.hours}h ({p.percent}%)
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </>
  );
}

function PastPhaseInfoHover({ summary }: { summary: ForecastPastPhaseSummary }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 320;
    const margin = 8;
    let left = rect.left;
    left = Math.min(left, window.innerWidth - width - margin);
    left = Math.max(margin, left);
    setCoords({
      left,
      top: rect.bottom + 6,
    });
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    updatePosition();
    setOpen(true);
  }, [clearHideTimer, updatePosition]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setOpen(false), 120);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        aria-label="Past stage hours details"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
      >
        <InfoIcon />
      </button>
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="fixed z-[250] w-[min(20rem,calc(100vw-2rem))] rounded-md border px-3 py-2 text-xs leading-snug shadow-md"
              style={{
                left: coords.left,
                top: coords.top,
                color: "var(--app-text)",
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
              }}
              onMouseEnter={clearHideTimer}
              onMouseLeave={scheduleHide}
            >
              <PastPhaseDetailsContent summary={summary} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Compact variance value for studio / cards: target bar + signed hours.
 * Hours are signed (+ under / − over). Direction is also conveyed by fill vs the
 * center target line and the parent subheading — no warning color chrome.
 */
export function EstimateVarianceLabel({
  variance,
  previous,
  className,
  trailing,
  formatHours = formatVarianceAbsHours,
  role,
}: {
  variance: EstimateVariance;
  /** When set and different from live, show struck previous hours → live. */
  previous?: EstimateVariance;
  className?: string;
  /** Optional control after hours (e.g. past-phase info). */
  trailing?: ReactNode;
  /** Formats magnitude only; sign is applied by the label. */
  formatHours?: (hours: number) => string;
  role?: AriaRole;
}) {
  const showPrevious =
    previous != null && previous.label !== variance.label;
  const hoursText = formatSignedVarianceHours(variance.variance, formatHours);
  const previousHoursText =
    previous == null
      ? null
      : formatSignedVarianceHours(previous.variance, formatHours);
  const title = showPrevious
    ? `Original ${previous.label} → ${variance.label}`
    : variance.label;

  return (
    <div
      className={`flex min-w-0 items-center gap-1 font-medium text-[var(--app-text)] ${className ?? "text-xs"}`}
      title={title}
      role={role}
    >
      <span className="inline-flex min-w-0 items-center gap-1 truncate tabular-nums">
        {showPrevious ? (
          <>
            <span className="line-through opacity-70">{previousHoursText}</span>
            <span aria-hidden>→</span>
          </>
        ) : null}
        <VarianceTargetBar kind={variance.kind} />
        <span>{hoursText}</span>
      </span>
      {trailing}
    </div>
  );
}

export function ForecastEstimateVariancePanel({
  summary,
  includePastPhaseHours = false,
  compact = false,
  inline = false,
  valueOnly = false,
  hideValue = false,
}: {
  summary: ForecastPastPhaseSummary | null;
  /** When true, past hours go on the grid — show include messaging. */
  includePastPhaseHours?: boolean;
  compact?: boolean;
  inline?: boolean;
  valueOnly?: boolean;
  hideValue?: boolean;
}) {
  if (!summary || summary.remainingHours <= 0) return null;

  if (summary.pastPhaseHours <= 0) {
    if (compact || inline) return null;
    return (
      <p className="text-xs text-[var(--app-text-muted)]">
        No hours from prior stages — all remaining stage % fall in the forecast window.
      </p>
    );
  }

  if (inline) {
    if (hideValue) {
      return <PastPhaseInfoHover summary={summary} />;
    }
    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--app-text)]">
        <span className="font-medium tabular-nums">
          {valueOnly
            ? `${summary.pastPhaseHours}h`
            : includePastPhaseHours
              ? `${summary.pastPhaseHours}h included in spread`
              : `Under estimate by ${summary.pastPhaseHours}h`}
        </span>
        <PastPhaseInfoHover summary={summary} />
      </div>
    );
  }

  const pastLabels = summary.pastPhases
    .filter((p) => p.hours > 0)
    .map((p) => `${p.label} (${p.percent}%)`)
    .join(", ");
  const activeLabels = summary.activePhases.map((p) => p.label).join(", ");

  return (
    <div
      className={
        compact
          ? "text-xs text-[var(--app-text-muted)]"
          : "rounded-lg border border-[var(--app-border)] bg-[var(--app-info-surface)] px-3 py-2.5 text-sm"
      }
    >
      <p className={compact ? undefined : "font-medium text-[var(--app-text)]"}>
        {includePastPhaseHours ? (
          <>
            <span className="tabular-nums">{summary.pastPhaseHours}</span> hours from prior
            stages will be included in the forecast spread
          </>
        ) : (
          <>
            Under estimate by <span className="tabular-nums">{summary.pastPhaseHours}</span>h
            {!compact ? (
              <span className="font-normal text-[var(--app-text-muted)]">
                {" "}
                of {summary.remainingHours} remaining
              </span>
            ) : null}
          </>
        )}
      </p>
      <p className={compact ? "mt-0.5" : "mt-1 text-xs text-[var(--app-text-muted)]"}>
        From prior stages{pastLabels ? ` (${pastLabels})` : ""} that are already past the
        forecast start
        {activeLabels ? `. Spreading ${activeLabels}` : ""}.
        {includePastPhaseHours
          ? " Spread evenly across the remaining forecast weeks."
          : " Held off the grid unless you include them in the spread."}
      </p>
      {!compact && summary.pastPhases.some((p) => p.hours > 0) ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--app-text-muted)]">
          {summary.pastPhases
            .filter((p) => p.hours > 0)
            .map((p) => (
              <li key={p.phase_key} className="flex justify-between gap-3 tabular-nums">
                <span>{p.label}</span>
                <span>
                  {p.hours}h ({p.percent}%)
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer ForecastEstimateVariancePanel */
export { ForecastEstimateVariancePanel as ForecastBankedSummaryPanel };
