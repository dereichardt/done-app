/** Shared deterministic report types and range helpers. */

import {
  formatDeliveryProgressLabel,
  formatIntegrationStateLabel,
} from "@/lib/integration-metadata";
import type { ActivityEvent } from "@/lib/project-activity";
import {
  formatPhaseDaysRemainingLabel,
  resolvePhaseStatus,
  type PhaseForStatus,
} from "@/lib/project-phase-status";

export const SUMMARY_RANGE_PRESETS = ["7d", "30d", "since_last_summary", "custom"] as const;
export type SummaryRangePreset = (typeof SUMMARY_RANGE_PRESETS)[number];

export type ProjectSummaryRecord = {
  id: string;
  projectId: string;
  rangeStart: string;
  rangeEnd: string;
  rangePreset: SummaryRangePreset | null;
  model: string;
  eventCount: number;
  body: string;
  generatedAt: string;
  expiresAt: string;
};

/** How long a generated summary stays visible in the history list. Matches the DB default. */
export const SUMMARY_EXPIRY_DAYS = 30;

/**
 * Resolve a preset into concrete ISO timestamps. `custom` requires the caller
 * to pass explicit `customStart`/`customEnd`. For `since_last_summary`, callers
 * must pass the latest previous `rangeEnd` as `sinceLastSummaryStart`; this
 * function does not query the database so it stays pure.
 */
export function resolveSummaryRange(
  preset: SummaryRangePreset,
  now: Date,
  opts: {
    customStart?: string;
    customEnd?: string;
    sinceLastSummaryStart?: string | null;
  } = {},
): { rangeStart: string; rangeEnd: string } {
  const rangeEnd = now.toISOString();
  if (preset === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { rangeStart: d.toISOString(), rangeEnd };
  }
  if (preset === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { rangeStart: d.toISOString(), rangeEnd };
  }
  if (preset === "since_last_summary") {
    if (opts.sinceLastSummaryStart) {
      return { rangeStart: opts.sinceLastSummaryStart, rangeEnd };
    }
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { rangeStart: d.toISOString(), rangeEnd };
  }
  if (!opts.customStart || !opts.customEnd) {
    throw new Error("custom range requires customStart and customEnd");
  }
  return { rangeStart: opts.customStart, rangeEnd: opts.customEnd };
}

export type SummarizePhaseRow = {
  name: string;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  phase_key: string | null;
};

export type SummarizeIntegrationSnapshot = {
  displayName: string;
  delivery_progress: string | null;
  integration_state: string | null;
};

/**
 * Deterministic block prepended to the summarization user prompt so the model
 * sees timeline position and current integration fields even when unchanged in-window.
 */
export function buildSummarizeProjectContextBlock(args: {
  asOfCalendarDay: string;
  phases: SummarizePhaseRow[];
  integrations: SummarizeIntegrationSnapshot[];
}): string {
  const lines: string[] = [];
  lines.push(`Project context (calendar as-of ${args.asOfCalendarDay}):`);

  const phaseForStatus: PhaseForStatus[] = args.phases.map((p) => ({
    name: p.name,
    sort_order: p.sort_order,
    start_date: p.start_date,
    end_date: p.end_date,
  }));
  const st = resolvePhaseStatus(phaseForStatus, args.asOfCalendarDay);

  if (st.kind === "empty") {
    lines.push("- Timeline: no phases configured.");
  } else if (st.kind === "unset") {
    lines.push(
      "- Timeline: phases exist but current position is unclear from dates (meaningful start/end dates improve this).",
    );
  } else if (st.kind === "active") {
    const row = args.phases.find(
      (p) =>
        p.start_date &&
        p.end_date &&
        p.start_date <= args.asOfCalendarDay &&
        args.asOfCalendarDay <= p.end_date,
    );
    const keySuffix =
      row?.phase_key && String(row.phase_key).trim().length > 0
        ? ` Internal phase id: ${row.phase_key}.`
        : "";
    lines.push(
      `- Current timeline phase: "${st.name}" through ${st.endDate} (${formatPhaseDaysRemainingLabel(st.daysRemaining)}).${keySuffix}`,
    );
  } else if (st.kind === "upcoming") {
    lines.push(
      `- Next phase with an end date on or after this as-of date: "${st.name}" (ends ${st.endDate}; ${formatPhaseDaysRemainingLabel(st.daysUntilEnd)}).`,
    );
  } else {
    lines.push(
      `- Relative to this as-of date, phased dates appear complete through "${st.name}" (last end date ${st.endedDate}).`,
    );
  }

  if (args.integrations.length === 0) {
    lines.push("- Integrations: none on this project.");
  } else {
    lines.push(
      "- Current integration status (recorded fields; may be unchanged during the activity window):",
    );
    for (const row of args.integrations) {
      const state = row.integration_state
        ? formatIntegrationStateLabel(row.integration_state)
        : "unknown state";
      const prog = row.delivery_progress
        ? formatDeliveryProgressLabel(row.delivery_progress)
        : "unknown delivery progress";
      lines.push(`  - ${row.displayName}: ${state} · ${prog}`);
    }
  }

  return lines.join("\n");
}

