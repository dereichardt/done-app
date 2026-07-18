import { describe, expect, it } from "vitest";
import {
  forecastActualsCutoffIso,
  isActualBeforeForecastCutoff,
} from "@/lib/forecast-data";

describe("forecast actuals week cutoff", () => {
  it("uses Sunday midnight in the user's timezone", () => {
    expect(
      forecastActualsCutoffIso({
        todayIso: "2025-01-08",
        timeZone: "America/New_York",
      }),
    ).toBe("2025-01-05T05:00:00.000Z");

    expect(
      forecastActualsCutoffIso({
        todayIso: "2025-07-09",
        timeZone: "America/New_York",
      }),
    ).toBe("2025-07-06T04:00:00.000Z");
  });

  it("includes only actuals completed before the current Sunday", () => {
    const cutoffIso = forecastActualsCutoffIso({
      todayIso: "2025-01-08",
      timeZone: "America/New_York",
    });

    expect(isActualBeforeForecastCutoff("2025-01-05T04:59:59.999Z", cutoffIso)).toBe(true);
    expect(isActualBeforeForecastCutoff("2025-01-05T05:00:00.000Z", cutoffIso)).toBe(false);
    expect(isActualBeforeForecastCutoff("2025-01-08T15:00:00.000Z", cutoffIso)).toBe(false);
  });
});
