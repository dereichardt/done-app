import { describe, expect, it } from "vitest";

import {
  effortQuarterIndex,
  fiscalYearForQuarterStart,
  formatFiscalQuarterLabel,
  paceHoursPerWeekWeighted,
  resolveFiscalQuarter,
  sundayWeeksOverlappingRange,
  weekOverlapInQuarter,
} from "@/lib/fiscal-quarter";

describe("fiscal quarter (February start)", () => {
  const config = { startMonth: 1 };

  it("labels Aug 2026 as FY27 Q3", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 7, 15), config);
    expect(identity.quarter).toBe(3);
    expect(identity.fiscalYear).toBe(2027);
    expect(identity.label).toBe("FY27 Q3");
    expect(identity.quarterStartYmd).toBe("2026-08-01");
    expect(identity.endExclusiveYmd).toBe("2026-11-01");
  });

  it("labels Feb 2026 as FY27 Q1", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 1, 1), config);
    expect(identity.quarter).toBe(1);
    expect(identity.fiscalYear).toBe(2027);
    expect(identity.label).toBe("FY27 Q1");
  });

  it("labels Dec 2026 as FY27 Q4 spanning into Jan 2027", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 11, 10), config);
    expect(identity.quarter).toBe(4);
    expect(identity.fiscalYear).toBe(2027);
    expect(identity.quarterStartYmd).toBe("2026-11-01");
    expect(identity.endExclusiveYmd).toBe("2027-02-01");
  });

  it("uses Jan-start FY naming for calendar years", () => {
    const janConfig = { startMonth: 0 };
    const identity = resolveFiscalQuarter(new Date(2026, 7, 15), janConfig);
    expect(effortQuarterIndex(new Date(2026, 7, 15), janConfig)).toBe(3);
    expect(fiscalYearForQuarterStart(identity.start, 0)).toBe(2026);
    expect(formatFiscalQuarterLabel(2026, 3)).toBe("FY26 Q3");
  });

  it("lists Sunday weeks overlapping FY27 Q3", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 7, 1), config);
    const weeks = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
    expect(weeks[0]).toBe("2026-07-26"); // week containing Aug 1
    expect(weeks[weeks.length - 1]).toBe("2026-10-25"); // week containing Oct 31
    expect(weeks.length).toBeGreaterThanOrEqual(13);
    expect(weeks.length).toBeLessThanOrEqual(15);
  });

  it("clips Jul 26 week to only Aug 1 calendar day and zero weekdays", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 7, 1), config);
    const overlap = weekOverlapInQuarter(
      "2026-07-26",
      identity.start,
      identity.endExclusive,
    );
    expect(overlap.calendarDays).toBe(1);
    expect(overlap.weekdays).toBe(0);
    expect(overlap.days).toBe(0); // pace weight ignores weekend-only stub
    expect(overlap.fraction).toBe(0);
  });

  it("counts Mon–Fri in Oct 25 week (not the weekend edges)", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 7, 1), config);
    const overlap = weekOverlapInQuarter(
      "2026-10-25",
      identity.start,
      identity.endExclusive,
    );
    // Sun Oct 25 … Sat Oct 31 — weekdays Oct 26–30
    expect(overlap.calendarDays).toBe(7);
    expect(overlap.weekdays).toBe(5);
    expect(overlap.fraction).toBe(1);
  });

  it("weights pace by weekdays so weekend-only weeks get zero pace", () => {
    const identity = resolveFiscalQuarter(new Date(2026, 7, 1), config);
    const weeks = sundayWeeksOverlappingRange(identity.start, identity.endExclusive);
    const weights = weeks.map(
      (w) => weekOverlapInQuarter(w, identity.start, identity.endExclusive).days,
    );
    expect(weights[0]).toBe(0); // Jul 26 week: Aug 1 Sat only
    const pace = paceHoursPerWeekWeighted(416, weights);
    expect(pace.reduce((a, b) => a + b, 0)).toBe(416);
    expect(pace[0]).toBe(0);
    expect(pace[1]!).toBeGreaterThan(0);
  });

  it("front-loads ~32h weeks and steps down at the end instead of bumping the last week", () => {
    // 13 full work weeks, target 415 → twelve 32h weeks then 31h
    const weights = Array.from({ length: 13 }, () => 5);
    const pace = paceHoursPerWeekWeighted(415, weights);
    expect(pace.reduce((a, b) => a + b, 0)).toBe(415);
    expect(pace.slice(0, 12).every((h) => h === 32)).toBe(true);
    expect(pace[12]).toBe(31);
  });

  it("keeps even 32h when target divides cleanly", () => {
    const weights = Array.from({ length: 13 }, () => 5);
    const pace = paceHoursPerWeekWeighted(416, weights);
    expect(pace.every((h) => h === 32)).toBe(true);
  });
});
