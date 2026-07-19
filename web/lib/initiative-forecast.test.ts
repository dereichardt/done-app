import { describe, expect, it } from "vitest";

import { generateInitiativeForecastHours } from "@/lib/initiative-forecast";

describe("generateInitiativeForecastHours", () => {
  it("spreads remaining hours evenly and conserves the total", () => {
    const result = generateInitiativeForecastHours({
      startsOn: "2026-07-12",
      endsOn: "2026-08-01",
      estimatedEffortHours: 10,
      actualHours: 0,
      todayIso: "2026-07-13",
    });

    expect(result.error).toBeUndefined();
    expect(result.hoursByWeek).toEqual({
      "2026-07-12": 4,
      "2026-07-19": 3,
      "2026-07-26": 3,
    });
    expect(Object.values(result.hoursByWeek).reduce((sum, hours) => sum + hours, 0)).toBe(10);
  });

  it("subtracts prior completed actuals using whole-hour consumption", () => {
    const result = generateInitiativeForecastHours({
      startsOn: "2026-07-12",
      endsOn: "2026-07-25",
      estimatedEffortHours: 10,
      actualHours: 2.25,
      todayIso: "2026-07-13",
    });

    expect(result.availableHours).toBe(7);
    expect(result.hoursByWeek).toEqual({ "2026-07-12": 4, "2026-07-19": 3 });
  });

  it("preserves locked hours and spreads only the remaining amount", () => {
    const result = generateInitiativeForecastHours({
      startsOn: "2026-07-12",
      endsOn: "2026-08-01",
      estimatedEffortHours: 12,
      actualHours: 0,
      todayIso: "2026-07-13",
      lockedWeekStarts: ["2026-07-12"],
      existingHoursByWeek: { "2026-07-12": 6 },
    });

    expect(result.hoursByWeek).toEqual({
      "2026-07-12": 6,
      "2026-07-19": 3,
      "2026-07-26": 3,
    });
  });

  it("starts next week and counts a locked current week as actual effort", () => {
    const result = generateInitiativeForecastHours({
      startsOn: "2026-07-12",
      endsOn: "2026-08-01",
      estimatedEffortHours: 12,
      actualHours: 0,
      todayIso: "2026-07-13",
      startMode: "next_week",
      lockedWeekStarts: ["2026-07-12"],
      existingHoursByWeek: { "2026-07-12": 6 },
    });

    expect(result.startDate).toBe("2026-07-19");
    expect(result.availableHours).toBe(6);
    expect(result.hoursByWeek).toEqual({
      "2026-07-19": 3,
      "2026-07-26": 3,
    });
  });

  it("starts next week and counts an unlocked current forecast as committed effort", () => {
    const result = generateInitiativeForecastHours({
      startsOn: "2026-07-12",
      endsOn: "2026-08-01",
      estimatedEffortHours: 12,
      actualHours: 2,
      todayIso: "2026-07-13",
      startMode: "next_week",
      lockedWeekStarts: [],
      existingHoursByWeek: { "2026-07-12": 4 },
    });

    expect(result.startDate).toBe("2026-07-19");
    expect(result.availableHours).toBe(6);
    expect(result.hoursByWeek).toEqual({
      "2026-07-19": 3,
      "2026-07-26": 3,
    });
  });

  it("returns an error when the initiative has no eligible week", () => {
    const result = generateInitiativeForecastHours({
      startsOn: "2026-06-01",
      endsOn: "2026-06-30",
      estimatedEffortHours: 8,
      actualHours: 0,
      todayIso: "2026-07-13",
    });

    expect(result.error).toMatch(/no current or future/i);
    expect(result.hoursByWeek).toEqual({});
  });
});
