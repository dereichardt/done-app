import { describe, expect, it } from "vitest";

import {
  blendedQuarterProjection,
  buildInsight,
  quarterPulseMetrics,
  type UtilizationWeekRow,
} from "@/lib/utilization-data";

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

describe("blendedQuarterProjection", () => {
  it("on Monday morning keeps the full current-week forecast (today not burned)", () => {
    // Week of Sun Aug 2: Mon Aug 3 is today → all 5 working days remaining.
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 0,
        forecastHours: 40,
      }),
      week("2026-08-09", { relative: "future", forecastHours: 100 }),
    ];
    const blend = blendedQuarterProjection({
      weeks,
      todayYmd: "2026-08-03",
    });
    expect(blend.remainingCurrentForecastHours).toBe(40);
    expect(blend.allActualHours).toBe(0);
    expect(blend.futureForecastHours).toBe(100);
    expect(blend.projectedHours).toBe(140);
    // No fully past working days yet → pace to date is 0.
    expect(blend.paceToDateHours).toBe(0);
  });

  it("on Wednesday burns Mon–Tue only (3/5 of week forecast remaining)", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 40,
        actualHours: 16,
        forecastHours: 40,
      }),
      week("2026-08-09", { relative: "future", forecastHours: 50 }),
    ];
    const blend = blendedQuarterProjection({
      weeks,
      todayYmd: "2026-08-05", // Wednesday
    });
    // remaining Wed–Fri = 3/5 * 40 = 24
    expect(blend.remainingCurrentForecastHours).toBe(24);
    expect(blend.allActualHours).toBe(16);
    expect(blend.futureForecastHours).toBe(50);
    expect(blend.projectedHours).toBe(90);
    expect(blend.planForecastHours).toBe(74);
    // past Mon–Tue = 2/5 * 40 = 16
    expect(blend.paceToDateHours).toBe(16);
  });

  it("factors time off into the divisor and skips off days from burn", () => {
    // Tue Aug 4 off: workingDays = 4; on Wed only Mon is past working → remaining 3.
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 40,
        actualHours: 8,
        forecastHours: 40,
      }),
    ];
    const blend = blendedQuarterProjection({
      weeks,
      todayYmd: "2026-08-05",
      timeOffYmds: new Set(["2026-08-04"]),
    });
    // 3/4 * 40 = 30
    expect(blend.remainingCurrentForecastHours).toBe(30);
    expect(blend.allActualHours).toBe(8);
    expect(blend.projectedHours).toBe(38);
    // past Mon only = 1/4 * 40 = 10
    expect(blend.paceToDateHours).toBe(10);
  });

  it("includes past-week actuals and excludes past-week forecast", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-07-26", {
        relative: "past",
        paceHours: 32,
        actualHours: 30,
        forecastHours: 32,
      }),
      week("2026-08-02", {
        relative: "current",
        paceHours: 40,
        actualHours: 10,
        forecastHours: 40,
      }),
      week("2026-08-09", { relative: "future", forecastHours: 20 }),
    ];
    const blend = blendedQuarterProjection({
      weeks,
      todayYmd: "2026-08-05",
    });
    expect(blend.allActualHours).toBe(40);
    expect(blend.remainingCurrentForecastHours).toBe(24);
    expect(blend.futureForecastHours).toBe(20);
    expect(blend.projectedHours).toBe(84);
    // past week 32 + 2/5 * 40 = 32 + 16 = 48
    expect(blend.paceToDateHours).toBe(48);
  });
});

describe("buildInsight", () => {
  it("flags shortfall when blended forecast cannot cover the target even if pace looks fine", () => {
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

  it("says on track when forecast covers target and actuals match day-prorated pace", () => {
    // Wed: pace to date = 2/5 * 32 = 12.75; actuals match within ±1h.
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 12.75,
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

  it("says at risk when blended projected covers target but actuals are behind day-prorated pace", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 4,
        forecastHours: 32,
      }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 220 }),
      week("2026-08-16", { relative: "future", paceHours: 32, forecastHours: 220 }),
    ];
    // pace to date Wed = 12.75; aheadBy = 4 - 12.75 = -8.75 → at_risk
    // projected = 4 + 19.25 + 440 = 463.25 covers 428
    const insight = buildInsight({
      targetHours: 428,
      weeks,
      todayYmd: "2026-08-05",
    });
    expect(insight.status).toBe("at_risk");
    expect(insight.message).toMatch(/behind pace/i);
  });

  it("says ahead when actuals exceed day-prorated pace and projected covers target", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 32,
        forecastHours: 40,
      }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 200 }),
      week("2026-08-16", { relative: "future", paceHours: 32, forecastHours: 200 }),
    ];
    // pace to date = 12.75; aheadBy ≈ 19 → ahead
    const insight = buildInsight({
      targetHours: 428,
      weeks,
      todayYmd: "2026-08-05",
    });
    expect(insight.status).toBe("ahead");
  });

  it("still flags shortfall when blended projected is below target", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 8,
        forecastHours: 40,
      }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 50 }),
    ];
    // projected = 8 + 24 + 50 = 82; target 200 → shortfall
    const insight = buildInsight({
      targetHours: 200,
      weeks,
      todayYmd: "2026-08-05",
    });
    expect(insight.status).toBe("shortfall");
    expect(insight.message).toMatch(/118h short/i);
  });

  it("does not count current-week pace until a working day is fully past", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 0,
        forecastHours: 200,
      }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 200 }),
    ];
    const insight = buildInsight({
      targetHours: 400,
      weeks,
      todayYmd: "2026-08-03", // Monday
    });
    // pace to date = 0, actual = 0 → on_track (coverage ok)
    expect(insight.status).toBe("on_track");
  });
});

describe("quarterPulseMetrics", () => {
  it("matches blended projection for projected attainment and pace delta", () => {
    const weeks: UtilizationWeekRow[] = [
      week("2026-07-26", {
        relative: "past",
        paceHours: 32,
        actualHours: 40,
        forecastHours: 32,
      }),
      week("2026-08-02", {
        relative: "current",
        paceHours: 32,
        actualHours: 8,
        forecastHours: 40,
      }),
      week("2026-08-09", { relative: "future", paceHours: 32, forecastHours: 100 }),
    ];
    const metrics = quarterPulseMetrics({
      weeks,
      todayYmd: "2026-08-05",
      targetHours: 200,
      endExclusiveYmd: "2026-11-01",
    });
    // remaining current forecast: Wed burned Mon–Tue → 3/5 of 40 = 24
    expect(metrics.allActualHours).toBe(48);
    expect(metrics.planForecastHours).toBe(124);
    expect(metrics.projectedHours).toBe(172);
    expect(metrics.projectedAttainmentPct).toBe(86);
    expect(metrics.hoursLeftToTarget).toBe(152);
    expect(metrics.coverageShortfall).toBe(28);
    // pace to date = 32 + round(32 × 2/5) = 32 + 12.75
    expect(metrics.aheadBy).toBe(3.25);
    expect(metrics.workingDaysLeft).toBeGreaterThan(0);
  });
});
