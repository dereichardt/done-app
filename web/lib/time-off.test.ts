import { describe, expect, it } from "vitest";

import { paceHoursPerWeekWeighted } from "@/lib/fiscal-quarter";
import {
  countTimeOffWeekdaysInRange,
  timeOffHoursPerDay,
  weekCapacityAfterTimeOff,
  weekTargetsAfterTimeOff,
  workingWeekdayWeight,
} from "@/lib/time-off";
import { parseWeeklyCapacityHours } from "@/lib/user-preferences";
import { synthesizeCapacityGaps } from "@/lib/home-capacity-gaps";

describe("timeOffHoursPerDay", () => {
  it("deducts weekly capacity ÷ 5 (rounded to 0.25h)", () => {
    expect(timeOffHoursPerDay(32)).toBe(6.5); // 32/5 = 6.4 → 6.5 at quarter-hours
    expect(timeOffHoursPerDay(40)).toBe(8);
    expect(timeOffHoursPerDay(30)).toBe(6);
  });
});

describe("workingWeekdayWeight", () => {
  it("subtracts time-off weekdays and floors at 0", () => {
    expect(workingWeekdayWeight(5, 1)).toBe(4);
    expect(workingWeekdayWeight(5, 5)).toBe(0);
    expect(workingWeekdayWeight(5, 6)).toBe(0);
    expect(workingWeekdayWeight(3, 1)).toBe(2);
  });
});

describe("pace with time off day weights", () => {
  it("scales a full week with one day off to 4/5 of preferred", () => {
    // Target equals one reduced week so leftover redistribution does not kick in.
    const pace = paceHoursPerWeekWeighted(25.5, [4], 32);
    expect(pace[0]).toBe(25.5); // 32 * 4/5 → 25.5 at quarter-hours
  });

  it("zeros pace for a fully off week", () => {
    const pace = paceHoursPerWeekWeighted(64, [0, 5, 5], 32);
    expect(pace[0]).toBe(0);
    expect(pace[1]).toBe(32);
    expect(pace[2]).toBe(32);
  });
});

describe("countTimeOffWeekdaysInRange", () => {
  it("counts only weekdays present in the set", () => {
    // Week of Sun Aug 2 2026: Mon 3 – Fri 7
    const start = new Date(2026, 7, 2);
    const end = new Date(2026, 7, 9);
    const off = new Set(["2026-08-03", "2026-08-05", "2026-08-08"]); // Mon, Wed, Sat
    expect(countTimeOffWeekdaysInRange(start, end, off)).toBe(2);
  });
});

describe("weekTargetsAfterTimeOff", () => {
  it("reduces weekly target proportionally", () => {
    const targets = weekTargetsAfterTimeOff({
      weekStarts: ["2026-08-02"],
      weeklyCapacityHours: 32,
      timeOffYmds: new Set(["2026-08-03", "2026-08-04"]), // Mon + Tue
    });
    // 32 * 3/5 = 19.2 → 19.25 at quarter-hours
    expect(targets["2026-08-02"]).toBe(19.25);
  });

  it("zeros capacity for a full week of time off", () => {
    const targets = weekTargetsAfterTimeOff({
      weekStarts: ["2026-08-02"],
      weeklyCapacityHours: 32,
      timeOffYmds: new Set([
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
      ]),
    });
    expect(targets["2026-08-02"]).toBe(0);
  });
});

describe("home capacity with time-off week targets", () => {
  it("shows no free hours when week is fully off and forecast is zero", () => {
    const result = synthesizeCapacityGaps({
      weekHours: {
        "2026-07-19": 0,
        "2026-07-26": 0,
        "2026-08-02": 20,
        "2026-08-09": 20,
      },
      weekStarts: ["2026-07-19", "2026-07-26", "2026-08-02", "2026-08-09"],
      currentSundayYmd: "2026-07-12",
      quarterLabel: "FY27 Q2",
      targetHours: 32,
      weekTargets: {
        "2026-07-19": 0,
        "2026-07-26": 0,
        "2026-08-02": 32,
        "2026-08-09": 32,
      },
    });
    // First two weeks: target 0, forecast 0 → freeHours 0 (not open capacity)
    expect(result.weeks[0]!.freeHours).toBe(0);
    expect(result.weeks[1]!.freeHours).toBe(0);
    // Later weeks under target → pocket starting Aug 2
    expect(result.freeStartingWeek).toBe("2026-08-02");
  });

  it("does not invent availability for zeroed-off weeks alone", () => {
    const result = synthesizeCapacityGaps({
      weekHours: {
        "2026-07-19": 0,
        "2026-07-26": 0,
      },
      weekStarts: ["2026-07-19", "2026-07-26"],
      currentSundayYmd: "2026-07-12",
      quarterLabel: "FY27 Q2",
      weekTargets: {
        "2026-07-19": 0,
        "2026-07-26": 0,
      },
    });
    // No forecast anywhere → empty-state copy (no pockets)
    expect(result.pockets).toHaveLength(0);
    expect(result.freeStartingWeek).toBeNull();
    expect(result.body).toMatch(/No forecast hours/);
  });
});

describe("parseWeeklyCapacityHours", () => {
  it("accepts quarter-hour values in range", () => {
    expect(parseWeeklyCapacityHours(32)).toBe(32);
    expect(parseWeeklyCapacityHours("40")).toBe(40);
    expect(parseWeeklyCapacityHours("32.25")).toBe(32.25);
  });

  it("rejects out of range", () => {
    expect(parseWeeklyCapacityHours(0)).toBeNull();
    expect(parseWeeklyCapacityHours(81)).toBeNull();
    expect(parseWeeklyCapacityHours("abc")).toBeNull();
  });
});

describe("weekCapacityAfterTimeOff", () => {
  it("matches preferred × workingDays/5", () => {
    expect(weekCapacityAfterTimeOff(32, 5)).toBe(32);
    expect(weekCapacityAfterTimeOff(32, 0)).toBe(0);
    expect(weekCapacityAfterTimeOff(32, 4)).toBe(25.5);
  });
});
