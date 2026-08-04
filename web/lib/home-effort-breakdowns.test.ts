import { describe, expect, it } from "vitest";

import {
  aggregateBreakdowns,
  breakdownLoadWindow,
  breakdownPeriodBounds,
  emptyBreakdowns,
  isMeetingSession,
  makePairHours,
  type BreakdownSession,
} from "@/lib/home-effort-breakdowns";

function session(
  partial: Partial<BreakdownSession> &
    Pick<BreakdownSession, "started_at" | "finished_at" | "duration_hours" | "billable">,
): BreakdownSession {
  return {
    source: partial.source ?? "task_work_session",
    source_id: partial.source_id ?? "s1",
    started_at: partial.started_at,
    finished_at: partial.finished_at,
    duration_hours: partial.duration_hours,
    integration_task_id: null,
    entry_type: partial.entry_type,
    title: "",
    work_accomplished: null,
    billable: partial.billable,
    destId: partial.destId ?? (partial.billable ? "proj-1" : "admin-1"),
    destLabel: partial.destLabel ?? (partial.billable ? "Acme" : "Admin"),
    isIcp: partial.isIcp === true,
  };
}

describe("isMeetingSession", () => {
  it("treats manual meeting entries as meetings", () => {
    expect(isMeetingSession({ source: "manual", entry_type: "meeting" })).toBe(true);
  });

  it("treats work sessions and manual tasks as tasks", () => {
    expect(isMeetingSession({ source: "task_work_session" })).toBe(false);
    expect(isMeetingSession({ source: "manual", entry_type: "task" })).toBe(false);
    expect(isMeetingSession({ source: "manual" })).toBe(false);
  });
});

describe("breakdownPeriodBounds", () => {
  it("uses Sunday week and fiscal quarter starting in February by default", () => {
    // Wednesday Aug 5, 2026 → Sunday Aug 2 week; FY27 Q3 (Aug–Oct) with Feb start
    const bounds = breakdownPeriodBounds("2026-08-05", { startMonth: 1 });
    expect(bounds.day.start.getFullYear()).toBe(2026);
    expect(bounds.day.start.getMonth()).toBe(7);
    expect(bounds.day.start.getDate()).toBe(5);

    expect(bounds.week.start.getDay()).toBe(0);
    expect(bounds.week.start.getDate()).toBe(2);

    expect(bounds.month.start.getDate()).toBe(1);
    expect(bounds.month.start.getMonth()).toBe(7);

    expect(bounds.quarter.start.getMonth()).toBe(7); // August = Q3 when FY starts Feb
    expect(bounds.quarter.start.getDate()).toBe(1);
  });
});

describe("breakdownLoadWindow", () => {
  it("spans the earliest start to the latest end", () => {
    const bounds = breakdownPeriodBounds("2026-08-05", { startMonth: 1 });
    const window = breakdownLoadWindow(bounds);
    expect(window.start.getTime()).toBe(bounds.quarter.start.getTime());
    expect(window.endExclusive.getTime()).toBe(
      Math.max(
        bounds.day.endExclusive.getTime(),
        bounds.week.endExclusive.getTime(),
        bounds.month.endExclusive.getTime(),
        bounds.quarter.endExclusive.getTime(),
      ),
    );
  });
});

