import { describe, expect, it } from "vitest";

import {
  capacityPocketBody,
  capacityPocketHeadline,
  capacityWindowWeekStarts,
  findCapacityPockets,
  synthesizeCapacityGaps,
  TARGET_WEEKLY_CAPACITY_HOURS,
} from "@/lib/home-capacity-gaps";

describe("capacityWindowWeekStarts", () => {
  it("returns quarter weeks from next Sunday onward", () => {
    const currentSunday = "2026-07-12";
    const quarterWeeks = [
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
    ];
    expect(capacityWindowWeekStarts(currentSunday, quarterWeeks)).toEqual([
      "2026-07-19",
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
    ]);
  });
});

describe("findCapacityPockets", () => {
  it("requires at least two consecutive under-target weeks", () => {
    const weeks = [
      { weekStart: "2026-07-19", portfolioHours: 20, freeHours: 12, targetHours: 32 },
      { weekStart: "2026-07-26", portfolioHours: 32, freeHours: 0, targetHours: 32 },
      { weekStart: "2026-08-02", portfolioHours: 20, freeHours: 12, targetHours: 32 },
      { weekStart: "2026-08-09", portfolioHours: 20, freeHours: 12, targetHours: 32 },
    ];
    const pockets = findCapacityPockets(weeks, "2026-07-12");
    expect(pockets).toHaveLength(1);
    expect(pockets[0]!.startWeek).toBe("2026-08-02");
    expect(pockets[0]!.weeks).toHaveLength(2);
    expect(pockets[0]!.weeksOut).toBe(3);
  });

  it("returns multiple pockets earliest first", () => {
    const weeks = [
      { weekStart: "2026-07-19", portfolioHours: 24, freeHours: 8, targetHours: 32 },
      { weekStart: "2026-07-26", portfolioHours: 24, freeHours: 8, targetHours: 32 },
      { weekStart: "2026-08-02", portfolioHours: 32, freeHours: 0, targetHours: 32 },
      { weekStart: "2026-08-09", portfolioHours: 28, freeHours: 4, targetHours: 32 },
      { weekStart: "2026-08-16", portfolioHours: 28, freeHours: 4, targetHours: 32 },
      { weekStart: "2026-08-23", portfolioHours: 28, freeHours: 4, targetHours: 32 },
    ];
    const pockets = findCapacityPockets(weeks, "2026-07-12");
    expect(pockets).toHaveLength(2);
    expect(pockets[0]!.startWeek).toBe("2026-07-19");
    expect(pockets[0]!.weeksOut).toBe(1);
    expect(pockets[1]!.startWeek).toBe("2026-08-09");
    expect(pockets[1]!.weeks).toHaveLength(3);
  });
});

describe("synthesizeCapacityGaps", () => {
  const currentSunday = "2026-07-12";
  const weekStarts = ["2026-07-19", "2026-07-26", "2026-08-02", "2026-08-09"];

  it("reports no forecast data", () => {
    const result = synthesizeCapacityGaps({
      weekHours: {},
      weekStarts,
      currentSundayYmd: currentSunday,
      quarterLabel: "FY27 Q2",
    });
    expect(result.freeStartingWeek).toBeNull();
    expect(result.pockets).toHaveLength(0);
    expect(result.body).toMatch(/No forecast hours/);
  });

  it("synthesizes free capacity when under target for 2+ weeks", () => {
    const weekHours: Record<string, number> = {};
    for (const w of weekStarts) weekHours[w] = TARGET_WEEKLY_CAPACITY_HOURS - 4;
    const result = synthesizeCapacityGaps({
      weekHours,
      weekStarts,
      currentSundayYmd: currentSunday,
      quarterLabel: "FY27 Q2",
    });
    expect(result.freeHoursPerWeek).toBe(4);
    expect(result.freeStartingWeek).toBe(weekStarts[0]);
    expect(result.pockets).toHaveLength(1);
    expect(result.body).toMatch(/Pick up billable work soon/);
  });

  it("reports no sustained capacity when only single soft weeks", () => {
    const weekHours: Record<string, number> = {
      "2026-07-19": 20,
      "2026-07-26": 32,
      "2026-08-02": 20,
      "2026-08-09": 32,
    };
    const result = synthesizeCapacityGaps({
      weekHours,
      weekStarts,
      currentSundayYmd: currentSunday,
      quarterLabel: "FY27 Q2",
    });
    expect(result.freeStartingWeek).toBeNull();
    expect(result.pockets).toHaveLength(0);
    expect(result.body).toMatch(/No sustained open capacity/);
  });

  it("reports tight capacity when full", () => {
    const weekHours: Record<string, number> = {};
    for (const w of weekStarts) weekHours[w] = TARGET_WEEKLY_CAPACITY_HOURS;
    const result = synthesizeCapacityGaps({
      weekHours,
      weekStarts,
      currentSundayYmd: currentSunday,
      quarterLabel: "FY27 Q2",
    });
    expect(result.freeStartingWeek).toBeNull();
    expect(result.body).toMatch(/No sustained open capacity/);
  });

  it("uses varying pace weekTargets for free hours", () => {
    const weekHours: Record<string, number> = {
      "2026-07-19": 24,
      "2026-07-26": 24,
      "2026-08-02": 24,
      "2026-08-09": 10,
    };
    const weekTargets: Record<string, number> = {
      "2026-07-19": 32,
      "2026-07-26": 32,
      "2026-08-02": 31,
      "2026-08-09": 16,
    };
    const result = synthesizeCapacityGaps({
      weekHours,
      weekStarts,
      currentSundayYmd: currentSunday,
      quarterLabel: "FY27 Q2",
      weekTargets,
    });
    expect(result.weeks.map((w) => w.targetHours)).toEqual([32, 32, 31, 16]);
    expect(result.weeks.map((w) => w.freeHours)).toEqual([8, 8, 7, 6]);
    expect(result.pockets).toHaveLength(1);
    expect(result.freeStartingWeek).toBe("2026-07-19");
    expect(result.freeHoursPerWeek).toBe(7);
  });
});

describe("capacity pocket copy", () => {
  it("uses near-term urgency for next week", () => {
    const pocket = {
      weeks: [
        { weekStart: "2026-07-19", portfolioHours: 24, freeHours: 8, targetHours: 32 },
        { weekStart: "2026-07-26", portfolioHours: 24, freeHours: 8, targetHours: 32 },
      ],
      startWeek: "2026-07-19",
      endWeek: "2026-07-26",
      freeHoursPerWeek: 8,
      weeksOut: 1,
    };
    expect(capacityPocketHeadline(pocket)).toBe("Open capacity next week");
    expect(capacityPocketBody(pocket)).toMatch(/Pick up billable work soon/);
  });
});
