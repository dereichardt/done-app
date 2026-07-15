import { describe, expect, it } from "vitest";

import {
  capacityGapWeekStarts,
  synthesizeCapacityGaps,
  TARGET_WEEKLY_CAPACITY_HOURS,
} from "@/lib/home-capacity-gaps";

describe("capacityGapWeekStarts", () => {
  it("returns five Sundays from +4 through +8", () => {
    expect(capacityGapWeekStarts("2026-07-12")).toEqual([
      "2026-08-09",
      "2026-08-16",
      "2026-08-23",
      "2026-08-30",
      "2026-09-06",
    ]);
  });
});

describe("synthesizeCapacityGaps", () => {
  it("reports no forecast data", () => {
    const weeks = capacityGapWeekStarts("2026-07-12");
    const result = synthesizeCapacityGaps({ weekHours: {}, weekStarts: weeks });
    expect(result.freeStartingWeek).toBeNull();
    expect(result.body).toMatch(/No forecast hours/);
  });

  it("synthesizes free capacity when under target", () => {
    const weeks = capacityGapWeekStarts("2026-07-12");
    const weekHours: Record<string, number> = {};
    for (const w of weeks) weekHours[w] = TARGET_WEEKLY_CAPACITY_HOURS - 4;
    const result = synthesizeCapacityGaps({ weekHours, weekStarts: weeks });
    expect(result.freeHoursPerWeek).toBe(4);
    expect(result.freeStartingWeek).toBe(weeks[0]);
    expect(result.body).toMatch(/4h\/week/);
  });

  it("reports tight capacity when full", () => {
    const weeks = capacityGapWeekStarts("2026-07-12");
    const weekHours: Record<string, number> = {};
    for (const w of weeks) weekHours[w] = TARGET_WEEKLY_CAPACITY_HOURS;
    const result = synthesizeCapacityGaps({ weekHours, weekStarts: weeks });
    expect(result.freeStartingWeek).toBeNull();
    expect(result.body).toMatch(/tight/);
  });
});
