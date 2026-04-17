import type { ReactNode } from "react";
import type { ProjectListRowSummary } from "@/lib/load-project-list-summaries";
import {
  formatPhaseDate,
  formatPhaseDaysRemainingLabel,
  type PhaseStatusResult,
} from "@/lib/project-phase-status";

/** Match project type · role line on the same row (`text-xs leading-snug text-muted-canvas`). */
const labelClass = "text-xs leading-snug text-muted-canvas";

const colBase = "max-w-[7.5rem] shrink-0 text-right";
/** Phase name needs more room before truncating. */
const phaseNameColClass = "min-w-[10rem] max-w-[18rem] shrink-0 text-right";

const valueClass = "mt-0.5 truncate text-sm font-medium tabular-nums";

function MetricCol({
  label,
  value,
  className = colBase,
}: {
  label: string;
  value: ReactNode;
  /** Column width wrapper; phase column uses a wider value. */
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

function phaseNameColumn(phaseStatus: PhaseStatusResult) {
  if (phaseStatus.kind === "empty") {
    return <MetricCol className={phaseNameColClass} label="Current phase" value="—" />;
  }
  if (phaseStatus.kind === "unset") {
    return <MetricCol className={phaseNameColClass} label="Current phase" value="—" />;
  }
  if (phaseStatus.kind === "active") {
    return <MetricCol className={phaseNameColClass} label="Current phase" value={phaseStatus.name} />;
  }
  if (phaseStatus.kind === "upcoming") {
    return <MetricCol className={phaseNameColClass} label="Next phase" value={phaseStatus.name} />;
  }
  return <MetricCol className={phaseNameColClass} label="Phase" value={phaseStatus.name} />;
}

function phaseDatesColumn(phaseStatus: PhaseStatusResult) {
  if (phaseStatus.kind === "empty") {
    return <MetricCol label="Phase dates" value="—" />;
  }
  if (phaseStatus.kind === "unset") {
    return <MetricCol label="Phase dates" value="—" />;
  }
  if (phaseStatus.kind === "active") {
    return (
      <MetricCol
        label={`Ends ${formatPhaseDate(phaseStatus.endDate)}`}
        value={formatPhaseDaysRemainingLabel(phaseStatus.daysRemaining)}
      />
    );
  }
  if (phaseStatus.kind === "upcoming") {
    return (
      <MetricCol
        label={`Ends ${formatPhaseDate(phaseStatus.endDate)}`}
        value={formatPhaseDaysRemainingLabel(phaseStatus.daysUntilEnd)}
      />
    );
  }
  return (
    <MetricCol
      label={`Ended ${formatPhaseDate(phaseStatus.endedDate)}`}
      value="Complete"
    />
  );
}

export function ProjectRowSummaryMetrics({
  phaseStatus,
  activeIntegrationCount,
  blockedOnHoldCount,
}: ProjectListRowSummary) {
  return (
    <div
      className="flex shrink-0 items-center justify-end gap-x-3 sm:gap-x-4"
      aria-label="Project summary metrics"
    >
      {phaseNameColumn(phaseStatus)}
      {phaseDatesColumn(phaseStatus)}
      <MetricCol label="Active integrations" value={activeIntegrationCount} />
      <MetricCol label="Blocked / on hold" value={blockedOnHoldCount} />
    </div>
  );
}
