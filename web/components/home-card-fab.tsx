"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * Compact card-scoped FAB for home dashboard cards.
 * Smaller and inverted vs the page-level HomeCreateFab (dark 56px).
 */
export function HomeCardFab({
  className,
  "aria-label": ariaLabel = "Add",
  type,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]";
  return (
    <button
      type={type ?? "button"}
      aria-label={ariaLabel}
      className={className ? `${base} ${className}` : base}
      style={{
        borderColor: "color-mix(in oklab, var(--app-border) 55%, var(--app-text-muted) 45%)",
        background: "var(--app-surface)",
        color: "var(--app-text-muted)",
        boxShadow:
          "var(--app-shadow-card), 0 2px 8px color-mix(in oklab, var(--app-text) 14%, transparent)",
        ...style,
      }}
      {...rest}
    >
      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden className="shrink-0">
        <path
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          d="M8 3v10M3 8h10"
        />
      </svg>
    </button>
  );
}
