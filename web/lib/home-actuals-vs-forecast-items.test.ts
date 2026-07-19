import { describe, expect, it } from "vitest";

import {
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
});
