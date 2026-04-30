/**
 * Shared types, prompt templates, and range-resolution helpers for the
 * Summarize Activity feature.
 *
 * Kept provider-agnostic so the Route Handler (which actually calls the LLM)
 * and the server actions (which read history) can share the same vocabulary.
 */

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

export const SUMMARIZE_SYSTEM_PROMPT = `You are summarizing project activity for a consultant-style project manager who uses this app to track integration delivery for client engagements.

Tone: concise, specific, neutral. No marketing voice. Never invent facts, dates, people, or statuses not supported by the transcript or the injected **Project context** block. When you infer momentum from work logs or updates, use cautious wording ("suggests", "indicates") and stay grounded in quoted themes from the data.

Required structure (Markdown only; the UI will render it):
1. **Overview** — 2–4 sentences. Lead with the **current timeline phase**, **time remaining** (or overdue / unset / complete) using the **Project context** block, and briefly what kind of work that phase represents for this engagement. Then summarize cross-cutting movement in the activity window (not integration-by-integration detail here). Do **not** mention tasks being **created** or opened.
2. **By integration** — For each integration that has at least one event in the window whose transcript third column is **not** "-":
   - A standalone line: **{Integration name}** (bold the name only; no # headings).
   - Immediately below, a Markdown bullet list with "- " at the start of each line.
   - **Synthesize progress**, not only list raw events: combine **work_session**, **manual_task**, **meeting** rows using **work accomplished** text, titles, and durations; use **update** body snippets; use **integration_state** lines and the snapshot lines in **Project context** for recorded delivery progress and state. Explain how delivery appears to be moving for that integration. Keep bullets tight (usually 2–6); merge noise.
   - For **integration_linked** events, phrase as **Integration {name} has been assigned** (the transcript wording should already match).
   - **Architect & Configure**: when **Project context** shows the active phase has internal id **architect_configure** (or the phase name clearly matches Architect & Configure), treat that phase as spanning delivery work from **gathering requirements** through **development** and **unit testing** (and closely related delivery-progress values). If **little time remains** in that phase (from context) while an integration's **recorded delivery progress** in context is still very early (e.g. gathering requirements, not started), briefly call that out as a schedule/progress risk or attention item—without inventing numbers.
   - Cite dates inline where helpful (e.g. "Apr 17").
3. **Project management** — If any events in the window have "-" in the third column (project-management scope), include this section with title **Project management** and a "- " bullet list. Summarize PM-track **work sessions**, **manual tasks**, **meetings**, **task completions**, and any project-level **updates** or lifecycle/phase items that belong here—not under a specific integration. If there are **no** such rows, **omit this entire section**.
   - **Meetings**: do **not** list every meeting when there are many. If meeting activity is dense, use **one or two** bullets that roll up approximate count or "several sessions", total rough time if you can sum durations from the lines, and **themes** from titles/work accomplished—instead of a meeting-by-meeting list.

If the window has **no** integration-scoped events (no third-column names), still write **Overview**; omit **By integration** or keep it to one short note that integration-scoped activity was absent; use **Project management** if applicable.

Formatting rules:
- Use **Bold label** for section titles (**Overview**, **By integration**, **Project management**, and each **Integration name**).
- Use "- " bullets under each integration and under **Project management**.
- Do not use # / ## / ### ATX headings. Do not use HTML. Do not use fenced code blocks.
- Put a blank line between major sections.

Keep the total response under ~450 words.`;

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

/**
 * Serialize normalized `ActivityEvent[]` into a compact transcript the LLM can
 * reason over. One line per event, pipe-delimited, most-recent first.
 */
export function renderActivityTranscript(events: ActivityEvent[]): string {
  if (events.length === 0) {
    return "(no activity in this time window)";
  }
  const lines = events.map((e) => {
    const parts = [
      e.occurredAt,
      e.kind,
      e.integrationName ?? "-",
      [e.summary, e.entity].filter(Boolean).join(" "),
    ];
    if (e.secondary) parts.push(e.secondary.replace(/\s+/g, " "));
    return parts.join(" | ");
  });
  return lines.join("\n");
}

/**
 * Build the final user prompt combining metadata about the range and the
 * transcript. Kept as a pure function so it's trivial to unit-test later.
 */
export function buildSummaryUserPrompt(args: {
  customerName: string | null;
  rangeStart: string;
  rangeEnd: string;
  events: ActivityEvent[];
  projectContextBlock: string;
}): string {
  const header = `Project: ${args.customerName ?? "(unnamed project)"}\nTime window: ${args.rangeStart} → ${args.rangeEnd}\nActivities in window: ${args.events.length}`;
  const eventsIntro =
    "Events (newest first). Third column is the integration name, or \"-\" for project-management-scoped activity (those belong under **Project management**, not under a specific integration).";
  return `${header}\n\n${args.projectContextBlock}\n\n${eventsIntro}\n${renderActivityTranscript(args.events)}`;
}