function normalizeReportText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatReportDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function eventBullet(event: ActivityEvent): string {
  const detail = [event.summary, event.entity, event.secondary]
    .map(normalizeReportText)
    .filter(Boolean)
    .join(" — ");
  return `- ${formatReportDate(event.occurredAt)}: ${detail || "Activity recorded"}`;
}

function eventBullets(events: ActivityEvent[]): string[] {
  const visible = events.slice(0, 6).map(eventBullet);
  if (events.length > visible.length) {
    visible.push(`- ${events.length - visible.length} additional activities recorded in this range.`);
  }
  return visible;
}

/** Build a stable Markdown activity report only from recorded project data. */
export function buildDeterministicProjectReport(args: {
  customerName: string | null;
  rangeStart: string;
  rangeEnd: string;
  events: ActivityEvent[];
  asOfCalendarDay: string;
  phases: SummarizePhaseRow[];
  integrations: SummarizeIntegrationSnapshot[];
}): string {
  const contextLines = buildSummarizeProjectContextBlock({
    asOfCalendarDay: args.asOfCalendarDay,
    phases: args.phases,
    integrations: args.integrations,
  });
  const timeline = contextLines
    .split("\n")
    .find((line) => line.startsWith("- Timeline:") || line.startsWith("- Current timeline") || line.startsWith("- Next phase") || line.startsWith("- Relative"));
  const projectName = normalizeReportText(args.customerName) || "Unnamed project";
  const lines = [
    "**Overview**",
    `${projectName} recorded ${args.events.length} ${args.events.length === 1 ? "activity" : "activities"} from ${formatReportDate(args.rangeStart)} through ${formatReportDate(args.rangeEnd)}.`,
    timeline ? timeline.replace(/^-\s*/, "") : "Timeline status is unavailable.",
  ];

  if (args.events.length === 0) {
    lines.push("No project or integration activity was recorded in this time window.");
  }

  const byIntegration = new Map<string, ActivityEvent[]>();
  const projectManagement: ActivityEvent[] = [];
  for (const event of args.events) {
    const integrationName = normalizeReportText(event.integrationName);
    if (!integrationName) {
      projectManagement.push(event);
      continue;
    }
    const group = byIntegration.get(integrationName) ?? [];
    group.push(event);
    byIntegration.set(integrationName, group);
  }

  if (byIntegration.size > 0) {
    lines.push("", "**By integration**");
    for (const integrationName of [...byIntegration.keys()].sort((a, b) => a.localeCompare(b))) {
      const events = byIntegration.get(integrationName) ?? [];
      const snapshot = args.integrations.find(
        (item) => item.displayName.toLocaleLowerCase() === integrationName.toLocaleLowerCase(),
      );
      lines.push("", `**${integrationName}**`);
      if (snapshot) {
        const state = snapshot.integration_state
          ? formatIntegrationStateLabel(snapshot.integration_state)
          : "Unknown state";
        const progress = snapshot.delivery_progress
          ? formatDeliveryProgressLabel(snapshot.delivery_progress)
          : "Unknown delivery progress";
        lines.push(`- Recorded status: ${state} · ${progress}.`);
      }
      lines.push(...eventBullets(events));
    }
  }

  if (projectManagement.length > 0) {
    lines.push("", "**Project management**", ...eventBullets(projectManagement));
  }

  const phaseStatus = resolvePhaseStatus(
    args.phases.map((phase) => ({
      name: phase.name,
      sort_order: phase.sort_order,
      start_date: phase.start_date,
      end_date: phase.end_date,
    })),
    args.asOfCalendarDay,
  );
  const activePhase = args.phases.find(
    (phase) =>
      phase.start_date &&
      phase.end_date &&
      phase.start_date <= args.asOfCalendarDay &&
      args.asOfCalendarDay <= phase.end_date,
  );
  const earlyProgress = new Set(["not_started", "gathering_requirements"]);
  if (
    phaseStatus.kind === "active" &&
    phaseStatus.daysRemaining <= 14 &&
    (activePhase?.phase_key === "architect_configure" ||
      activePhase?.name.toLocaleLowerCase().includes("architect"))
  ) {
    const attention = args.integrations
      .filter((item) => item.delivery_progress && earlyProgress.has(item.delivery_progress))
      .map((item) => item.displayName)
      .sort((a, b) => a.localeCompare(b));
    if (attention.length > 0) {
      lines.push(
        "",
        "**Attention**",
        `- ${attention.join(", ")} ${attention.length === 1 ? "is" : "are"} still recorded at an early delivery stage with ${formatPhaseDaysRemainingLabel(phaseStatus.daysRemaining)} in ${phaseStatus.name}.`,
      );
    }
  }

  return lines.join("\n");
}
