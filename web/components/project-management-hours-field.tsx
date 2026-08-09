"use client";

import { useId, useState } from "react";

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
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.85" fill="currentColor" />
    </svg>
  );
}

const HELP_TEXT =
  "Mostly used when your role is Lead, Architect, or Advisor.";

export function ProjectManagementHoursField({
  id,
  name = "project_management_estimated_hours",
  defaultValue,
}: {
  id?: string;
  name?: string;
  defaultValue?: number | null;
}) {
  const autoId = useId();
  const inputId = id ?? `pm-hours-${autoId}`;
  const tooltipId = useId();
  const [tipOpen, setTipOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium"
          style={{ color: "var(--app-text)" }}
        >
          Project Management Hours
        </label>
        <span className="relative inline-flex">
          <button
            type="button"
            className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
            aria-label="About Project Management Hours"
            aria-describedby={tipOpen ? tooltipId : undefined}
            onMouseEnter={() => setTipOpen(true)}
            onMouseLeave={() => setTipOpen(false)}
            onFocus={() => setTipOpen(true)}
            onBlur={() => setTipOpen(false)}
          >
            <InfoIcon />
          </button>
          {tipOpen ? (
            <span
              id={tooltipId}
              role="tooltip"
              className="absolute left-1/2 top-[calc(100%+0.35rem)] z-[120] w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border px-2 py-1.5 text-xs leading-snug shadow-md"
              style={{
                color: "var(--app-text)",
                background: "var(--app-surface)",
                borderColor: "var(--app-border)",
                boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
              }}
            >
              {HELP_TEXT}
            </span>
          ) : null}
        </span>
      </div>
      <input
        id={inputId}
        name={name}
        type="number"
        min="0"
        step="0.25"
        inputMode="decimal"
        defaultValue={
          defaultValue != null && Number.isFinite(defaultValue) ? defaultValue : undefined
        }
        className="input-canvas h-10 text-sm"
        placeholder="e.g. 40"
      />
    </div>
  );
}
