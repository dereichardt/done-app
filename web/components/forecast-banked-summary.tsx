"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ForecastBankedSummary } from "@/lib/project-forecast";

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

function BankedDetailsContent({ summary }: { summary: ForecastBankedSummary }) {
  const bankedLabels = summary.bankedPhases
    .filter((p) => p.hours > 0)
    .map((p) => `${p.label} (${p.percent}%)`)
    .join(", ");
  const activeLabels = summary.activePhases.map((p) => p.label).join(", ");

  return (
    <>
      <p className="text-[var(--app-text-muted)]">
        From prior stages{bankedLabels ? ` (${bankedLabels})` : ""} that are already past the
        forecast start. Placed at the end of Hypercare
        {activeLabels ? ` (after ${activeLabels})` : ""}. Raising earlier weeks draws from that
        bank first.
      </p>
      {summary.bankedPhases.some((p) => p.hours > 0) ? (
        <ul className="mt-2 space-y-0.5 text-[var(--app-text-muted)]">
          {summary.bankedPhases
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

function BankedInfoHover({ summary }: { summary: ForecastBankedSummary }) {
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
        aria-label="Banked hours details"
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
              <BankedDetailsContent summary={summary} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function ForecastBankedSummaryPanel({
  summary,
  compact = false,
  inline = false,
  /** When inline, show just “Nh” + info (for use under a Banked Hours label). */
  valueOnly = false,
  /** When inline + valueOnly, render only the info affordance (caller shows the value). */
  hideValue = false,
}: {
  summary: ForecastBankedSummary | null;
  compact?: boolean;
  /** Compact row: “N hours banked” + info icon with hover details (project card). */
  inline?: boolean;
  valueOnly?: boolean;
  hideValue?: boolean;
}) {
  if (!summary || summary.remainingHours <= 0) return null;

  if (summary.bankedHours <= 0) {
    if (compact || inline) return null;
    return (
      <p className="text-xs text-[var(--app-text-muted)]">
        No hours banked from prior stages — all remaining stage % still fall in the forecast
        window.
      </p>
    );
  }

  if (inline) {
    if (hideValue) {
      return <BankedInfoHover summary={summary} />;
    }
    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--app-text)]">
        <span className="font-medium tabular-nums">
          {valueOnly ? `${summary.bankedHours}h` : `${summary.bankedHours} hours banked`}
        </span>
        <BankedInfoHover summary={summary} />
      </div>
    );
  }

  const bankedLabels = summary.bankedPhases
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
        <span className="tabular-nums">{summary.bankedHours}</span> hours banked
        {!compact ? (
          <span className="font-normal text-[var(--app-text-muted)]">
            {" "}
            of {summary.remainingHours} remaining
          </span>
        ) : null}
      </p>
      <p className={compact ? "mt-0.5" : "mt-1 text-xs text-[var(--app-text-muted)]"}>
        From prior stages{bankedLabels ? ` (${bankedLabels})` : ""} that are already past the
        forecast start. Placed at the end of Hypercare
        {activeLabels ? ` (after ${activeLabels})` : ""}. Raising earlier weeks draws from
        that bank first.
      </p>
      {!compact && summary.bankedPhases.some((p) => p.hours > 0) ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--app-text-muted)]">
          {summary.bankedPhases
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
