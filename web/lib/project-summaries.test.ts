import { describe, expect, it } from "vitest";

import type { ActivityEvent } from "@/lib/project-activity";
import { buildDeterministicProjectReport } from "@/lib/project-summaries";

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "event-1",
    kind: "work_session",
    occurredAt: "2026-07-18T12:00:00.000Z",
    summary: "Work logged",
    entity: "Mapping review",
    secondary: "1h",
    integrationName: "Payroll",
    link: null,
    ...overrides,
  };
}

const baseArgs = {
  customerName: "Acme",
  rangeStart: "2026-07-12T00:00:00.000Z",
  rangeEnd: "2026-07-19T00:00:00.000Z",
  asOfCalendarDay: "2026-07-19",
  phases: [
    {
      name: "Architect & Configure",
      sort_order: 1,
      start_date: "2026-07-01",
      end_date: "2026-07-25",
      phase_key: "architect_configure",
    },
  ],
  integrations: [
    {
      displayName: "Payroll",
      delivery_progress: "gathering_requirements",
      integration_state: "active",
    },
  ],
};

describe("buildDeterministicProjectReport", () => {
  it("groups integration and project-management activity with timeline context", () => {
    const report = buildDeterministicProjectReport({
      ...baseArgs,
      events: [
        event(),
        event({
          id: "event-2",
          summary: "Project update",
          entity: null,
          secondary: "Timeline confirmed",
          integrationName: null,
        }),
      ],
    });

    expect(report).toContain("**Overview**");
    expect(report).toContain('Current timeline phase: "Architect & Configure"');
    expect(report).toContain("**Payroll**");
    expect(report).toContain("Recorded status: Active · Gathering Requirements.");
    expect(report).toContain("**Project management**");
    expect(report).toContain("**Attention**");
  });

  it("states explicitly when a range contains no activity", () => {
    const report = buildDeterministicProjectReport({ ...baseArgs, events: [] });

    expect(report).toContain("recorded 0 activities");
    expect(report).toContain("No project or integration activity was recorded in this time window.");
    expect(report).not.toContain("**By integration**");
    expect(report).not.toContain("**Project management**");
  });

  it("returns stable output for identical recorded data", () => {
    const args = { ...baseArgs, events: [event()] };
    expect(buildDeterministicProjectReport(args)).toBe(buildDeterministicProjectReport(args));
  });
});
