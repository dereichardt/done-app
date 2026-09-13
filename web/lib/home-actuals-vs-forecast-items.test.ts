import { describe, expect, it } from "vitest";

import {
  forecastItemHasLookbackHours,
  makeWeekTotals,
  sumForecastItemsForWeek,
  type HomeActualsVsForecastProject,
} from "@/lib/home-actuals-vs-forecast";

describe("sumForecastItemsForWeek", () => {
  it("combines project and initiative forecast items", () => {
    const week = "2026-07-12";
    const items: HomeActualsVsForecastProject[] = [
      {
        id: "project-1",
        name: "Project",
        kind: "project",
        isIcp: false,
        byWeek: { [week]: makeWeekTotals(20, 18) },
      },
      {
        id: "initiative-1",
        name: "Initiative",
        kind: "initiative",
        isIcp: true,
        byWeek: { [week]: makeWeekTotals(8, 3.5) },
      },
    ];

    expect(sumForecastItemsForWeek(items, week)).toEqual({
      forecast: 28,
      actual: 21.5,
      variance: 6.5,
    });
  });

  it("includes completed items that still have lookback hours in week totals", () => {
    const week = "2026-07-12";
    const weeks = [week];
    const completedWithHours: HomeActualsVsForecastProject = {
      id: "completed-1",
      name: "Completed project",
      kind: "project",
      isIcp: false,
      byWeek: { [week]: makeWeekTotals(12, 10) },
    };
    const completedEmpty: HomeActualsVsForecastProject = {
      id: "completed-old",
      name: "Old completed",
      kind: "project",
      isIcp: false,
      byWeek: { [week]: makeWeekTotals(0, 0) },
    };
    const active: HomeActualsVsForecastProject = {
      id: "active-1",
      name: "Active",
      kind: "project",
      isIcp: false,
      byWeek: { [week]: makeWeekTotals(8, 7) },
    };

    expect(forecastItemHasLookbackHours(completedWithHours, weeks)).toBe(true);
    expect(forecastItemHasLookbackHours(completedEmpty, weeks)).toBe(false);

    const completedIds = new Set(["completed-1", "completed-old"]);
    const kept = [active, completedWithHours, completedEmpty].filter(
      (item) => !completedIds.has(item.id) || forecastItemHasLookbackHours(item, weeks),
    );
    expect(sumForecastItemsForWeek(kept, week)).toEqual({
      forecast: 20,
      actual: 17,
      variance: 3,
    });
  });
});
