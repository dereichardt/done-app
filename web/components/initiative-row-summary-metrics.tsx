import type { ReactNode } from "react";
import { calendarDaysFromTo, formatPhaseDate, formatPhaseDaysRemainingLabel } from "@/lib/project-phase-status";

/** Match project row metrics (`project-row-summary-metrics.tsx`). */
const labelClass = "text-xs leading-snug text-muted-canvas";

const colBase = "max-w-[7.5rem] shrink-0 text-right";

const valueClass = "mt-0.5 truncate text-sm font-medium tabular-nums";

function dateOnly(iso: string | null | undefined): string | null {
  if (iso == null || iso.trim() === "") return null;
  const s = iso.trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatDateCell(iso: string | null | undefined): string {
  const d = dateOnly(iso);
  return d ? formatPhaseDate(d) : "—";
}

function MetricCol({
  label,
  value,
  className = colBase,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className={labelClass}>{label}</p>
      <div className={valueClass} style={{ color: "var(--app-text)" }}>
        {value}
      </div>
    </div>
  );
}

function formatDaysRemainingValue(
  todayIso: string,
  endsOn: string | null | undefined,
  isCompleted: boolean,
): string {
  if (isCompleted) return "—";
  const endD = dateOnly(endsOn);
  if (!endD) return "—";
  const n = calendarDaysFromTo(todayIso, endD);
  if (n < 0) return "Past due";
  return formatPhaseDaysRemainingLabel(n);
}

export function InitiativeRowSummaryMetrics({
  startsOn,
  endsOn,
  todayIso,
  openTaskCount,
  isCompleted,
}: {
  startsOn: string | null;
  endsOn: string | null;
  /** User calendar day YYYY-MM-DD (timezone-aware from server). */
  todayIso: string;
  openTaskCount: number;
  isCompleted: boolean;
}) {
  const ariaLabel = isCompleted ? "Completed initiative metrics" : "Initiative summary metrics";

  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 sm:gap-x-4"
      aria-label={ariaLabel}
    >
      <MetricCol label="Start date" value={formatDateCell(startsOn)} />
      <MetricCol label="End date" value={formatDateCell(endsOn)} />
      <MetricCol
        label="Days remaining"
        value={formatDaysRemainingValue(todayIso, endsOn, isCompleted)}
      />
      <MetricCol label="Open tasks" value={openTaskCount} />
    </div>
  );
}
