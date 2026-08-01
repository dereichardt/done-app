import { describe, expect, it } from "vitest";

import { buildInsight, type UtilizationWeekRow } from "@/lib/utilization-data";

function week(
  weekStartYmd: string,
  partial: Partial<UtilizationWeekRow> & Pick<UtilizationWeekRow, "relative">,
): UtilizationWeekRow {
  return {
    weekStartYmd,
    paceHours: 0,
    actualHours: 0,
    forecastHours: 0,
    ...partial,
  };
}

describe("buildInsight", () => {
  it("flags shortfall when forecast cannot cover the target even if pace looks fine", () => {
    // Start of quarter weekend: no pace yet, 0 actuals, forecast below target.
    const weeks: UtilizationWeekRow[] = [
      week("2026-07-26", { relative: "current", paceHours: 0, actualHours: 0, forecastHours: 0 }),
      week("2026-08-02", { relative: "future", paceHours: 32, forecastHours: 34 }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 32 }),
      week("2026-08-16", { relative: "future", paceHours: 32, forecastHours: 240 }),
    ];
    // forecast total = 306, target 388
    const insight = buildInsight({
      targetHours: 388,
      weeks,
      todayYmd: "2026-08-01",
    });
    expect(insight.status).toBe("shortfall");
    expect(insight.message).toMatch(/82h short/i);
    // 3 remaining work weeks (Aug 2, 9, 16) → 82/3 ≈ 27.25h/week
    expect(insight.detail).toMatch(/27\.25h\/week/i);
    expect(insight.detail).toMatch(/remaining 3 work weeks/i);
  });

  it("says on track when forecast covers target and actuals match pace", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 32,
        forecastHours: 32,
      }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 100 }),
      week("2026-08-16", { relative: "future", paceHours: 32, forecastHours: 100 }),
    ];
    const insight = buildInsight({
      targetHours: 232,
      weeks,
      todayYmd: "2026-08-05",
    });
    expect(insight.status).toBe("on_track");
  });
});
