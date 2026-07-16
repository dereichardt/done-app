import { describe, expect, it } from "vitest";
import {
  allocateSparseOrLargestRemainder,
  allocateTrackRemainingHours,
  applyForecastProjectTotalEdit,
  applyForecastRowEdit,
  buildForecastPhaseWeekSegments,
  computeEstimateVariance,
  forecastBankWeekStarts,
  forecastStartModeFromStartDate,
  generateForecastHours,
  phaseSpreadShapeFactor,
  PM_FORECAST_ROW_KEY,
  spreadRemainingAcrossWeeks,
  sumActualsConsumedHours,
  sumEstimatedRoundedHours,
} from "@/lib/project-forecast";
import { DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE } from "@/lib/user-preferences";

/** Sundays for N consecutive weeks starting at `startYmd`. */
function sundayWeeks(startYmd: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${startYmd}T12:00:00`);
  for (let i = 0; i < count; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i * 7);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function sumPlacedHours(
  rows: Array<{ hoursByWeekYmd: Record<string, number> }>,
): number {
  let total = 0;
  for (const row of rows) {
    for (const h of Object.values(row.hoursByWeekYmd)) {
      if (Number.isFinite(h) && h > 0) total += h;
    }
  }
  return total;
}

const FULL_TIMELINE_PHASES = [
  { phase_key: "plan", start_date: "2025-01-05", end_date: "2025-01-18" },
  {
    phase_key: "architect_configure",
    start_date: "2025-01-19",
    end_date: "2025-03-15",
  },
  { phase_key: "test", start_date: "2025-03-16", end_date: "2025-04-12" },
  { phase_key: "deploy", start_date: "2025-04-13", end_date: "2025-04-26" },
  { phase_key: "hypercare", start_date: "2025-04-27", end_date: "2025-05-17" },
];

describe("allocateSparseOrLargestRemainder", () => {
  it("spaces 3 hours across 10 equal weeks (not consecutive cluster)", () => {
    const parts = allocateSparseOrLargestRemainder(3, Array.from({ length: 10 }, () => 1));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(parts.filter((h) => h === 1)).toHaveLength(3);
    expect(parts.filter((h) => h === 0)).toHaveLength(7);
    const ones = parts
      .map((h, i) => (h === 1 ? i : -1))
      .filter((i) => i >= 0);
    expect(ones).toEqual([0, 5, 9]);
  });

  it("uses largest-remainder when total fills every positive week", () => {
    const parts = allocateSparseOrLargestRemainder(10, Array.from({ length: 10 }, () => 1));
    expect(parts).toEqual(Array.from({ length: 10 }, () => 1));
  });
});

describe("forecastBankWeekStarts + past-phase placement", () => {
  const weeks = sundayWeeks("2025-01-05", 20);
  const phases = [
    { phase_key: "plan", start_date: "2025-01-05", end_date: "2025-01-18" },
    { phase_key: "architect_configure", start_date: "2025-01-19", end_date: "2025-03-15" },
    { phase_key: "test", start_date: "2025-03-16", end_date: "2025-04-12" },
    { phase_key: "deploy", start_date: "2025-04-13", end_date: "2025-04-26" },
    { phase_key: "hypercare", start_date: "2025-04-27", end_date: "2025-05-17" },
  ];

  it("uses Hypercare-overlapping weeks as the bank pool", () => {
    const bank = forecastBankWeekStarts(weeks, phases);
    expect(bank.length).toBeGreaterThan(0);
    expect(bank.every((w) => w >= "2025-04-27")).toBe(true);
    expect(bank.at(-1)).toBe("2025-05-11");
  });

  it("spreads past-phase hours evenly across remaining weeks when includePastPhaseHours", () => {
    const writable = weeks.slice(4);
    const held = spreadRemainingAcrossWeeks({
      remaining: 100,
      writableWeeks: writable,
      phases,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      spreadMode: "even",
      includePastPhaseHours: false,
    });
    const included = spreadRemainingAcrossWeeks({
      remaining: 100,
      writableWeeks: writable,
      phases,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      spreadMode: "even",
      includePastPhaseHours: true,
    });
    expect(held.bankedHours).toBeGreaterThan(0);
    expect(included.unallocatedHours).toBe(0);
    expect(Object.values(included.hoursByWeekYmd).reduce((a, b) => a + b, 0)).toBe(100);

    // Delta vs hold-as-reserve is a peanut-butter of the past-phase hours (not a
    // single end-week lump). With whole hours, thin leftovers may be 1h / 0h.
    const deltas = writable.map(
      (w) => (included.hoursByWeekYmd[w] ?? 0) - (held.hoursByWeekYmd[w] ?? 0),
    );
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(held.bankedHours);
    expect(Math.max(...deltas)).toBeLessThan(held.bankedHours);
    expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThanOrEqual(1);
  });

  it("holds past-phase hours as unallocated by default", () => {
    const writable = weeks.slice(4);
    const result = spreadRemainingAcrossWeeks({
      remaining: 100,
      writableWeeks: writable,
      phases,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      spreadMode: "even",
      includePastPhaseHours: false,
    });
    expect(result.bankedHours).toBeGreaterThan(0);
    expect(result.unallocatedHours).toBe(result.bankedHours);
    const placed = Object.values(result.hoursByWeekYmd).reduce((a, b) => a + b, 0);
    expect(placed + result.unallocatedHours).toBe(100);
  });
});

describe("phaseSpreadShapeFactor (bell)", () => {
  it("peaks mid-late for Architect & Configure", () => {
    const early = phaseSpreadShapeFactor("architect_configure", 0.1, "bell");
    const midLate = phaseSpreadShapeFactor("architect_configure", 0.65, "bell");
    const late = phaseSpreadShapeFactor("architect_configure", 0.95, "bell");
    expect(midLate).toBeGreaterThan(early);
    expect(midLate).toBeGreaterThan(late);
  });

  it("peaks early for Test", () => {
    const early = phaseSpreadShapeFactor("test", 0.2, "bell");
    const late = phaseSpreadShapeFactor("test", 0.9, "bell");
    expect(early).toBeGreaterThan(late);
  });

  it("is flat in even mode", () => {
    expect(phaseSpreadShapeFactor("architect_configure", 0.1, "even")).toBe(1);
    expect(phaseSpreadShapeFactor("architect_configure", 0.9, "even")).toBe(1);
  });
});

describe("even spread peanut butter", () => {
  it("gives overlapping weeks nearly equal hours (not overlap-day skew)", () => {
    const weeks = sundayWeeks("2025-01-05", 8);
    const phases = [
      { phase_key: "test", start_date: "2025-01-05", end_date: "2025-02-23" },
    ];
    const result = spreadRemainingAcrossWeeks({
      remaining: 80,
      writableWeeks: weeks,
      phases,
      deploymentEffortByPhase: {
        ...DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
        plan: 0,
        architect_configure: 0,
        test: 100,
        deploy: 0,
        hypercare: 0,
      },
      spreadMode: "even",
      includePastPhaseHours: true,
    });
    const vals = weeks.map((w) => result.hoursByWeekYmd[w] ?? 0);
    const nonzero = vals.filter((h) => h > 0);
    expect(nonzero.reduce((a, b) => a + b, 0)).toBe(80);
    const min = Math.min(...nonzero);
    const max = Math.max(...nonzero);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it("keeps project totals flat when many thin tracks would otherwise stack sparse patterns", () => {
    const phases = [
      { phase_key: "test", start_date: "2025-01-05", end_date: "2025-02-23" },
    ];
    const integrations = Array.from({ length: 8 }, (_, i) => ({
      key: `int-${i}`,
      label: `Integration ${i}`,
      estimatedEffortHours: 40,
    }));
    const result = generateForecastHours({
      phases,
      integrations,
      deploymentEffortByPhase: {
        ...DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
        plan: 0,
        architect_configure: 0,
        test: 100,
        deploy: 0,
        hypercare: 0,
      },
      pmPercent: 0,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualsByRowKey: {},
    });
    expect(result.error).toBeUndefined();
    const weekStarts = result.weeks.map((w) => w.startYmd);
    const totals = weekStarts.map((w) =>
      result.rows.reduce((sum, row) => sum + (row.hoursByWeekYmd[w] ?? 0), 0),
    );
    const nonzero = totals.filter((h) => h > 0);
    expect(nonzero.length).toBeGreaterThan(1);
    const min = Math.min(...nonzero);
    const max = Math.max(...nonzero);
    expect(max - min).toBeLessThanOrEqual(1);
  });
});

describe("project-level remaining (Forecast + Actuals = Estimated)", () => {
  it("places all estimated hours when there are no actuals (full timeline start)", () => {
    const integrations = [
      { key: "int-a", label: "A", estimatedEffortHours: 100 },
      { key: "int-b", label: "B", estimatedEffortHours: 40.4 },
    ];
    const estimated = sumEstimatedRoundedHours(integrations);
    expect(estimated).toBe(140);

    const result = generateForecastHours({
      phases: FULL_TIMELINE_PHASES,
      integrations,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      pmPercent: 5,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualsByRowKey: {},
    });
    expect(result.error).toBeUndefined();
    expect(sumPlacedHours(result.rows)).toBe(estimated);
    expect(result.reserveHours).toBe(0);
  });

  it("holds past-phase hours in reserve when includePastPhaseHours is false", () => {
    const integrations = [{ key: "int-a", label: "A", estimatedEffortHours: 100 }];
    const result = generateForecastHours({
      phases: FULL_TIMELINE_PHASES,
      integrations,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      pmPercent: 0,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: false,
      todayIso: "2025-02-05",
      actualsByRowKey: {},
    });
    expect(result.error).toBeUndefined();
    expect(result.reserveHours).toBeGreaterThan(0);
    expect(sumPlacedHours(result.rows) + result.reserveHours).toBe(100);
  });

  it("places past-phase hours on grid when includePastPhaseHours is true", () => {
    const integrations = [{ key: "int-a", label: "A", estimatedEffortHours: 100 }];
    const result = generateForecastHours({
      phases: FULL_TIMELINE_PHASES,
      integrations,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      pmPercent: 0,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-02-05",
      actualsByRowKey: {},
    });
    expect(result.error).toBeUndefined();
    expect(result.reserveHours).toBe(0);
    expect(sumPlacedHours(result.rows)).toBe(100);
  });

  it("reduces PM leftover when integration actuals overrun their carve-out", () => {
    const integrations = [{ key: "int-a", label: "A", estimatedEffortHours: 100 }];
    const actualsByRowKey = { "int-a": 98 };
    const estimated = sumEstimatedRoundedHours(integrations);
    const actuals = sumActualsConsumedHours(integrations, actualsByRowKey);
    expect(estimated).toBe(100);
    expect(actuals).toBe(98);

    const allocated = allocateTrackRemainingHours({
      integrations,
      pmPercent: 5,
      actualsByRowKey,
    });
    expect(allocated.projectRemaining).toBe(2);
    expect(allocated.trackRemaining.reduce((a, b) => a + b, 0)).toBe(2);

    const result = generateForecastHours({
      phases: FULL_TIMELINE_PHASES,
      integrations,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      pmPercent: 5,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualsByRowKey,
    });
    expect(result.error).toBeUndefined();
    expect(sumPlacedHours(result.rows)).toBe(2);
    expect(sumPlacedHours(result.rows) + actuals).toBe(estimated);
  });

  it("ceils fractional actuals when computing project remaining", () => {
    const integrations = [{ key: "int-a", label: "A", estimatedEffortHours: 100 }];
    const actualsByRowKey = { "int-a": 10.1 };
    const estimated = sumEstimatedRoundedHours(integrations);
    const actuals = sumActualsConsumedHours(integrations, actualsByRowKey);
    expect(actuals).toBe(11);

    const allocated = allocateTrackRemainingHours({
      integrations,
      pmPercent: 0,
      actualsByRowKey,
    });
    expect(allocated.projectRemaining).toBe(89);

    const result = generateForecastHours({
      phases: FULL_TIMELINE_PHASES,
      integrations,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      pmPercent: 0,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualsByRowKey,
    });
    expect(result.error).toBeUndefined();
    expect(sumPlacedHours(result.rows)).toBe(89);
    expect(sumPlacedHours(result.rows) + actuals).toBe(estimated);
  });

  it("includes PM actuals in consumed hours", () => {
    const integrations = [{ key: "int-a", label: "A", estimatedEffortHours: 100 }];
    const actualsByRowKey = {
      "int-a": 40,
      [PM_FORECAST_ROW_KEY]: 3.2,
    };
    expect(sumActualsConsumedHours(integrations, actualsByRowKey)).toBe(44);

    const allocated = allocateTrackRemainingHours({
      integrations,
      pmPercent: 5,
      actualsByRowKey,
    });
    expect(allocated.projectRemaining).toBe(56);
  });
});

describe("computeEstimateVariance", () => {
  it("reports under, over, and on estimate", () => {
    expect(computeEstimateVariance({ estimated: 100, actuals: 20, forecastTotal: 70 })).toEqual({
      variance: 10,
      absHours: 10,
      kind: "under",
      label: "Under estimate by 10h",
    });
    expect(computeEstimateVariance({ estimated: 100, actuals: 20, forecastTotal: 90 })).toEqual({
      variance: -10,
      absHours: 10,
      kind: "over",
      label: "Over estimate by 10h",
    });
    expect(computeEstimateVariance({ estimated: 100, actuals: 40, forecastTotal: 60 }).kind).toBe(
      "on",
    );
  });
});

describe("applyForecastRowEdit (reserve-aware, no cross-week redistribute)", () => {
  const weeks = sundayWeeks("2025-01-05", 4);
  const current = weeks[0];

  it("draws from reserve on increase without changing other weeks", () => {
    const hoursByWeek = { [weeks[0]]: 10, [weeks[1]]: 10, [weeks[2]]: 10, [weeks[3]]: 0 };
    const result = applyForecastRowEdit({
      hoursByWeek,
      editedWeekStart: weeks[0],
      nextHours: 13,
      currentSundayWeek: current,
      weekStarts: weeks,
      reserveHours: 5,
      projectForecastTotal: 30,
      estimated: 40,
      actuals: 5,
    });
    expect(result.hoursByWeek[weeks[0]]).toBe(13);
    expect(result.hoursByWeek[weeks[1]]).toBe(10);
    expect(result.hoursByWeek[weeks[2]]).toBe(10);
    expect(result.reserveHours).toBe(2);
  });

  it("allows over estimate when reserve is empty", () => {
    const hoursByWeek = { [weeks[0]]: 10, [weeks[1]]: 10 };
    const result = applyForecastRowEdit({
      hoursByWeek,
      editedWeekStart: weeks[0],
      nextHours: 15,
      currentSundayWeek: current,
      weekStarts: weeks,
      reserveHours: 0,
      projectForecastTotal: 20,
      estimated: 20,
      actuals: 0,
    });
    expect(result.hoursByWeek[weeks[0]]).toBe(15);
    expect(result.hoursByWeek[weeks[1]]).toBe(10);
    expect(result.reserveHours).toBe(0);
    expect(
      computeEstimateVariance({
        estimated: 20,
        actuals: 0,
        forecastTotal: 25,
      }).kind,
    ).toBe("over");
  });

  it("returns freed hours to reserve when not over estimate", () => {
    const hoursByWeek = { [weeks[0]]: 10, [weeks[1]]: 10 };
    const result = applyForecastRowEdit({
      hoursByWeek,
      editedWeekStart: weeks[0],
      nextHours: 7,
      currentSundayWeek: current,
      weekStarts: weeks,
      reserveHours: 2,
      projectForecastTotal: 20,
      estimated: 25,
      actuals: 0,
    });
    expect(result.hoursByWeek[weeks[0]]).toBe(7);
    expect(result.hoursByWeek[weeks[1]]).toBe(10);
    expect(result.reserveHours).toBe(5);
  });

  it("does not add to reserve when decreasing while over estimate", () => {
    const hoursByWeek = { [weeks[0]]: 15, [weeks[1]]: 10 };
    const result = applyForecastRowEdit({
      hoursByWeek,
      editedWeekStart: weeks[0],
      nextHours: 12,
      currentSundayWeek: current,
      weekStarts: weeks,
      reserveHours: 0,
      projectForecastTotal: 25,
      estimated: 20,
      actuals: 0,
    });
    expect(result.hoursByWeek[weeks[0]]).toBe(12);
    expect(result.hoursByWeek[weeks[1]]).toBe(10);
    expect(result.reserveHours).toBe(0);
  });
});

describe("applyForecastProjectTotalEdit", () => {
  it("splits week across rows and draws from reserve", () => {
    const weeks = sundayWeeks("2025-01-05", 3);
    const hoursByRow = {
      "int-a": { [weeks[0]]: 6, [weeks[1]]: 4 },
      [PM_FORECAST_ROW_KEY]: { [weeks[0]]: 4, [weeks[1]]: 2 },
    };
    const result = applyForecastProjectTotalEdit({
      hoursByRow,
      rowKeys: ["int-a", PM_FORECAST_ROW_KEY],
      editedWeekStart: weeks[0],
      nextTotalHours: 14,
      currentSundayWeek: weeks[0],
      weekStarts: weeks,
      reserveHours: 5,
      estimated: 30,
      actuals: 0,
    });
    const week0 =
      (result.hoursByRow["int-a"][weeks[0]] ?? 0) +
      (result.hoursByRow[PM_FORECAST_ROW_KEY][weeks[0]] ?? 0);
    expect(week0).toBe(14);
    expect(result.hoursByRow["int-a"][weeks[1]]).toBe(4);
    expect(result.reserveHours).toBe(1);
  });
});

describe("forecastStartModeFromStartDate", () => {
  it("maps next-week Sunday to next_week", () => {
    expect(forecastStartModeFromStartDate("2025-01-12", "2025-01-08")).toBe("next_week");
    expect(forecastStartModeFromStartDate("2025-01-05", "2025-01-08")).toBe("this_week");
  });
});

describe("buildForecastPhaseWeekSegments", () => {
  it("groups contiguous weeks by overlapping phase and inserts dividers at boundaries", () => {
    const weeks = sundayWeeks("2025-01-05", 8);
    const phases = [
      { phase_key: "plan", start_date: "2025-01-05", end_date: "2025-01-18" },
      { phase_key: "test", start_date: "2025-01-19", end_date: "2025-02-08" },
      { phase_key: "deploy", start_date: "2025-02-09", end_date: "2025-03-01" },
    ];
    const segs = buildForecastPhaseWeekSegments(weeks, phases);
    expect(segs.map((s) => s.label)).toEqual(["Plan", "Test", "Deploy"]);
    expect(segs[0].weeks).toHaveLength(2);
    expect(segs[1].weeks).toHaveLength(3);
    expect(segs[2].weeks).toHaveLength(3);
  });
});
