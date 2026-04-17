/** Filled arrows used in composer send control and project navigation (same path, mirrored for back). */

const ARROW_RIGHT_PATH =
  "M8.47 2.47a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06l2.72-2.72H3.25a.75.75 0 010-1.5h7.94L8.47 3.53a.75.75 0 010-1.06z";

export function CanvasArrowRightIcon({ className = "shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className={className}>
      <path fill="currentColor" d={ARROW_RIGHT_PATH} />
    </svg>
  );
}

export function CanvasArrowLeftIcon({ className = "shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      aria-hidden
      className={`origin-center -scale-x-100 ${className}`.trim()}
    >
      <path fill="currentColor" d={ARROW_RIGHT_PATH} />
    </svg>
  );
}
