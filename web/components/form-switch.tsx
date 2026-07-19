"use client";

import { useId } from "react";

export function FormSwitch({
  name,
  label,
  description,
  defaultChecked = false,
  disabled = false,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--app-text)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-[var(--app-text-muted)]">{description}</span>
        ) : null}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          id={id}
          name={name}
          type="checkbox"
          role="switch"
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-[var(--app-border)] transition-colors peer-checked:bg-[var(--app-action)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--app-action)_45%,transparent)] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
        <span className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-[var(--app-surface)] shadow-sm transition-transform peer-checked:translate-x-5 motion-reduce:transition-none" />
      </span>
    </label>
  );
}
