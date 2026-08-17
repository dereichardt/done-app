"use client";

import { useId } from "react";

export function SubtaskCheckbox({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy?: string;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="relative inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className="flex h-4 w-4 items-center justify-center rounded-[3px] border bg-[var(--app-surface)] transition-colors peer-checked:border-[color:var(--app-cta-dark-fill)] peer-checked:bg-[var(--app-cta-dark-fill)] peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-checked:[&>svg]:opacity-100"
        style={{ borderColor: "var(--app-border)" }}
        aria-hidden
      >
        <svg viewBox="0 0 16 16" className="pointer-events-none h-[11px] w-[11px] opacity-0" aria-hidden>
          <path
            d="M3.5 8 L7 11.5 L12.5 4.5"
            fill="none"
            stroke="var(--app-cta-dark-fg)"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
}
