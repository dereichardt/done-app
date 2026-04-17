import type { ButtonHTMLAttributes } from "react";

/**
 * Standard dialog dismiss control: icon-only "X" with a circular hover surface.
 * Use this in every modal/popover header that needs an explicit close affordance.
 *
 * - Renders as `<button type="button">` by default.
 * - Keyboard/screen-reader labeled via `aria-label` (defaults to "Close").
 * - Colors come from Canvas token aliases so the control tracks theme automatically.
 */
export function DialogCloseButton({
  className,
  "aria-label": ariaLabel = "Close",
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--app-text-muted)] transition-colors duration-150 hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]";
  return (
    <button
      type={type ?? "button"}
      aria-label={ariaLabel}
      className={className ? `${base} ${className}` : base}
      {...rest}
    >
      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden className="shrink-0">
        <path
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          d="M4 4l8 8M12 4l-8 8"
        />
      </svg>
    </button>
  );
}
