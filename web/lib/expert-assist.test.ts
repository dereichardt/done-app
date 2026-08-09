import { describe, expect, it } from "vitest";
import { generateExpertAssistForecastHours } from "@/lib/expert-assist-forecast";
import {
  parseExpertAssistDetails,
  parseProjectManagementEstimatedHours,
} from "@/lib/project-types";

describe("Project management estimated hours", () => {
  it("treats empty as null and rejects non-quarter-hour values", () => {
    expect(parseProjectManagementEstimatedHours("")).toEqual({ hours: null });
    expect(parseProjectManagementEstimatedHours("10.1").error).toMatch(/quarter-hour/);
    expect(parseProjectManagementEstimatedHours("-1").error).toMatch(/non-negative/);
    expect(parseProjectManagementEstimatedHours("40.5")).toEqual({ hours: 40.5 });
  });
});

describe("Expert Assist details", () => {
  it("requires ordered dates and positive quarter-hour effort", () => {
    expect(
      parseExpertAssistDetails({
        starts_on: "2026-08-02",
        ends_on: "2026-08-01",
        estimated_effort_hours: "10",
        integrations_enabled: false,
      }).error,
    ).toMatch(/on or before/);

    expect(
      parseExpertAssistDetails({
        starts_on: "2026-08-01",
        ends_on: "2026-08-31",
        estimated_effort_hours: "10.1",
        integrations_enabled: false,
      }).error,
    ).toMatch(/quarter-hour/);
  });

  it("preserves the integration capability", () => {
    const parsed = parseExpertAssistDetails({
      starts_on: "2026-08-01",
      ends_on: "2026-08-31",
      estimated_effort_hours: "40.5",
      integrations_enabled: true,
    });
    expect(parsed.details).toEqual({
      starts_on: "2026-08-01",
      ends_on: "2026-08-31",
      estimated_effort_hours: 40.5,
      integrations_enabled: true,
    });
  });
});

describe("Expert Assist forecasting", () => {
  it("generates one project row without integrations", () => {
    const generated = generateExpertAssistForecastHours({
      startsOn: "2026-07-19",
      endsOn: "2026-08-09",
      estimatedEffortHours: 20,
      actualHours: 4,
      todayIso: "2026-07-20",
    });

    expect(generated.error).toBeUndefined();
    expect(
      Object.values(generated.hoursByWeek).reduce(
        (sum, hours) => sum + hours,
        0,
      ),
    ).toBe(16);
  });

  it("preserves locked weekly hours while regenerating", () => {
    const generated = generateExpertAssistForecastHours({
      startsOn: "2026-07-19",
      endsOn: "2026-08-09",
      estimatedEffortHours: 20,
      actualHours: 0,
      todayIso: "2026-07-20",
      lockedWeekStarts: ["2026-07-19"],
      existingHoursByWeek: { "2026-07-19": 8 },
    });

    expect(generated.hoursByWeek["2026-07-19"]).toBe(8);
    expect(
      Object.values(generated.hoursByWeek).reduce(
        (sum, hours) => sum + hours,
        0,
      ),
    ).toBe(20);
  });

  it("supports starting next week with current locked hours consumed", () => {
    const generated = generateExpertAssistForecastHours({
      startsOn: "2026-07-19",
      endsOn: "2026-08-09",
      estimatedEffortHours: 20,
      actualHours: 0,
      todayIso: "2026-07-20",
      startMode: "next_week",
      lockedWeekStarts: ["2026-07-19"],
      existingHoursByWeek: { "2026-07-19": 8 },
    });

    expect(generated.startDate).toBe("2026-07-26");
    expect(generated.hoursByWeek["2026-07-19"]).toBeUndefined();
    expect(
      Object.values(generated.hoursByWeek).reduce(
        (sum, hours) => sum + hours,
        0,
      ),
    ).toBe(12);
  });

  it("counts current unlocked forecast and actuals before a next-week spread", () => {
    const generated = generateExpertAssistForecastHours({
      startsOn: "2026-07-19",
      endsOn: "2026-08-09",
      estimatedEffortHours: 20,
      actualHours: 3,
      todayIso: "2026-07-20",
      startMode: "next_week",
      lockedWeekStarts: [],
      existingHoursByWeek: { "2026-07-19": 5 },
    });

    expect(generated.startDate).toBe("2026-07-26");
    expect(
      Object.values(generated.hoursByWeek).reduce(
        (sum, hours) => sum + hours,
        0,
      ),
    ).toBe(12);
  });
});
