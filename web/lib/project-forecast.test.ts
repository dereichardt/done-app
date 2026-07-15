import { describe, expect, it } from "vitest";
import {
  allocateSparseOrLargestRemainder,
  buildForecastPhaseWeekSegments,
  forecastBankWeekStarts,
  forecastStartModeFromStartDate,
  generateForecastHours,
  phaseSpreadShapeFactor,
  redistributeForecastAfterEdit,
  spreadRemainingAcrossWeeks,
  summarizeBankHourDelta,
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

describe("forecastBankWeekStarts + bank placement", () => {
  const weeks = sundayWeeks("2025-01-05", 20);
  // Plan W0-1, A&C W2-10, Test W11-14, Deploy W15-16, Hypercare W17-19
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
    // Last Hypercare-overlap Sunday is on/before hypercare end (2025-05-17).
    expect(bank.at(-1)).toBe("2025-05-11");
  });

  it("places all banked hours on the last Hypercare week", () => {
    // Start mid-A&C so Plan is banked
    const writable = weeks.slice(4);
    const result = spreadRemainingAcrossWeeks({
      remaining: 100,
      writableWeeks: writable,
      phases,
      deploymentEffortByPhase: DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
      spreadMode: "even",
    });
    expect(result.bankedHours).toBeGreaterThan(0);
    const lastBank = result.bankWeekStarts[result.bankWeekStarts.length - 1];
    // Bank hours alone may share the last week with active hypercare native share —
    // at least the last bank week must hold >= bankedHours from the bank lump.
    expect(result.hoursByWeekYmd[lastBank] ?? 0).toBeGreaterThanOrEqual(result.bankedHours);
    const bankHeights = result.bankWeekStarts.map((w) => result.hoursByWeekYmd[w] ?? 0);
    expect(Math.max(...bankHeights)).toBe(bankHeights[bankHeights.length - 1]);
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
    // Test spans first full week + partial last — under day-weights, edges would skew;
    // even mode should stay nearly flat across overlapping weeks.
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

describe("summarizeBankHourDelta", () => {
  it("reports hours drawn from bank and the last changed bank week", () => {
    const weeks = sundayWeeks("2025-01-05", 6);
    const bank = weeks.slice(4);
    const before = { [bank[0]]: 5, [bank[1]]: 20 };
    const after = { [bank[0]]: 5, [bank[1]]: 15 };
    const summary = summarizeBankHourDelta(before, after, bank);
    expect(summary.drawnFromBank).toBe(5);
    expect(summary.returnedToBank).toBe(0);
    expect(summary.focusWeek).toBe(bank[1]);
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
    // Plan W0-1, Test W2-4, Deploy W5-7
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
