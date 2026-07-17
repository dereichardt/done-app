import { describe, expect, it } from "vitest";

import {
  isRealisticWeekForecast,
  weekPaceStatus,
  workdaysElapsedInWeek,
} from "@/lib/home-actuals-vs-forecast";

describe("workdaysElapsedInWeek", () => {
  it("counts Sun→0, Mon→1 … Fri/Sat→5", () => {
    expect(workdaysElapsedInWeek("2026-07-12")).toBe(0); // Sun
    expect(workdaysElapsedInWeek("2026-07-13")).toBe(1); // Mon
    expect(workdaysElapsedInWeek("2026-07-15")).toBe(3); // Wed
    expect(workdaysElapsedInWeek("2026-07-17")).toBe(5); // Fri
    expect(workdaysElapsedInWeek("2026-07-18")).toBe(5); // Sat
  });
});

describe("isRealisticWeekForecast", () => {
  it("requires a positive forecast within a 40h work week", () => {
    expect(isRealisticWeekForecast(0)).toBe(false);
    expect(isRealisticWeekForecast(32)).toBe(true);
    expect(isRealisticWeekForecast(40)).toBe(true);
    expect(isRealisticWeekForecast(40.1)).toBe(false);
  });
});

describe("weekPaceStatus", () => {
  it("returns null when forecast is not realistic", () => {
    expect(weekPaceStatus({ forecast: 0, actual: 0 }, "2026-07-15")).toBeNull();
    expect(weekPaceStatus({ forecast: 48, actual: 10 }, "2026-07-15")).toBeNull();
  });

  it("marks behind / on track / ahead vs mid-week expected pace", () => {
    // Wed = 3/5 of 40h forecast → expected 24h; tolerance max(4, 4) = 4
    expect(weekPaceStatus({ forecast: 40, actual: 10 }, "2026-07-15")).toBe("behind");
    expect(weekPaceStatus({ forecast: 40, actual: 24 }, "2026-07-15")).toBe("on_track");
    expect(weekPaceStatus({ forecast: 40, actual: 32 }, "2026-07-15")).toBe("ahead");
  });

  it("treats Sunday as not started", () => {
    expect(weekPaceStatus({ forecast: 40, actual: 0 }, "2026-07-12")).toBe("on_track");
    expect(weekPaceStatus({ forecast: 40, actual: 8 }, "2026-07-12")).toBe("ahead");
  });
});
