export function InitiativeIcpPill({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-[var(--app-border)] bg-[var(--app-info-surface)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--app-text)] ${className}`}
      aria-label="ICP initiative"
    >
      ICP
    </span>
  );
}
