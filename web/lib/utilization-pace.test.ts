import { describe, expect, it } from "vitest";

import { resolveFiscalQuarter, sundayWeeksOverlappingRange } from "@/lib/fiscal-quarter";
import {
  paceHoursByWeek,
  portfolioWeekTargetHours,
} from "@/lib/utilization-pace";

const febStart = { startMonth: 1 };

describe("paceHoursByWeek", () => {
  it("omits weeks when no quarter has a target", () => {
    const weeks = ["2026-08-02", "2026-08-09", "2026-08-16"];
    const pace = paceHoursByWeek({
      weekStarts: weeks,
      quarterConfig: febStart,
      quarterTargets: {},
    });
    expect(pace).toEqual({});
    expect(portfolioWeekTargetHours("2026-08-02", pace)).toBe(32);
  });

  it("ignores non-positive quarter targets", () => {
    const pace = paceHoursByWeek({
      weekStarts: ["2026-08-02"],
      quarterConfig: febStart,
      quarterTargets: { "2026-08-01": 0 },
    });
    expect(Object.hasOwn(pace, "2026-08-02")).toBe(false);
  });

  it("front-loads ~32h then keeps exhausted weeks as 0 (not omitted)", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 7, 1), febStart);
    expect(identity.quarterStartYmd).toBe("2026-08-01");
    const quarterWeeks = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
    // First week is Jul 26 (weekend-only stub); then Aug 2 and Aug 9 fill 64h.
    const pace = paceHoursByWeek({
      weekStarts: quarterWeeks,
      quarterConfig: febStart,
      weeklyCapacityHours: 32,
      quarterTargets: { "2026-08-01": 64 },
    });

    expect(pace["2026-07-26"]).toBe(0);
    expect(pace["2026-08-02"]).toBe(32);
    expect(pace["2026-08-09"]).toBe(32);
    expect(pace["2026-08-16"]).toBe(0);
    expect(Object.hasOwn(pace, "2026-08-16")).toBe(true);
    expect(portfolioWeekTargetHours("2026-08-16", pace)).toBe(0);
  });

  it("reduces pace for a PTO weekday in a full work week", () => {
    const args = {
      weekStarts: ["2026-08-02"],
      quarterConfig: febStart,
      weeklyCapacityHours: 32,
      quarterTargets: { "2026-08-01": 416 },
    };
    const full = paceHoursByWeek({ ...args, timeOffYmds: new Set() });
    const withPto = paceHoursByWeek({
      ...args,
      timeOffYmds: new Set(["2026-08-03"]), // Monday
    });
    expect(full["2026-08-02"]).toBe(32);
    expect(withPto["2026-08-02"]).toBeLessThan(32);
    expect(withPto["2026-08-02"]).toBeGreaterThan(0);
  });

  it("picks the larger weekday overlap when a week straddles two targeted quarters", () => {
    // Jul 26 week: 5 weekdays in Q2 (May–Jul), Saturday-only stub in Q3 (Aug–Oct).
    const q3Only = paceHoursByWeek({
      weekStarts: ["2026-07-26"],
      quarterConfig: febStart,
      weeklyCapacityHours: 32,
      quarterTargets: { "2026-08-01": 416 },
    });
    const both = paceHoursByWeek({
      weekStarts: ["2026-07-26"],
      quarterConfig: febStart,
      weeklyCapacityHours: 32,
      quarterTargets: {
        "2026-05-01": 2000,
        "2026-08-01": 416,
      },
    });
    expect(q3Only["2026-07-26"]).toBe(0);
    expect(both["2026-07-26"]).toBeGreaterThan(0);
  });

  it("does not invent pace for a week in an untargeted quarter", () => {
    const pace = paceHoursByWeek({
      weekStarts: ["2026-08-02", "2026-11-01"],
      quarterConfig: febStart,
      weeklyCapacityHours: 32,
      quarterTargets: { "2026-08-01": 32 },
    });
    expect(pace["2026-08-02"]).toBe(32);
    expect(Object.hasOwn(pace, "2026-11-01")).toBe(false);
    expect(portfolioWeekTargetHours("2026-11-01", pace)).toBe(32);
  });
});

describe("portfolioWeekTargetHours", () => {
  it("preserves 0h pace and falls back when the week is absent", () => {
    const pace = { "2026-08-16": 0 };
    expect(portfolioWeekTargetHours("2026-08-16", pace)).toBe(0);
    expect(portfolioWeekTargetHours("2026-08-23", pace)).toBe(32);
  });
});
