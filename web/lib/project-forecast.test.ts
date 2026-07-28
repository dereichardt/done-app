import { describe, expect, it } from "vitest";
import {
  actualsWithLockedForecastHours,
  allocateSparseOrLargestRemainder,
  applyForecastRowEdit,
  buildForecastPhaseWeekSegments,
  computeEstimateVariance,
  diffForecastCells,
  formatSignedVarianceHours,
  generateForecastHours,
  phaseSpreadShapeFactor,
  sumActualsConsumedHours,
  sumEstimatedRoundedHours,
} from "@/lib/project-forecast";
import { DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE } from "@/lib/user-preferences";

const PHASES = [
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

const INTEGRATIONS = [
  { key: "int-a", label: "A", estimatedEffortHours: 100 },
  { key: "int-b", label: "B", estimatedEffortHours: 40.4 },
];

function generatedTotal(hoursByWeek: Record<string, number>): number {
  return Object.values(hoursByWeek).reduce((sum, hours) => sum + hours, 0);
}

describe("project-level forecast helpers", () => {
  it("sums integration estimates but rounds actuals once for the project", () => {
    expect(sumEstimatedRoundedHours(INTEGRATIONS)).toBe(140);
    expect(sumActualsConsumedHours(10.1 + 3.2)).toBe(14);
  });

  it("spaces sparse whole hours across a long timeline", () => {
    expect(
      allocateSparseOrLargestRemainder(3, Array.from({ length: 10 }, () => 1)),
    ).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("keeps even shape flat and bell shape phase-aware", () => {
    expect(phaseSpreadShapeFactor("test", 0.2, "even")).toBe(1);
    expect(phaseSpreadShapeFactor("test", 0.2, "bell")).toBeGreaterThan(
      phaseSpreadShapeFactor("test", 0.9, "bell"),
    );
  });

  it("reports project estimate variance", () => {
    expect(computeEstimateVariance({ estimated: 100, actuals: 20, forecastTotal: 70 }))
      .toMatchObject({ variance: 10, kind: "under" });
    expect(computeEstimateVariance({ estimated: 100, actuals: 20, forecastTotal: 90 }))
      .toMatchObject({ variance: -10, kind: "over" });
  });

  it("formats signed estimate variance hours", () => {
    expect(formatSignedVarianceHours(10)).toBe("+10h");
    expect(formatSignedVarianceHours(-10)).toBe("\u221210h");
    expect(formatSignedVarianceHours(0)).toBe("0h");
    expect(formatSignedVarianceHours(-3, (h) => `${h} hrs`)).toBe("\u22123 hrs");
  });
});

describe("project-level generation", () => {
  it("creates one weekly project forecast whose total matches remaining effort", () => {
    const result = generateForecastHours({
      phases: PHASES,
      integrations: INTEGRATIONS,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualHours: 10.1,
    });

    expect(result.error).toBeUndefined();
    expect(generatedTotal(result.hoursByWeek)).toBe(129);
    expect(result.reserveHours).toBe(0);
  });

  it("uses a single aggregate actual rounding boundary", () => {
    const result = generateForecastHours({
      phases: PHASES,
      integrations: INTEGRATIONS,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualHours: 13.3,
    });

    expect(generatedTotal(result.hoursByWeek)).toBe(126);
  });

  it("preserves locked project weeks and subtracts them from remaining effort", () => {
    const result = generateForecastHours({
      phases: PHASES,
      integrations: INTEGRATIONS,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2025-01-08",
      actualHours: 10,
      lockedWeekStarts: ["2025-01-19"],
      lockedHoursByWeek: { "2025-01-19": 20 },
    });

    expect(result.hoursByWeek["2025-01-19"]).toBe(20);
    expect(generatedTotal(result.hoursByWeek)).toBe(130);
  });

  it("treats the current week as committed when regeneration starts next week", () => {
    const committed = actualsWithLockedForecastHours({
      actualHours: 10.2,
      lockedWeekStarts: [],
      lockedHoursByWeek: { "2025-01-05": 8 },
      currentSunday: "2025-01-05",
      forecastStartDate: "2025-01-12",
    });
    expect(sumActualsConsumedHours(committed)).toBe(19);
  });

  it("holds elapsed-stage hours as reserve unless explicitly included", () => {
    const base = {
      phases: PHASES,
      integrations: INTEGRATIONS,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      startMode: "this_week" as const,
      spreadMode: "even" as const,
      todayIso: "2025-03-19",
      actualHours: 0,
    };
    const held = generateForecastHours({ ...base, includePastPhaseHours: false });
    const included = generateForecastHours({ ...base, includePastPhaseHours: true });

    expect(held.reserveHours).toBeGreaterThan(0);
    expect(generatedTotal(held.hoursByWeek) + held.reserveHours).toBe(140);
    expect(included.reserveHours).toBe(0);
    expect(generatedTotal(included.hoursByWeek)).toBe(140);
  });
});

describe("project-level edits", () => {
  it("edits one weekly value and draws from reserve", () => {
    const weeks = ["2025-01-05", "2025-01-12"];
    const result = applyForecastRowEdit({
      hoursByWeek: { [weeks[0]]: 10, [weeks[1]]: 10 },
      editedWeekStart: weeks[0],
      nextHours: 15,
      currentSundayWeek: weeks[0],
      weekStarts: weeks,
      reserveHours: 8,
      projectForecastTotal: 20,
      estimated: 30,
      actuals: 0,
    });

    expect(result.hoursByWeek).toEqual({ [weeks[0]]: 15, [weeks[1]]: 10 });
    expect(result.reserveHours).toBe(3);
  });

  it("diffs flat project-week maps", () => {
    expect(
      diffForecastCells(
        { "2025-01-05": 10, "2025-01-12": 5 },
        { "2025-01-05": 12 },
      ),
    ).toEqual([
      { weekStartDate: "2025-01-05", hours: 12 },
      { weekStartDate: "2025-01-12", hours: 0 },
    ]);
  });
});

describe("phase headers", () => {
  it("groups the shared week axis into timeline stages", () => {
    const weeks = ["2025-01-05", "2025-01-12", "2025-01-19"];
    const segments = buildForecastPhaseWeekSegments(weeks, PHASES);
    expect(segments.map((segment) => segment.label)).toEqual([
      "Plan",
      "A&C",
    ]);
  });
});