describe("aggregateBreakdowns", () => {
  it("returns empty pairs when there are no sessions", () => {
    const bounds = breakdownPeriodBounds("2026-08-05", { startMonth: 1 });
    expect(aggregateBreakdowns([], bounds)).toEqual(emptyBreakdowns());
  });

  it("splits task vs meeting and billable vs internal by period", () => {
    const bounds = breakdownPeriodBounds("2026-08-05", { startMonth: 1 });
    const sessions: BreakdownSession[] = [
      // Task + billable (project) — 2h on Aug 5
      session({
        source: "task_work_session",
        started_at: "2026-08-05T14:00:00.000Z",
        finished_at: "2026-08-05T16:00:00.000Z",
        duration_hours: 2,
        billable: true,
        destId: "proj-1",
        destLabel: "Acme",
      }),
      // Meeting + billable — 1h on Aug 5
      session({
        source: "manual",
        entry_type: "meeting",
        started_at: "2026-08-05T16:00:00.000Z",
        finished_at: "2026-08-05T17:00:00.000Z",
        duration_hours: 1,
        billable: true,
        destId: "proj-1",
        destLabel: "Acme",
      }),
      // Task + non-billable (admin) — 3h on Aug 4 (same week, prior day)
      session({
        source: "task_work_session",
        started_at: "2026-08-04T10:00:00.000Z",
        finished_at: "2026-08-04T13:00:00.000Z",
        duration_hours: 3,
        billable: false,
        destId: "admin-1",
        destLabel: "Admin",
      }),
      // Meeting + non-billable — 1h in July (outside Q3)
      session({
        source: "manual",
        entry_type: "meeting",
        started_at: "2026-07-15T10:00:00.000Z",
        finished_at: "2026-07-15T11:00:00.000Z",
        duration_hours: 1,
        billable: false,
        destId: "dev-1",
        destLabel: "Development",
      }),
    ];

    const result = aggregateBreakdowns(sessions, bounds);

    expect(result.taskVsMeeting.day).toEqual(makePairHours(2, 1));
    expect(result.billableVsInternal.day).toEqual(makePairHours(3, 0));
    expect(result.billableItems.day).toEqual([
      { id: "proj-1", label: "Acme", hours: 3, billable: true, isIcp: false },
    ]);

    // Week Sun Aug 2–Sat Aug 8: day sessions + Aug 4 admin; July excluded
    expect(result.taskVsMeeting.week).toEqual(makePairHours(5, 1));
    expect(result.billableVsInternal.week).toEqual(makePairHours(3, 3));
    expect(result.billableItems.week).toEqual([
      { id: "proj-1", label: "Acme", hours: 3, billable: true, isIcp: false },
      { id: "admin-1", label: "Admin", hours: 3, billable: false, isIcp: false },
    ]);

    // Month August: same as week for these fixtures
    expect(result.taskVsMeeting.month).toEqual(makePairHours(5, 1));
    expect(result.billableVsInternal.month).toEqual(makePairHours(3, 3));

    // Quarter Aug–Oct: same as month (July is outside)
    expect(result.taskVsMeeting.quarter).toEqual(makePairHours(5, 1));
    expect(result.billableVsInternal.quarter).toEqual(makePairHours(3, 3));
  });

  it("counts ICP initiative hours as billable", () => {
    const bounds = breakdownPeriodBounds("2026-08-05", { startMonth: 1 });
    const sessions: BreakdownSession[] = [
      session({
        source: "manual",
        entry_type: "task",
        started_at: "2026-08-05T09:00:00.000Z",
        finished_at: "2026-08-05T10:00:00.000Z",
        duration_hours: 1,
        billable: true,
        destId: "ini-icp",
        destLabel: "ICP Work",
        isIcp: true,
      }),
      session({
        source: "manual",
        entry_type: "task",
        started_at: "2026-08-05T11:00:00.000Z",
        finished_at: "2026-08-05T12:30:00.000Z",
        duration_hours: 1.5,
        billable: false,
        destId: "ini-internal",
        destLabel: "Internal Initiative",
      }),
    ];

    const result = aggregateBreakdowns(sessions, bounds);
    expect(result.taskVsMeeting.day).toEqual(makePairHours(2.5, 0));
    expect(result.billableVsInternal.day).toEqual(makePairHours(1, 1.5));
    expect(result.billableItems.day).toEqual([
      {
        id: "ini-internal",
        label: "Internal Initiative",
        hours: 1.5,
        billable: false,
        isIcp: false,
      },
      { id: "ini-icp", label: "ICP Work", hours: 1, billable: true, isIcp: true },
    ]);
  });
});
